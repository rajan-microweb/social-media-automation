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

    // Get Instagram integration (which uses Facebook token)
    const { data: integration, error: intError } = await supabase
      .from("platform_integrations")
      .select("credentials")
      .eq("user_id", user_id)
      .eq("platform_name", "instagram")
      .eq("status", "active")
      .maybeSingle();

    if (intError || !integration) {
      return new Response(JSON.stringify({ error: "Instagram integration not found" }), {
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

    // Fetch Facebook pages first
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?fields=id,name,access_token&access_token=${accessToken}`
    );

    const pagesData = await pagesResponse.json();

    if (pagesData.error) {
      return new Response(JSON.stringify({ error: pagesData.error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For each page, get linked Instagram business account
    const accounts: any[] = [];
    for (const page of pagesData.data || []) {
      const igResponse = await fetch(
        `https://graph.facebook.com/v18.0/${page.id}?fields=instagram_business_account{id,username,profile_picture_url}&access_token=${page.access_token}`
      );

      const igData = await igResponse.json();
      
      if (igData.instagram_business_account) {
        accounts.push({
          ig_business_id: igData.instagram_business_account.id,
          ig_username: igData.instagram_business_account.username,
          profile_picture_url: igData.instagram_business_account.profile_picture_url,
          connected_page_id: page.id,
          connected_page_name: page.name,
        });
      }
    }

    return new Response(JSON.stringify({ accounts }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in proxy-instagram-fetch-accounts:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
