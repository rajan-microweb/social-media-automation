import {
  corsHeaders,
  jsonResponse,
  successResponse,
  errorResponse,
  validateApiKey,
  createSupabaseClient,
  getDecryptedPlatformCredentials,
  updatePlatformCredentials,
  updatePlatformMetadata,
} from "../_shared/encryption.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate API key
    const authResult = validateApiKey(req);
    if (!authResult.valid) {
      return jsonResponse(errorResponse(authResult.error!), 401);
    }

    // Parse request
    const { user_id } = await req.json();
    if (!user_id) {
      return jsonResponse(errorResponse("Missing user_id"), 400);
    }

    // Get decrypted credentials
    const supabase = createSupabaseClient();
    const { credentials, integration, error: credError } = await getDecryptedPlatformCredentials(
      supabase,
      user_id,
      "linkedin"
    );

    if (credError || !credentials || !integration) {
      return jsonResponse(errorResponse(credError || "LinkedIn integration not found"), 404);
    }

    // Support both camelCase and snake_case
    const refreshToken = (credentials.refresh_token || credentials.refreshToken) as string;
    if (!refreshToken) {
      return jsonResponse(errorResponse("No refresh token found"), 400);
    }

    // Get OAuth client credentials from metadata or env
    const metadata = integration.metadata as Record<string, unknown> | null;
    const clientId = (metadata?.client_id as string) || Deno.env.get("LINKEDIN_CLIENT_ID");
    const clientSecret = (metadata?.client_secret as string) || Deno.env.get("LINKEDIN_CLIENT_SECRET");

    if (!clientId || !clientSecret) {
      return jsonResponse(errorResponse("LinkedIn OAuth credentials not configured"), 400);
    }

    // Refresh the token
    console.log("[linkedin] Refreshing access token...");
    const response = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error("[linkedin] Token refresh error:", data.error_description || data.error);
      return jsonResponse(errorResponse(data.error_description || data.error), 400);
    }

     // Calculate expiration timestamps
     // Access token: reset to 60 days from now (each refresh extends it)
     const now = new Date();
     const accessExpiresAt = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString();
     
     // Refresh token: keep the original expiration date (365 days from initial connection)
     // Don't change refresh_token_expires_at on refresh - it's based on connection time
     const refreshTokenExpiresAt = credentials.refresh_token_expires_at as string;

     // Update credentials with new access token
     const updatedCredentials = {
       ...credentials,
       access_token: data.access_token,
       expires_at: accessExpiresAt,
       // Update refresh token if LinkedIn issues a new one
       refresh_token: data.refresh_token || refreshToken,
       refresh_token_expires_at: refreshTokenExpiresAt,
     };

     const updateResult = await updatePlatformCredentials(supabase, integration.id, updatedCredentials);
     
     if (!updateResult.success) {
       return jsonResponse(errorResponse("Failed to store refreshed token"), 500);
     }

     // Also update metadata with expiration timestamps (for UI display)
     const currentMetadata = (integration.metadata as Record<string, unknown>) || {};
     const updatedMetadata = {
       ...currentMetadata,
       expires_at: accessExpiresAt,
       access_token_expires_at: accessExpiresAt,
       refresh_token_expires_at: refreshTokenExpiresAt,
     };
     
     await updatePlatformMetadata(supabase, integration.id, updatedMetadata);

     console.log("[linkedin] Token refreshed successfully");

     // Return only success status - NO credentials
     return jsonResponse(successResponse({
       message: "Token refreshed and stored securely",
       expires_in: 60 * 24 * 60 * 60, // 60 days in seconds
       expires_at: accessExpiresAt,
     }));
  } catch (error) {
    console.error("Error in proxy-linkedin-refresh-token:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(errorResponse(message), 500);
  }
});
