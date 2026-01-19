import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-timestamp, x-signature',
}

// HMAC-SHA256 signature verification for enhanced security
async function verifySignature(apiKey: string, timestamp: string, expectedSignature: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(apiKey),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const message = `${timestamp}`;
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
    const signatureHex = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return signatureHex === expectedSignature;
  } catch {
    return false;
  }
}

// Rate limiting: simple in-memory store (resets on function cold start)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_MAX = 100; // requests per window
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute

function checkRateLimit(clientId: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(clientId);
  
  if (!entry || now > entry.resetTime) {
    rateLimitStore.set(clientId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  
  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }
  
  entry.count++;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  const requestTime = new Date().toISOString();

  try {
    // Get client identifier for rate limiting
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    
    // Check rate limit
    if (!checkRateLimit(clientIp)) {
      console.warn(`[${requestId}] Rate limit exceeded for client: ${clientIp.substring(0, 8)}...`);
      return new Response(
        JSON.stringify({ error: 'Too Many Requests', message: 'Rate limit exceeded. Please try again later.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' } }
      );
    }

    // Validate API key
    const apiKey = req.headers.get('x-api-key');
    const expectedApiKey = Deno.env.get('N8N_API_KEY');
    const timestamp = req.headers.get('x-timestamp');
    const signature = req.headers.get('x-signature');

    if (!apiKey || apiKey !== expectedApiKey) {
      console.warn(`[${requestId}] Auth failed: Invalid or missing API key from ${clientIp.substring(0, 8)}...`);
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid API key' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Optional: Verify HMAC signature if provided (enhanced security)
    if (signature && timestamp) {
      const timestampMs = parseInt(timestamp, 10);
      const now = Date.now();
      // Reject requests older than 5 minutes
      if (isNaN(timestampMs) || Math.abs(now - timestampMs) > 300000) {
        console.warn(`[${requestId}] Auth failed: Timestamp out of range`);
        return new Response(
          JSON.stringify({ error: 'Unauthorized - Invalid timestamp' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const isValid = await verifySignature(apiKey, timestamp, signature);
      if (!isValid) {
        console.warn(`[${requestId}] Auth failed: Invalid HMAC signature`);
        return new Response(
          JSON.stringify({ error: 'Unauthorized - Invalid signature' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log(`[${requestId}] API key validated at ${requestTime}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    // Create service client to bypass RLS
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Parse query parameters
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 1000);
    const userId = url.searchParams.get('user_id');

    console.log('Fetching scheduled posts with params:', { limit, user_id: userId });

    // Build query - always filter by status=scheduled
    let query = supabase
      .from('posts')
      .select('*')
      .eq('status', 'scheduled')
      .order('scheduled_at', { ascending: true })
      .limit(limit);

    // Optionally filter by user_id
    if (userId) {
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(userId)) {
        return new Response(
          JSON.stringify({ error: 'Invalid user_id format - must be a valid UUID' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      query = query.eq('user_id', userId);
    }

    const { data: posts, error } = await query;

    if (error) {
      console.error('Error fetching posts:', error);
      throw error;
    }

    console.log(`[${requestId}] Successfully fetched ${posts?.length || 0} scheduled posts`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        posts: posts || [],
        count: posts?.length || 0,
        filters: {
          status: 'scheduled',
          user_id: userId || null,
          limit
        },
        request_id: requestId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error(`[${requestId}] Error in get-all-posts function:`, error instanceof Error ? error.message : 'Unknown error');
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage, request_id: requestId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
