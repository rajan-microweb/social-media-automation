/**
 * AES-256-GCM Encryption Utilities
 * 
 * Encrypted format: {base64_iv}:{base64_ciphertext}
 * Uses Web Crypto API for encryption/decryption
 */

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
 * Checks if a value appears to be encrypted in our format
 * @param value The value to check
 * @returns true if the value looks like it's encrypted
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
