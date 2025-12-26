import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
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

    // Create service client for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get parameters from URL query params or POST body
    const url = new URL(req.url);
    let platform_name: string | null = url.searchParams.get('platform_name');

    if (req.method === 'POST') {
      try {
        const body = await req.text();
        if (body && body.trim()) {
          const json = JSON.parse(body);
          platform_name = json.platform_name || platform_name;
        }
      } catch (parseError) {
        console.warn('Could not parse request body as JSON:', parseError);
      }
    }

    console.info('Fetching platform integrations:', { platform_name });

    // Build query - filter only by platform_name if provided
    let query = supabase
      .from('platform_integrations')
      .select('*')
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

    // Decrypt credentials server-side for encrypted records
    const decryptedData = await Promise.all((data || []).map(async (integration) => {
      if (integration.credentials_encrypted && integration.credentials) {
        try {
          // Call the decrypt function via RPC
          const encryptedValue = typeof integration.credentials === 'string' 
            ? integration.credentials 
            : integration.credentials;
          
          const { data: decrypted, error: decryptError } = await supabase
            .rpc('decrypt_credentials', { encrypted_creds: encryptedValue });
          
          if (decryptError) {
            console.error('Decryption error for integration:', integration.id, decryptError);
            return { ...integration, credentials: {} }; // Return empty on error
          }
          
          return { ...integration, credentials: decrypted };
        } catch (e) {
          console.error('Decryption exception for integration:', integration.id, e);
          return { ...integration, credentials: {} };
        }
      }
      return integration;
    }));

    return new Response(
      JSON.stringify({ data: decryptedData }),
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
