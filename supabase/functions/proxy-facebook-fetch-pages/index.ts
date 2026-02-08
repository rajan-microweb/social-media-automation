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
      "facebook"
    );

    if (credError || !credentials || !integration) {
      return jsonResponse(errorResponse(credError || "Facebook integration not found"), 404);
    }

    // Support both snake_case and camelCase key formats
    const accessToken = (credentials.access_token || credentials.accessToken) as string;
    if (!accessToken) {
      return jsonResponse(errorResponse("No access token found"), 400);
    }

    // Fetch pages
    console.log("[facebook] Fetching pages...");
    const response = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?fields=id,name,access_token,picture{url}&access_token=${accessToken}`
    );

    const data = await response.json();

    if (data.error) {
      console.error("[facebook] API error:", data.error.message);
      return jsonResponse(errorResponse(data.error.message), 400);
    }

    // Store page tokens securely - map tokens by page_id
    const pageTokens: Record<string, string> = {};
    const pages = (data.data || []).map((page: { id: string; name: string; access_token: string; picture?: { data?: { url?: string } } }) => {
      pageTokens[page.id] = page.access_token;
      // Return only non-sensitive data
      return {
        page_id: page.id,
        page_name: page.name,
        picture_url: page.picture?.data?.url || null,
      };
    });

    console.log(`[facebook] Found ${pages.length} pages`);

    // Update credentials with page tokens stored securely
    const updatedCredentials = {
      ...credentials,
      page_tokens: pageTokens,
    };

    await updatePlatformCredentials(supabase, integration.id, updatedCredentials);

    // Store page details (non-sensitive) in metadata column
    const metadata = {
      pages,
      last_synced: new Date().toISOString(),
    };
    
    await updatePlatformMetadata(supabase, integration.id, metadata);
    console.log("[facebook] Metadata updated with page details");

    // Return only non-sensitive page info - NO tokens
    return jsonResponse(successResponse({ pages }));
  } catch (error) {
    console.error("Error in proxy-facebook-fetch-pages:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(errorResponse(message), 500);
  }
});
