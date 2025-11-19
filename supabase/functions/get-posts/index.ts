import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase client with service role key (bypasses RLS)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Parse query parameters
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const limit = url.searchParams.get('limit') || '100';
    const user_id = url.searchParams.get('user_id');

    console.log('Fetching posts with params:', { status, limit, user_id });

    // Build query
    let query = supabaseClient
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    // Add filters if provided
    if (status) {
      query = query.eq('status', status);
    }
    if (user_id) {
      query = query.eq('user_id', user_id);
    }

    // Execute query
    const { data: posts, error } = await query;

    if (error) {
      console.error('Error fetching posts:', error);
      throw error;
    }

    console.log(`Successfully fetched ${posts?.length || 0} posts`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        posts: posts || [],
        count: posts?.length || 0 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error in get-posts function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
