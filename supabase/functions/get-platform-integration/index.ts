import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    // Authenticate user from JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);

    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authenticatedUserId = user.id;
    console.log('Authenticated user:', authenticatedUserId);

    // Create service client for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get platform_name from URL query params or POST body
    let platform_name: string | null = null;
    const url = new URL(req.url);
    platform_name = url.searchParams.get('platform_name');

    if (!platform_name && req.method === 'POST') {
      try {
        const body = await req.text();
        if (body && body.trim()) {
          const json = JSON.parse(body);
          platform_name = json.platform_name || null;
        }
      } catch (parseError) {
        console.warn('Could not parse request body as JSON:', parseError);
      }
    }

    console.info('Fetching platform integrations:', { platform_name, user_id: authenticatedUserId });

    // Build query - ALWAYS filter by authenticated user
    let query = supabase
      .from('platform_integrations')
      .select('*')
      .eq('user_id', authenticatedUserId)
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
