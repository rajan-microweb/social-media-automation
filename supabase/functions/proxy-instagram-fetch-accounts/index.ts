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
      "instagram"
    );

    if (credError || !credentials || !integration) {
      return jsonResponse(errorResponse(credError || "Instagram integration not found"), 404);
    }

    // Support both snake_case and camelCase key formats
    const accessToken = (credentials.access_token || credentials.accessToken) as string;
    if (!accessToken) {
      return jsonResponse(errorResponse("No access token found"), 400);
    }

    // Fetch Facebook pages first
    console.log("[instagram] Fetching Facebook pages...");
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?fields=id,name,access_token&access_token=${accessToken}`
    );

    const pagesData = await pagesResponse.json();

    if (pagesData.error) {
      console.error("[instagram] Facebook API error:", pagesData.error.message);
      return jsonResponse(errorResponse(pagesData.error.message), 400);
    }

    // Store page tokens for future use
    const pageTokens: Record<string, string> = {};
    
    // For each page, get linked Instagram business account
    const accounts: Array<{
      ig_business_id: string;
      ig_username: string;
      profile_picture_url: string | null;
      connected_page_id: string;
      connected_page_name: string;
    }> = [];

    for (const page of pagesData.data || []) {
      // Store page token
      pageTokens[page.id] = page.access_token;
      
      console.log(`[instagram] Checking page: ${page.name}`);
      const igResponse = await fetch(
        `https://graph.facebook.com/v18.0/${page.id}?fields=instagram_business_account{id,username,profile_picture_url}&access_token=${page.access_token}`
      );

      const igData = await igResponse.json();
      
      if (igData.instagram_business_account) {
        accounts.push({
          ig_business_id: igData.instagram_business_account.id,
          ig_username: igData.instagram_business_account.username,
          profile_picture_url: igData.instagram_business_account.profile_picture_url || null,
          connected_page_id: page.id,
          connected_page_name: page.name,
        });
      }
    }

    console.log(`[instagram] Found ${accounts.length} Instagram business accounts`);

    // Update credentials with page tokens stored securely
    const updatedCredentials = {
      ...credentials,
      page_tokens: pageTokens,
    };

    await updatePlatformCredentials(supabase, integration.id, updatedCredentials);

    // Store account details (non-sensitive) in metadata column
    const metadata = {
      accounts,
      last_synced: new Date().toISOString(),
    };
    
    await updatePlatformMetadata(supabase, integration.id, metadata);
    console.log("[instagram] Metadata updated with account details");

    return jsonResponse(successResponse({ accounts }));
  } catch (error) {
    console.error("Error in proxy-instagram-fetch-accounts:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(errorResponse(message), 500);
  }
});
