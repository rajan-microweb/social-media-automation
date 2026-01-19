import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============== AES-256-GCM Decryption ==============
async function decryptCredentials(encryptedData: string): Promise<string> {
  const encryptionKey = Deno.env.get('ENCRYPTION_KEY');
  if (!encryptionKey) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }

  const [ivBase64, ciphertextBase64] = encryptedData.split(':');
  if (!ivBase64 || !ciphertextBase64) {
    throw new Error('Invalid encrypted data format');
  }
  
  const iv = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(ciphertextBase64), c => c.charCodeAt(0));
  const keyBytes = Uint8Array.from(atob(encryptionKey), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

function isEncrypted(value: unknown): boolean {
  return typeof value === 'string' && value.includes(':') && value.length > 50;
}

async function safeDecryptCredentials(credentials: unknown, supabase: any): Promise<Record<string, unknown>> {
  if (typeof credentials === 'object' && credentials !== null && !Array.isArray(credentials)) {
    return credentials as Record<string, unknown>;
  }
  
  if (typeof credentials === 'string') {
    if (isEncrypted(credentials)) {
      try {
        const decrypted = await decryptCredentials(credentials);
        return JSON.parse(decrypted);
      } catch (aesError) {
        console.log('AES decryption failed, trying pgcrypto fallback');
        try {
          const { data: decrypted, error: decryptError } = await supabase
            .rpc('decrypt_credentials', { encrypted_creds: credentials });
          
          if (!decryptError && decrypted) {
            return typeof decrypted === 'object' ? decrypted : JSON.parse(decrypted);
          }
        } catch {
          console.error('Both decryption methods failed');
        }
      }
    }
    
    try {
      return JSON.parse(credentials);
    } catch {
      return {};
    }
  }
  
  return {};
}
// ====================================================

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
      .select('user_id, credentials, credentials_encrypted, created_at, updated_at')
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
      // Decrypt credentials using AES-GCM with pgcrypto fallback
      const credentials = await safeDecryptCredentials(integration.credentials, supabase);
      if (!credentials || Object.keys(credentials).length === 0) continue;

      const matchedAccounts: any[] = [];

      // Check personal account
      if (credentials.personal_info && typeof credentials.personal_info === 'object') {
        const personalInfo = credentials.personal_info as Record<string, unknown>;
        const personalId = personalInfo.linkedin_id as string;
        if (personalId && linkedin_ids.includes(personalId)) {
          matchedAccounts.push({
            accountName: (personalInfo.name as string) || 'LinkedIn User',
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
