import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Check for API key auth first (for external integrations like n8n)
    const apiKey = req.headers.get('x-api-key');
    const expectedApiKey = Deno.env.get('N8N_API_KEY');
    const authHeader = req.headers.get('Authorization');

    let userId: string | null = null;
    let isApiKeyAuth = false;

    if (apiKey && apiKey === expectedApiKey) {
      // API key authentication (external integrations)
      isApiKeyAuth = true;
      console.log('Authenticated via API key');
    } else if (authHeader?.startsWith('Bearer ')) {
      // JWT authentication (frontend) - use service role to verify user
      const token = authHeader.replace('Bearer ', '');
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });
      
      const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
      
      if (userError || !user) {
        console.error('JWT validation failed:', userError);
        return new Response(
          JSON.stringify({ error: 'Unauthorized - Invalid token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      userId = user.id;
      console.log('Authenticated via JWT for user:', userId);
    } else {
      console.error('No valid authentication provided');
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Missing authentication' }),
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

    // Create service client for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body = await req.json();
    const { story_id, user_id: bodyUserId } = body;

    // For API key auth, user_id must be provided in body
    // For JWT auth, use the authenticated user's ID
    const targetUserId = isApiKeyAuth ? bodyUserId : userId;

    if (!targetUserId) {
      return new Response(
        JSON.stringify({ error: 'user_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const uuidSchema = z.string().uuid();
    const userIdResult = uuidSchema.safeParse(targetUserId);
    if (!userIdResult.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid user_id format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!story_id) {
      console.error('Missing story_id in request');
      return new Response(
        JSON.stringify({ error: 'story_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Deleting story:', story_id, 'for user:', targetUserId);

    // Verify ownership - use maybeSingle to handle already-deleted stories gracefully
    const { data: story, error: fetchError } = await supabase
      .from('stories')
      .select('user_id')
      .eq('id', story_id)
      .maybeSingle();

    if (fetchError) {
      console.error('Error fetching story:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Error fetching story' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If story doesn't exist, treat as success (idempotent delete)
    if (!story) {
      console.log('Story already deleted or not found:', story_id);
      return new Response(
        JSON.stringify({ success: true, message: 'Story deleted successfully' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (story.user_id !== targetUserId) {
      console.error('Unauthorized: User does not own this story');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Delete the story
    const { error } = await supabase
      .from('stories')
      .delete()
      .eq('id', story_id);

    if (error) {
      console.error('Error deleting story:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Story deleted successfully:', story_id);

    return new Response(
      JSON.stringify({ success: true, message: 'Story deleted successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in delete-story function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
