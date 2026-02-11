import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import {
  corsHeaders,
  validateApiKey,
  createSupabaseClient,
  getDecryptedPlatformCredentials,
} from "../_shared/encryption.ts";

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
    // Validate API key
    const authResult = validateApiKey(req);
    if (!authResult.valid) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid API key' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Rate limiting
    const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown';
    if (!checkRateLimit(clientIp)) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Try again later.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createSupabaseClient();

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

    // If a specific platform is requested, use the shared helper for proper decryption
    if (platform_name) {
      const { credentials, integration, error: credError } = await getDecryptedPlatformCredentials(
        supabase,
        user_id,
        platform_name
      );

      if (credError || !credentials || !integration) {
        return new Response(
          JSON.stringify({ data: null }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Fetch the full record to include all fields
      const { data: fullRecord } = await supabase
        .from('platform_integrations')
        .select('*')
        .eq('id', integration.id)
        .single();

      const result = fullRecord
        ? { ...fullRecord, credentials, credentials_encrypted: false }
        : { credentials, metadata: integration.metadata };

      return new Response(
        JSON.stringify({ data: result }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If no platform specified, fetch all active integrations and decrypt each
    const { data, error } = await supabase
      .from('platform_integrations')
      .select('*')
      .eq('user_id', user_id)
      .eq('status', 'active');

    if (error) {
      console.error('Database error:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.info(`Found ${data?.length || 0} platform integrations`);

    // Decrypt each integration using the shared helper
    const processedData = await Promise.all((data || []).map(async (record) => {
      const { credentials } = await getDecryptedPlatformCredentials(
        supabase,
        user_id!,
        record.platform_name
      );
      return { ...record, credentials: credentials || {}, credentials_encrypted: false };
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
