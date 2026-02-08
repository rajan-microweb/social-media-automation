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

// ============= OAuth 1.0a Signature Generation =============

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

// ============= Rate Limiting =============

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

// ============= Main Handler =============

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate API key
    const authResult = validateApiKey(req);
    if (!authResult.valid) {
      return jsonResponse(errorResponse(authResult.error!), 401);
    }

    // Rate limiting
    const clientIp = req.headers.get('x-forwarded-for') || 'unknown';
    if (!checkRateLimit(clientIp)) {
      return jsonResponse(errorResponse("Rate limit exceeded"), 429);
    }

    // Parse request
    const { user_id } = await req.json();
    if (!user_id) {
      return jsonResponse(errorResponse("user_id is required"), 400);
    }

    // Get decrypted credentials
    const supabase = createSupabaseClient();
    const { credentials, integration, error: credError } = await getDecryptedPlatformCredentials(
      supabase,
      user_id,
      "twitter"
    );

    if (credError || !credentials || !integration) {
      return jsonResponse(errorResponse(credError || "Twitter integration not found"), 404);
    }

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
      return jsonResponse(errorResponse("Missing Twitter OAuth credentials"), 400);
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
    console.log("[twitter] Generating OAuth signature...");
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
    console.log("[twitter] Fetching user info...");
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
      console.error('[twitter] API error:', errorText);
      return jsonResponse(errorResponse(`Failed to fetch Twitter user: ${twitterResponse.status}`), twitterResponse.status);
    }

    const twitterData = await twitterResponse.json();

    console.log("[twitter] User fetched:", twitterData.data?.username);

    // Build user data object
    const userData = {
      id: twitterData.data?.id || null,
      username: twitterData.data?.username || null,
      name: twitterData.data?.name || null,
      profile_image_url: twitterData.data?.profile_image_url || null,
      description: twitterData.data?.description || null,
      public_metrics: twitterData.data?.public_metrics || null,
    };

    // Store user details in metadata column
    const metadata = {
      user: userData,
      last_synced: new Date().toISOString(),
    };
    
    await updatePlatformMetadata(supabase, integration.id, metadata);
    console.log("[twitter] Metadata updated with user details");

    // Return sanitized user data (no tokens)
    return jsonResponse(successResponse({ user: userData }));
  } catch (error) {
    console.error('Error in proxy-twitter-fetch-user:', error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(errorResponse(message), 500);
  }
});
