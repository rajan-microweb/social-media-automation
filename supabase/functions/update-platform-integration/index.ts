import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

// ============== AES-256-GCM Encryption/Decryption ==============
async function encryptCredentials(plaintext: string): Promise<string> {
  const encryptionKey = Deno.env.get('ENCRYPTION_KEY');
  if (!encryptionKey) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }

  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const keyData = Uint8Array.from(atob(encryptionKey), c => c.charCodeAt(0));
  
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    encoder.encode(plaintext)
  );
  
  const ivBase64 = btoa(String.fromCharCode(...iv));
  const encryptedBase64 = btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer)));
  
  return `${ivBase64}:${encryptedBase64}`;
}

async function decryptCredentials(encryptedData: string): Promise<string> {
  const encryptionKey = Deno.env.get('ENCRYPTION_KEY');
  if (!encryptionKey) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }

  const [ivBase64, ciphertextBase64] = encryptedData.split(':');
  if (!ivBase64 || !ciphertextBase64) {
    throw new Error('Invalid encrypted data format');
  }
  
  const iv = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(ciphertextBase64), c => c.charCodeAt(0));
  const keyBytes = Uint8Array.from(atob(encryptionKey), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

function isEncrypted(value: unknown): boolean {
  return typeof value === 'string' && value.includes(':') && value.length > 50;
}

async function safeDecryptCredentials(credentials: unknown): Promise<Record<string, unknown>> {
  if (typeof credentials === 'object' && credentials !== null && !Array.isArray(credentials)) {
    return credentials as Record<string, unknown>;
  }
  
  if (typeof credentials === 'string' && isEncrypted(credentials)) {
    try {
      const decrypted = await decryptCredentials(credentials);
      return JSON.parse(decrypted);
    } catch (error) {
      console.error('Failed to decrypt credentials:', error);
      return {};
    }
  }
  
  if (typeof credentials === 'string') {
    try {
      return JSON.parse(credentials);
    } catch {
      return {};
    }
  }
  
  return {};
}
// ================================================================

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

    console.info("Updating platform integration:", { platform_name, user_id });

    // Build update data
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    // If credentials are being updated, we need to handle merging with existing
    if (updates.credentials) {
      // Fetch existing record to get current credentials
      const { data: existing, error: fetchError } = await supabase
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

      let existingCredentials: Record<string, unknown> = {};
      if (existing?.credentials) {
        existingCredentials = await safeDecryptCredentials(existing.credentials);
      }

      // Merge existing with new credentials (new takes precedence)
      const mergedCredentials = { ...existingCredentials, ...updates.credentials };
      
      // Encrypt the merged credentials
      const encryptedCredentials = await encryptCredentials(JSON.stringify(mergedCredentials));
      updateData.credentials = encryptedCredentials;
      updateData.credentials_encrypted = true;
      
      console.info("Credentials encrypted and merged successfully");
    }

    // Add status if provided
    if (updates.status) {
      updateData.status = updates.status;
    }

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

    console.info("Platform integration updated successfully");

    return new Response(JSON.stringify({ success: true, data: { ...data, credentials: '[ENCRYPTED]' } }), {
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
