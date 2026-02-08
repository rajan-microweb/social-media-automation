import {
  corsHeaders,
  jsonResponse,
  successResponse,
  errorResponse,
  validateApiKey,
  createSupabaseClient,
  getDecryptedPlatformCredentials,
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

    // Support both snake_case and camelCase key formats
    const accessToken = (credentials.access_token || credentials.accessToken) as string;
    if (!accessToken) {
      console.error("No access_token in credentials. Keys available:", Object.keys(credentials));
      return jsonResponse(errorResponse("No access token found"), 400);
    }

    // Fetch user profile
    console.log("[linkedin] Fetching user profile...");
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
      console.log("[linkedin] Profile fetched:", personalInfo.name);
    } else {
      console.warn("[linkedin] Profile fetch failed:", profileRes.status);
    }

    // Fetch organizations
    console.log("[linkedin] Fetching organizations...");
    const orgsRes = await fetch(
      "https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organization~(id,localizedName,logoV2(original~:playableStreams))))",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-Restli-Protocol-Version": "2.0.0",
        },
      }
    );

    const organizations: Array<{
      company_id: string;
      company_name: string;
      logo_url: string | null;
    }> = [];
    
    if (orgsRes.ok) {
      const orgsData = await orgsRes.json();
      for (const element of orgsData.elements || []) {
        const org = element["organization~"];
        if (org) {
          organizations.push({
            company_id: org.id,
            company_name: org.localizedName,
            logo_url: org.logoV2?.["original~"]?.elements?.[0]?.identifiers?.[0]?.identifier || null,
          });
        }
      }
      console.log(`[linkedin] Found ${organizations.length} organizations`);
    } else {
      console.warn("[linkedin] Organizations fetch failed:", orgsRes.status);
    }

    // Store account details in metadata column
    const metadata = {
      personal_info: personalInfo,
      organizations,
      last_synced: new Date().toISOString(),
    };
    
    await updatePlatformMetadata(supabase, integration.id, metadata);
    console.log("[linkedin] Metadata updated with account details");

    return jsonResponse(successResponse({
      personal_info: personalInfo,
      organizations,
    }));
  } catch (error) {
    console.error("Error in proxy-linkedin-fetch-orgs:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(errorResponse(message), 500);
  }
});
