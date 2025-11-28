import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { requesting_user_id, target_user_id, linkedin_ids } = body;

    if (!requesting_user_id || !target_user_id || !linkedin_ids || linkedin_ids.length === 0) {
      return new Response(
        JSON.stringify({ error: 'requesting_user_id, target_user_id, and linkedin_ids are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`User ${requesting_user_id} requesting to revoke access for user ${target_user_id} for LinkedIn IDs:`, linkedin_ids);

    // Verify the requesting user owns these LinkedIn accounts
    const { data: requestingUserIntegration, error: verifyError } = await supabase
      .from('platform_integrations')
      .select('credentials')
      .eq('user_id', requesting_user_id)
      .eq('platform_name', 'linkedin')
      .eq('status', 'active')
      .single();

    if (verifyError || !requestingUserIntegration) {
      console.error('Verification error:', verifyError);
      return new Response(
        JSON.stringify({ error: 'Could not verify account ownership' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get requesting user's LinkedIn IDs
    const requestingUserLinkedInIds: string[] = [];
    const credentials = requestingUserIntegration.credentials as any;
    
    if (credentials?.personal_info?.linkedin_id) {
      requestingUserLinkedInIds.push(credentials.personal_info.linkedin_id);
    }
    if (credentials?.company_info && Array.isArray(credentials.company_info)) {
      for (const company of credentials.company_info) {
        if (company.company_id) {
          requestingUserLinkedInIds.push(company.company_id);
        }
      }
    }

    // Verify all requested LinkedIn IDs belong to the requesting user
    const allOwned = linkedin_ids.every((id: string) => requestingUserLinkedInIds.includes(id));
    if (!allOwned) {
      return new Response(
        JSON.stringify({ error: 'You can only revoke access for accounts you own' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Delete the target user's integration
    const { error: deleteError } = await supabase
      .from('platform_integrations')
      .delete()
      .eq('user_id', target_user_id)
      .eq('platform_name', 'linkedin');

    if (deleteError) {
      console.error('Delete error:', deleteError);
      return new Response(
        JSON.stringify({ error: 'Failed to revoke access' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Successfully revoked access for user ${target_user_id}`);

    return new Response(
      JSON.stringify({ success: true, message: 'Access revoked successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in revoke-other-session:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
