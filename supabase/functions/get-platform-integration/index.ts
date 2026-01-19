import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

// ============== AES-256-GCM Decryption ==============
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

async function safeDecryptCredentials(credentials: unknown, supabase: any): Promise<Record<string, unknown>> {
  // If already a JSON object, return as-is
  if (typeof credentials === 'object' && credentials !== null && !Array.isArray(credentials)) {
    return credentials as Record<string, unknown>;
  }
  
  // If it's a string, try to determine the encryption format
  if (typeof credentials === 'string') {
    // Try AES-GCM format first (iv:ciphertext)
    if (isEncrypted(credentials)) {
      try {
        const decrypted = await decryptCredentials(credentials);
        return JSON.parse(decrypted);
      } catch (aesError) {
        console.log('AES decryption failed, trying pgcrypto fallback');
        // Fallback to pgcrypto RPC if AES fails (for legacy data)
        try {
          const { data: decrypted, error: decryptError } = await supabase
            .rpc('decrypt_credentials', { encrypted_creds: credentials });
          
          if (!decryptError && decrypted) {
            return typeof decrypted === 'object' ? decrypted : JSON.parse(decrypted);
          }
        } catch {
          console.error('Both decryption methods failed');
        }
      }
    }
    
    // Try parsing as plain JSON
    try {
      return JSON.parse(credentials);
    } catch {
      return {};
    }
  }
  
  return {};
}
// ====================================================

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // API Key authentication
    const apiKey = req.headers.get('x-api-key');
    const expectedApiKey = Deno.env.get('N8N_API_KEY');

    if (!apiKey || apiKey !== expectedApiKey) {
      console.error('Invalid or missing API key');
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid API key' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Rate limiting by client IP
    const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown';
    if (!checkRateLimit(clientIp)) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Try again later.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get parameters from URL query params or POST body
    const url = new URL(req.url);
    let platform_name: string | null = url.searchParams.get('platform_name');
    let user_id: string | null = url.searchParams.get('user_id');

    if (req.method === 'POST') {
      try {
        const body = await req.text();
        if (body && body.trim()) {
          const json = JSON.parse(body);
          platform_name = json.platform_name || platform_name;
          user_id = json.user_id || user_id;
        }
      } catch (parseError) {
        console.warn('Could not parse request body as JSON:', parseError);
      }
    }

    // Validate user_id is required
    if (!user_id) {
      return new Response(
        JSON.stringify({ error: 'user_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const uuidSchema = z.string().uuid();
    const userIdResult = uuidSchema.safeParse(user_id);
    if (!userIdResult.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid user_id format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.info('Fetching platform integrations:', { platform_name, user_id });

    // Build query - filter by provided user_id
    let query = supabase
      .from('platform_integrations')
      .select('*')
      .eq('user_id', user_id)
      .eq('status', 'active');

    if (platform_name) {
      query = query.eq('platform_name', platform_name);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Database error:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.info(`Found ${data?.length || 0} platform integrations`);

    // Process credentials - decrypt each integration
    const processedData = await Promise.all((data || []).map(async (integration) => {
      if (integration.credentials) {
        const decryptedCredentials = await safeDecryptCredentials(integration.credentials, supabase);
        return { ...integration, credentials: decryptedCredentials };
      }
      return integration;
    }));

    return new Response(
      JSON.stringify({ data: processedData }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
