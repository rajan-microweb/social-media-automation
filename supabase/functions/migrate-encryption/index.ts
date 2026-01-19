import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function isAesEncrypted(value: unknown): boolean {
  return typeof value === 'string' && value.includes(':') && value.length > 50;
}
// ====================================================

Deno.serve(async (req) => {
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting encryption migration...');

    // Fetch all platform integrations
    const { data: integrations, error: fetchError } = await supabase
      .from('platform_integrations')
      .select('id, credentials, credentials_encrypted, user_id, platform_name');

    if (fetchError) {
      console.error('Error fetching integrations:', fetchError);
      return new Response(
        JSON.stringify({ error: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${integrations?.length || 0} integrations to check`);

    const results = {
      total: integrations?.length || 0,
      alreadyAesEncrypted: 0,
      migratedFromPlain: 0,
      migratedFromPgcrypto: 0,
      errors: [] as string[],
    };

    for (const integration of integrations || []) {
      try {
        const credentials = integration.credentials;
        
        // Skip if already AES encrypted
        if (isAesEncrypted(credentials)) {
          console.log(`Integration ${integration.id} already AES encrypted, skipping`);
          results.alreadyAesEncrypted++;
          continue;
        }

        let plainCredentials: Record<string, unknown>;

        // If it's already a JSON object (plain)
        if (typeof credentials === 'object' && credentials !== null) {
          plainCredentials = credentials;
          console.log(`Integration ${integration.id}: migrating from plain JSON`);
        } 
        // If it's a string (could be pgcrypto encrypted)
        else if (typeof credentials === 'string') {
          // Try to decrypt with pgcrypto
          try {
            const { data: decrypted, error: decryptError } = await supabase
              .rpc('decrypt_credentials', { encrypted_creds: credentials });
            
            if (decryptError) {
              // Try parsing as plain JSON string
              try {
                plainCredentials = JSON.parse(credentials);
                console.log(`Integration ${integration.id}: parsed as plain JSON string`);
              } catch {
                console.error(`Integration ${integration.id}: cannot decrypt or parse`, decryptError);
                results.errors.push(`${integration.id}: Cannot decrypt or parse credentials`);
                continue;
              }
            } else {
              plainCredentials = typeof decrypted === 'object' ? decrypted : JSON.parse(decrypted);
              console.log(`Integration ${integration.id}: decrypted from pgcrypto`);
              results.migratedFromPgcrypto++;
            }
          } catch (e) {
            console.error(`Integration ${integration.id}: pgcrypto decryption failed`, e);
            results.errors.push(`${integration.id}: pgcrypto decryption failed`);
            continue;
          }
        } else {
          console.warn(`Integration ${integration.id}: unknown credentials type`);
          results.errors.push(`${integration.id}: Unknown credentials type`);
          continue;
        }

        // Encrypt with AES-256-GCM
        const encryptedCredentials = await encryptCredentials(JSON.stringify(plainCredentials));

        // Update the record
        const { error: updateError } = await supabase
          .from('platform_integrations')
          .update({
            credentials: encryptedCredentials,
            credentials_encrypted: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', integration.id);

        if (updateError) {
          console.error(`Error updating integration ${integration.id}:`, updateError);
          results.errors.push(`${integration.id}: Update failed - ${updateError.message}`);
        } else {
          console.log(`Successfully migrated integration ${integration.id}`);
          if (typeof credentials === 'object') {
            results.migratedFromPlain++;
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error processing integration ${integration.id}:`, error);
        results.errors.push(`${integration.id}: ${errorMessage}`);
      }
    }

    console.log('Migration complete:', results);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Encryption migration complete',
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Migration error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
