import { corsHeaders } from "../_shared/encryption.ts";

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { accessToken, appId, appSecret } = await req.json();

    if (!accessToken || !appId || !appSecret) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: accessToken, appId, appSecret" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Exchange short-lived token for long-lived token via Facebook Graph API
    const exchangeUrl = `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(accessToken)}`;

    console.log("Exchanging token with Facebook Graph API...");
    
    const response = await fetch(exchangeUrl);
    const data = await response.json();

    if (data.error) {
      console.error("Facebook token exchange error:", data.error);
      return new Response(
        JSON.stringify({ 
          error: data.error.message || "Token exchange failed",
          details: data.error 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!data.access_token) {
      console.error("No access token in response:", data);
      return new Response(
        JSON.stringify({ error: "No access token received from Facebook" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Token exchanged successfully, expires_in:", data.expires_in);

    // Return the long-lived token details
    return new Response(
      JSON.stringify({
        access_token: data.access_token,
        expires_in: data.expires_in,
        token_type: data.token_type || "bearer",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Token exchange error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
