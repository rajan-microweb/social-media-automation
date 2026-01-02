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

// Helper function to append credentials - arrays get new items appended
function appendCredentials(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...existing };

  for (const [key, value] of Object.entries(incoming)) {
    if (Array.isArray(value) && Array.isArray(existing[key])) {
      // Simply append new items to existing array
      result[key] = [...(existing[key] as unknown[]), ...value];
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value) && 
               existing[key] && typeof existing[key] === 'object' && !Array.isArray(existing[key])) {
      // Recursively handle nested objects
      result[key] = appendCredentials(existing[key] as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      // Override primitive values or add new keys
      result[key] = value;
    }
  }

  return result;
}

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

    // First, fetch existing credentials to merge with new ones
    const { data: existingData, error: fetchError } = await supabase
      .from("platform_integrations")
      .select("credentials")
      .eq("platform_name", platform_name)
      .eq("user_id", user_id)
      .maybeSingle();

    if (fetchError) {
      console.error("Error fetching existing credentials:", fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build update data with proper structure
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      credentials_encrypted: true, // Skip encryption trigger, store as plain JSON
    };

    // Append credentials if provided - combine existing with new
    if (updates.credentials) {
      const existingCredentials = existingData?.credentials || {};
      // Append new items to arrays, override primitives
      const appendedCredentials = appendCredentials(existingCredentials as Record<string, unknown>, updates.credentials);
      updateData.credentials = appendedCredentials;
      console.info("Appended credentials:", JSON.stringify(appendedCredentials, null, 2));
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
