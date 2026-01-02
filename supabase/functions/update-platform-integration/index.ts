import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

// Rate limiting
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_WINDOW_MS = 60000;

function checkRateLimit(clientId: string): boolean {
  const now = Date.now();
  const record = rateLimitStore.get(clientId);

  if (!record || now > record.resetTime) {
    rateLimitStore.set(clientId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }

  record.count++;
  return true;
}

// Whitelist schema for platform integration updates
const updatePlatformIntegrationSchema = z.object({
  platform_name: z.enum(["linkedin", "instagram", "youtube", "twitter", "openai", "facebook", "threads"]),
  user_id: z.string().uuid(),
  updates: z
    .object({
      credentials: z
        .record(z.unknown())
        .refine((val) => JSON.stringify(val).length <= 50000, { message: "Credentials object too large" })
        .optional(),
      status: z.enum(["active", "inactive", "expired"]).optional(),
    })
    .strict(),
});


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // API Key authentication
    const apiKey = req.headers.get("x-api-key");
    const expectedApiKey = Deno.env.get("N8N_API_KEY");

    if (!apiKey || apiKey !== expectedApiKey) {
      console.error("Invalid or missing API key");
      return new Response(JSON.stringify({ error: "Unauthorized - Invalid API key" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limiting by client IP
    const clientIp = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";
    if (!checkRateLimit(clientIp)) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again later." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // Create service client for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();

    // Validate input data
    const validationResult = updatePlatformIntegrationSchema.safeParse(body);
    if (!validationResult.success) {
      console.error("Validation error:", validationResult.error.errors);
      return new Response(JSON.stringify({ error: "Invalid input data", details: validationResult.error.errors }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { platform_name, user_id, updates } = validationResult.data;

    console.info("Updating platform integration:", { platform_name, user_id, updates });

    // First, fetch existing credentials to merge with updates
    const { data: existingData, error: fetchError } = await supabase
      .from("platform_integrations")
      .select("credentials")
      .eq("platform_name", platform_name)
      .eq("user_id", user_id)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error("Error fetching existing credentials:", fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const existingCredentials = existingData?.credentials || {};
    console.info("Existing credentials keys:", Object.keys(existingCredentials));

    // Build update data - MERGE credentials instead of replacing
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      credentials_encrypted: true, // Skip encryption trigger, store as plain JSON
    };

    // Merge: incoming credentials are merged with existing ones (incoming values take priority)
    if (updates.credentials) {
      // Deep merge for nested objects like personal_info and company_info
      const mergedCredentials = {
        ...existingCredentials,
        ...updates.credentials,
      };
      
      // Preserve tokens if not provided in updates
      if (!updates.credentials.access_token && existingCredentials.access_token) {
        mergedCredentials.access_token = existingCredentials.access_token;
      }
      if (!updates.credentials.refresh_token && existingCredentials.refresh_token) {
        mergedCredentials.refresh_token = existingCredentials.refresh_token;
      }
      if (!updates.credentials.expires_at && existingCredentials.expires_at) {
        mergedCredentials.expires_at = existingCredentials.expires_at;
      }
      if (!updates.credentials.scope && existingCredentials.scope) {
        mergedCredentials.scope = existingCredentials.scope;
      }
      
      updateData.credentials = mergedCredentials;
      console.info("Merged credentials keys:", Object.keys(mergedCredentials));
      console.info("Has access_token:", !!mergedCredentials.access_token);
      console.info("Has refresh_token:", !!mergedCredentials.refresh_token);
    }

    // Add status if provided
    if (updates.status) {
      updateData.status = updates.status;
    }

    console.info("Update data being sent:", JSON.stringify(updateData, null, 2));

    // Update only for provided user_id
    const { data, error } = await supabase
      .from("platform_integrations")
      .update(updateData)
      .eq("platform_name", platform_name)
      .eq("user_id", user_id)
      .select()
      .single();

    if (error) {
      console.error("Database error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!data) {
      return new Response(JSON.stringify({ error: "Platform integration not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.info("Platform integration updated successfully:", data);

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
