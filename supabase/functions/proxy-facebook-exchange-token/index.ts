import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { safeDecryptCredentials, encryptCredentials } from "../_shared/encryption.ts";

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

    const { user_id, short_lived_token } = await req.json();

    if (!user_id || !short_lived_token) {
      return new Response(JSON.stringify({ error: "Missing user_id or short_lived_token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get Facebook app credentials from metadata or env
    const { data: integration } = await supabase
      .from("platform_integrations")
      .select("metadata")
      .eq("user_id", user_id)
      .eq("platform_name", "facebook")
      .maybeSingle();

    const appId = integration?.metadata?.app_id || Deno.env.get("FACEBOOK_APP_ID");
    const appSecret = integration?.metadata?.app_secret || Deno.env.get("FACEBOOK_APP_SECRET");

    if (!appId || !appSecret) {
      return new Response(JSON.stringify({ error: "Facebook app credentials not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Exchange for long-lived token
    const exchangeUrl = `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${short_lived_token}`;
    
    const response = await fetch(exchangeUrl);
    const data = await response.json();

    if (data.error) {
      return new Response(JSON.stringify({ error: data.error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ 
      access_token: data.access_token,
      expires_in: data.expires_in,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in proxy-facebook-exchange-token:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
