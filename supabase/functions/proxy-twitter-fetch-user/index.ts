import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { safeDecryptCredentials } from '../_shared/encryption.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

// OAuth 1.0a signature generation
function generateNonce(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/\*/g, '%2A')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29');
}

async function generateOAuthSignature(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string
): Promise<string> {
  // Sort parameters and create parameter string
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join('&');

  // Create signature base string
  const signatureBaseString = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(sortedParams)
  ].join('&');

  // Create signing key
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;

  // Generate HMAC-SHA1 signature
  const encoder = new TextEncoder();
  const keyData = encoder.encode(signingKey);
  const messageData = encoder.encode(signatureBaseString);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

function generateOAuthHeader(params: Record<string, string>): string {
  return 'OAuth ' + Object.keys(params)
    .sort()
    .map(key => `${percentEncode(key)}="${percentEncode(params[key])}"`)
    .join(', ');
}

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

    const { user_id } = await req.json();

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: 'user_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch Twitter integration
    const { data: integration, error: fetchError } = await supabase
      .from('platform_integrations')
      .select('credentials')
      .eq('user_id', user_id)
      .eq('platform_name', 'twitter')
      .eq('status', 'active')
      .single();

    if (fetchError || !integration) {
      return new Response(
        JSON.stringify({ error: 'Twitter integration not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decrypt credentials
    const credentials = await safeDecryptCredentials(integration.credentials);
    const {
      consumer_key,
      consumer_secret,
      access_token,
      access_token_secret
    } = credentials as {
      consumer_key: string;
      consumer_secret: string;
      access_token: string;
      access_token_secret: string;
    };

    if (!consumer_key || !consumer_secret || !access_token || !access_token_secret) {
      return new Response(
        JSON.stringify({ error: 'Missing Twitter OAuth credentials' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prepare OAuth 1.0a parameters
    const apiUrl = 'https://api.twitter.com/2/users/me';
    const method = 'GET';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = generateNonce();

    const oauthParams: Record<string, string> = {
      oauth_consumer_key: consumer_key,
      oauth_nonce: nonce,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: timestamp,
      oauth_token: access_token,
      oauth_version: '1.0'
    };

    // Generate signature
    const signature = await generateOAuthSignature(
      method,
      apiUrl,
      oauthParams,
      consumer_secret,
      access_token_secret
    );

    oauthParams.oauth_signature = signature;

    // Generate Authorization header
    const authHeader = generateOAuthHeader(oauthParams);

    // Call Twitter API
    const twitterResponse = await fetch(
      `${apiUrl}?user.fields=id,name,username,profile_image_url,description,public_metrics`,
      {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
        }
      }
    );

    if (!twitterResponse.ok) {
      const errorText = await twitterResponse.text();
      console.error('Twitter API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch Twitter user', details: errorText }),
        { status: twitterResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const twitterData = await twitterResponse.json();

    // Return sanitized user data (no tokens)
    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: twitterData.data?.id,
          username: twitterData.data?.username,
          name: twitterData.data?.name,
          profile_image_url: twitterData.data?.profile_image_url,
          description: twitterData.data?.description,
          public_metrics: twitterData.data?.public_metrics
        }
      }),
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
