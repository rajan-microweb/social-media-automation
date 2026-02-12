import {
  corsHeaders,
  jsonResponse,
  successResponse,
  errorResponse,
  validateApiKey,
  createSupabaseClient,
  getDecryptedPlatformCredentials,
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
    const { credentials, error: credError } = await getDecryptedPlatformCredentials(
      supabase,
      user_id,
      "openai"
    );

    if (credError || !credentials) {
      return jsonResponse(successResponse({
        valid: false,
        message: credError || "OpenAI integration not found",
      }));
    }

    const openaiKey = (credentials.api_key || credentials.apiKey) as string;
    if (!openaiKey) {
      return jsonResponse(successResponse({
        valid: false,
        message: "No OpenAI API key found",
      }));
    }

    // Validate the stored OpenAI key
    console.log("[openai] Validating API key...");
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${openaiKey}` },
    });

    if (!response.ok) {
      console.log("[openai] API key validation failed:", response.status);
      return jsonResponse(successResponse({
        valid: false,
        message: "Stored OpenAI API key is invalid or expired",
      }));
    }

    console.log("[openai] API key is valid");

    // Return only validation status - NO credentials
    return jsonResponse(successResponse({
      valid: true,
      message: "OpenAI API key is valid",
    }));
  } catch (error) {
    console.error("Error in proxy-validate-openai:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(errorResponse(message), 500);
  }
});
