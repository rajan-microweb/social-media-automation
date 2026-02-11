/**
 * AES-256-GCM Encryption Utilities
 * 
 * Encrypted format: {base64_iv}:{base64_ciphertext}
 * Uses Web Crypto API for encryption/decryption
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============= Core Encryption Functions =============

/**
 * Encrypts a plaintext string using AES-256-GCM
 * @param plaintext The string to encrypt
 * @returns Encrypted string in format: iv:ciphertext (both base64 encoded)
 */
export async function encryptCredentials(plaintext: string): Promise<string> {
  const encryptionKey = Deno.env.get('ENCRYPTION_KEY');
  if (!encryptionKey) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }

  const encoder = new TextEncoder();
  
  // Generate random IV (12 bytes for AES-GCM)
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // Decode the base64 encryption key
  const keyData = Uint8Array.from(atob(encryptionKey), c => c.charCodeAt(0));
  
  // Import the key for AES-GCM
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  
  // Encrypt
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    encoder.encode(plaintext)
  );
  
  // Convert to base64 and combine: iv:ciphertext
  const ivBase64 = btoa(String.fromCharCode(...iv));
  const encryptedBase64 = btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer)));
  
  return `${ivBase64}:${encryptedBase64}`;
}

/**
 * Decrypts an encrypted string using AES-256-GCM
 * @param encryptedData The encrypted string in format: iv:ciphertext
 * @returns Decrypted plaintext string
 */
export async function decryptCredentials(encryptedData: string): Promise<string> {
  const encryptionKey = Deno.env.get('ENCRYPTION_KEY');
  if (!encryptionKey) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }

  // Parse the iv:ciphertext format
  const [ivBase64, ciphertextBase64] = encryptedData.split(':');
  
  if (!ivBase64 || !ciphertextBase64) {
    throw new Error('Invalid encrypted data format');
  }
  
  // Decode from base64
  const iv = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(ciphertextBase64), c => c.charCodeAt(0));
  const keyBytes = Uint8Array.from(atob(encryptionKey), c => c.charCodeAt(0));

  // Import the key
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

/**
 * Checks if a value appears to be encrypted in our AES-GCM format
 * @param value The value to check
 * @returns true if the value looks like it's encrypted with AES-GCM
 */
export function isEncrypted(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  // Our format is iv:ciphertext where iv is 16 chars base64 (12 bytes) and ciphertext is longer
  return value.includes(':') && value.length > 50;
}

/**
 * Safely decrypts credentials, handling both encrypted and plain JSON formats
 * @param credentials The credentials to decrypt (can be object, encrypted string, or any other value)
 * @returns Decrypted credentials as an object
 */
export async function safeDecryptCredentials(credentials: unknown): Promise<Record<string, unknown>> {
  // If already a JSON object, return as-is
  if (typeof credentials === 'object' && credentials !== null && !Array.isArray(credentials)) {
    return credentials as Record<string, unknown>;
  }
  
  // If it's a string and looks encrypted, try to decrypt
  if (typeof credentials === 'string' && isEncrypted(credentials)) {
    try {
      const decrypted = await decryptCredentials(credentials);
      return JSON.parse(decrypted);
    } catch (error) {
      console.error('Failed to decrypt credentials:', error);
      return {};
    }
  }
  
  // If it's a JSON string but not encrypted, try to parse
  if (typeof credentials === 'string') {
    try {
      return JSON.parse(credentials);
    } catch {
      return {};
    }
  }
  
  return {};
}

// ============= Platform Integration Helpers =============

/**
 * Standard response format for all proxy functions
 */
export interface ProxyResponse<T = unknown> {
  success: boolean;
  data: T | null;
  error: string | null;
}

/**
 * Creates a standardized success response
 */
export function successResponse<T>(data: T): ProxyResponse<T> {
  return { success: true, data, error: null };
}

/**
 * Creates a standardized error response
 */
export function errorResponse(message: string): ProxyResponse<null> {
  return { success: false, data: null, error: message };
}

/**
 * CORS headers for all proxy functions
 */
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

/**
 * Creates a JSON response with proper headers
 */
export function jsonResponse<T>(body: ProxyResponse<T>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Validates API key authentication
 */
export function validateApiKey(req: Request): { valid: boolean; error?: string } {
  const apiKey = req.headers.get("x-api-key");
  const expectedKey = Deno.env.get("N8N_API_KEY");
  
  if (!apiKey || apiKey !== expectedKey) {
    return { valid: false, error: "Unauthorized - Invalid API key" };
  }
  return { valid: true };
}

/**
 * Creates a Supabase client with service role key
 */
export function createSupabaseClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * Fetches and decrypts platform credentials with dual-format support
 * Handles both legacy pgcrypto format and new AES-GCM format
 * 
 * @param supabase Supabase client instance
 * @param userId The user's ID
 * @param platformName The platform name (e.g., 'linkedin', 'facebook')
 * @returns Decrypted credentials object or error
 */
export async function getDecryptedPlatformCredentials(
  supabase: SupabaseClient,
  userId: string,
  platformName: string
): Promise<{ 
  credentials: Record<string, unknown> | null; 
  integration: { id: string; metadata: unknown } | null;
  error: string | null 
}> {
  console.log(`[${platformName}] Fetching credentials for user: ${userId}`);
  
  // Fetch integration record
  const { data: integration, error: fetchError } = await supabase
    .from("platform_integrations")
    .select("id, credentials, credentials_encrypted, metadata")
    .eq("user_id", userId)
    .eq("platform_name", platformName)
    .eq("status", "active")
    .maybeSingle();

  if (fetchError) {
    console.error(`[${platformName}] Database error:`, fetchError.message);
    return { credentials: null, integration: null, error: `Database error: ${fetchError.message}` };
  }

  if (!integration) {
    console.log(`[${platformName}] Integration not found for user`);
    return { credentials: null, integration: null, error: `${platformName} integration not found` };
  }

  console.log(`[${platformName}] Integration found, encrypted flag: ${integration.credentials_encrypted}`);

  let credentials: Record<string, unknown>;

  try {
    // Extract the raw credential value
    const rawValue = typeof integration.credentials === 'string' 
      ? integration.credentials 
      : JSON.stringify(integration.credentials).replace(/^"|"$/g, '');

    // Detect AES-GCM format (iv:ciphertext) vs legacy pgcrypto
    const looksLikeAesGcm = typeof rawValue === 'string' && isEncrypted(rawValue);

    if (looksLikeAesGcm) {
      // New AES-GCM encrypted credentials
      console.log(`[${platformName}] Using AES-GCM decryption`);
      const decrypted = await decryptCredentials(rawValue);
      credentials = JSON.parse(decrypted);
    } else if (integration.credentials_encrypted === true) {
      // Legacy pgcrypto-encrypted credentials
      console.log(`[${platformName}] Using legacy pgcrypto decryption via RPC`);
      
      const { data: decryptedData, error: decryptError } = await supabase.rpc(
        'decrypt_credentials',
        { encrypted_creds: rawValue }
      );
      
      if (decryptError || !decryptedData) {
        console.error(`[${platformName}] Decryption RPC error:`, decryptError);
        return { credentials: null, integration: null, error: "Failed to decrypt credentials" };
      }
      
      credentials = typeof decryptedData === 'string' ? JSON.parse(decryptedData) : decryptedData;
    } else {
      // Plain JSON credentials
      console.log(`[${platformName}] Using plain JSON credentials`);
      credentials = await safeDecryptCredentials(integration.credentials);
    }

    console.log(`[${platformName}] Credentials decrypted successfully, keys: ${Object.keys(credentials).join(', ')}`);
    
    return { 
      credentials, 
      integration: { id: integration.id, metadata: integration.metadata },
      error: null 
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown decryption error";
    console.error(`[${platformName}] Decryption failed:`, message);
    return { credentials: null, integration: null, error: message };
  }
}

/**
 * Updates platform credentials with encryption
 * 
 * @param supabase Supabase client instance
 * @param integrationId The integration record ID
 * @param credentials The credentials to store
 * @returns Success status and any error message
 */
export async function updatePlatformCredentials(
  supabase: SupabaseClient,
  integrationId: string,
  credentials: Record<string, unknown>
): Promise<{ success: boolean; error: string | null }> {
  try {
    const encryptedCredentials = await encryptCredentials(JSON.stringify(credentials));
    
    const { error: updateError } = await supabase
      .from("platform_integrations")
      .update({
        credentials: encryptedCredentials,
        credentials_encrypted: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", integrationId);

    if (updateError) {
      console.error("Failed to update credentials:", updateError.message);
      return { success: false, error: updateError.message };
    }

    return { success: true, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Encryption/update failed:", message);
    return { success: false, error: message };
  }
}

/**
 * Updates the metadata field of a platform integration
 * Used to store non-sensitive platform account details (pages, channels, orgs)
 * 
 * @param supabase Supabase client instance
 * @param integrationId The integration record ID
 * @param metadata The metadata object to store
 * @returns Success status and any error message
 */
export async function updatePlatformMetadata(
  supabase: SupabaseClient,
  integrationId: string,
  metadata: Record<string, unknown>
): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error: updateError } = await supabase
      .from("platform_integrations")
      .update({
        metadata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", integrationId);

    if (updateError) {
      console.error("Failed to update metadata:", updateError.message);
      return { success: false, error: updateError.message };
    }

    console.log("Platform metadata updated successfully");
    return { success: true, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Metadata update failed:", message);
    return { success: false, error: message };
  }
}
