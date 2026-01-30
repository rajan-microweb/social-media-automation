import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { safeDecryptCredentials } from "../_shared/encryption.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = req.headers.get("x-api-key");
    const expectedKey = Deno.env.get("N8N_API_KEY");
    
    if (!apiKey || apiKey !== expectedKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get LinkedIn integration
    const { data: integration, error: intError } = await supabase
      .from("platform_integrations")
      .select("credentials")
      .eq("user_id", user_id)
      .eq("platform_name", "linkedin")
      .eq("status", "active")
      .maybeSingle();

    if (intError || !integration) {
      return new Response(JSON.stringify({ error: "LinkedIn integration not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const credentials = await safeDecryptCredentials(integration.credentials);
    const accessToken = credentials.access_token as string;

    if (!accessToken) {
      return new Response(JSON.stringify({ error: "No access token found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch user profile
    const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    let personalInfo = null;
    if (profileRes.ok) {
      const profile = await profileRes.json();
      personalInfo = {
        linkedin_id: profile.sub,
        name: profile.name,
        email: profile.email,
        picture: profile.picture,
      };
    }

    // Fetch organizations
    const orgsRes = await fetch(
      "https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organization~(id,localizedName,logoV2(original~:playableStreams))))",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-Restli-Protocol-Version": "2.0.0",
        },
      }
    );

    const organizations: any[] = [];
    if (orgsRes.ok) {
      const orgsData = await orgsRes.json();
      for (const element of orgsData.elements || []) {
        const org = element["organization~"];
        if (org) {
          organizations.push({
            company_id: org.id,
            company_name: org.localizedName,
            logo_url: org.logoV2?.["original~"]?.elements?.[0]?.identifiers?.[0]?.identifier,
          });
        }
      }
    }

    return new Response(JSON.stringify({ 
      personal_info: personalInfo, 
      organizations 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in proxy-linkedin-fetch-orgs:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
