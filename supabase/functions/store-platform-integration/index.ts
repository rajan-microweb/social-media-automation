import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

// ============== AES-256-GCM Encryption ==============
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

// Flexible schema for platform integration data
const platformIntegrationSchema = z.object({
  user_id: z.string().uuid('Invalid user_id format'),
  platform_name: z.string().min(1, 'Platform name is required'),
  credentials: z.object({
    access_token: z.string().optional(),
    refresh_token: z.string().optional(),
    expires_at: z.string().optional(),
    scope: z.string().optional(),
    personal_info: z.object({
      name: z.string().optional(),
      linkedin_id: z.string().optional(),
      avatar_url: z.string().nullable().optional(),
    }).optional(),
    company_info: z.array(z.object({
      company_name: z.string().optional(),
      company_id: z.string().optional(),
      company_logo: z.string().nullable().optional(),
    })).optional(),
  }).passthrough().refine(
    (val) => JSON.stringify(val).length <= 50000,
    { message: 'Credentials object too large' }
  ),
  status: z.enum(['active', 'inactive', 'pending', 'error']).optional().default('active'),
});

serve(async (req) => {
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

    // Rate limiting
    const clientIp = req.headers.get('x-forwarded-for') || 'unknown';
    if (!checkRateLimit(clientIp)) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    
    console.log('Received payload for platform:', body.platform_name);

    // Validate input data
    const validationResult = platformIntegrationSchema.safeParse(body);
    if (!validationResult.success) {
      console.error('Validation error:', validationResult.error.errors);
      return new Response(
        JSON.stringify({ error: 'Invalid input data', details: validationResult.error.errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { user_id, platform_name, credentials, status } = validationResult.data;

    console.log('Storing platform integration:', { 
      platform_name, 
      user_id,
      status,
      credentials_keys: Object.keys(credentials)
    });

    // Encrypt credentials using AES-256-GCM
    const encryptedCredentials = await encryptCredentials(JSON.stringify(credentials));
    console.log('Credentials encrypted successfully');

    // Upsert the platform integration with encrypted credentials
    const { data, error } = await supabase
      .from('platform_integrations')
      .upsert({
        user_id,
        platform_name,
        credentials: encryptedCredentials, // Store encrypted string
        credentials_encrypted: true,
        status,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,platform_name'
      })
      .select()
      .single();

    if (error) {
      console.error('Error storing integration:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Platform integration stored successfully:', {
      id: data.id,
      user_id: data.user_id,
      platform_name: data.platform_name,
      status: data.status,
      credentials_encrypted: true
    });

    return new Response(
      JSON.stringify({ success: true, data: { ...data, credentials: '[ENCRYPTED]' } }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in store-platform-integration function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
