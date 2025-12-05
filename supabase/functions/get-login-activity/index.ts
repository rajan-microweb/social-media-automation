import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

    // Get parameters from request body or URL
    let linkedin_ids: string[] = [];

    if (req.method === 'POST') {
      const body = await req.json();
      linkedin_ids = body.linkedin_ids || [];
    } else {
      const url = new URL(req.url);
      const idsParam = url.searchParams.get('linkedin_ids');
      if (idsParam) {
        linkedin_ids = idsParam.split(',');
      }
    }

    if (linkedin_ids.length === 0) {
      return new Response(
        JSON.stringify({ loginActivity: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching login activity for user ${authenticatedUserId} with LinkedIn IDs:`, linkedin_ids);

    // Fetch all platform integrations for LinkedIn
    const { data: allIntegrations, error: fetchError } = await supabase
      .from('platform_integrations')
      .select('user_id, credentials, created_at, updated_at')
      .eq('platform_name', 'linkedin')
      .eq('status', 'active')
      .neq('user_id', authenticatedUserId); // Exclude current user

    if (fetchError) {
      console.error('Error fetching integrations:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch login activity' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${allIntegrations?.length || 0} other integrations to check`);

    // Find integrations that share the same LinkedIn IDs
    const loginActivity: any[] = [];

    for (const integration of allIntegrations || []) {
      const credentials = integration.credentials as any;
      if (!credentials) continue;

      const matchedAccounts: any[] = [];

      // Check personal account
      if (credentials.personal_info?.linkedin_id) {
        const personalId = credentials.personal_info.linkedin_id;
        if (linkedin_ids.includes(personalId)) {
          matchedAccounts.push({
            accountName: credentials.personal_info.name || 'LinkedIn User',
            accountType: 'personal',
            linkedinId: personalId,
          });
        }
      }

      // Check company accounts
      if (credentials.company_info && Array.isArray(credentials.company_info)) {
        for (const company of credentials.company_info) {
          if (company.company_id && linkedin_ids.includes(company.company_id)) {
            matchedAccounts.push({
              accountName: company.company_name || 'Company',
              accountType: 'company',
              linkedinId: company.company_id,
            });
          }
        }
      }

      if (matchedAccounts.length > 0) {
        // Get user email for display (masked)
        const { data: userData } = await supabase
          .from('profiles')
          .select('email')
          .eq('id', integration.user_id)
          .single();

        const email = userData?.email || 'Unknown';
        const maskedEmail = maskEmail(email);

        loginActivity.push({
          userId: integration.user_id,
          maskedEmail,
          connectedAt: integration.created_at,
          lastUpdated: integration.updated_at,
          matchedAccounts,
        });
      }
    }

    console.log(`Found ${loginActivity.length} other sessions sharing accounts`);

    return new Response(
      JSON.stringify({ loginActivity }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in get-login-activity:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***@***';
  
  const [localPart, domain] = email.split('@');
  const maskedLocal = localPart.length > 2 
    ? localPart[0] + '*'.repeat(Math.min(localPart.length - 2, 5)) + localPart[localPart.length - 1]
    : '*'.repeat(localPart.length);
  
  return `${maskedLocal}@${domain}`;
}
