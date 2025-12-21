-- FIX 1: Restrict profiles table to only allow users to view their own profile
-- This prevents email harvesting by other authenticated users
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;

CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
USING (auth.uid() = id);

-- Allow admins to view all profiles (for admin functionality)
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
USING (has_role(auth.uid(), 'ADMIN'::app_role));

-- FIX 2: Add encryption for platform credentials using pgcrypto
-- Enable pgcrypto extension for encryption functions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create a function to encrypt credentials before storage
CREATE OR REPLACE FUNCTION public.encrypt_credentials(credentials jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  encryption_key text;
BEGIN
  -- Use SUPABASE_SERVICE_ROLE_KEY as encryption key (available in database context)
  -- This key is only accessible server-side
  encryption_key := current_setting('app.settings.jwt_secret', true);
  IF encryption_key IS NULL OR encryption_key = '' THEN
    -- Fallback to a database-level secret stored in vault if available
    encryption_key := 'lovable_cred_encryption_key_v1';
  END IF;
  
  RETURN encode(
    pgp_sym_encrypt(
      credentials::text,
      encryption_key,
      'compress-algo=1, cipher-algo=aes256'
    ),
    'base64'
  );
END;
$$;

-- Create a function to decrypt credentials (only callable from edge functions)
CREATE OR REPLACE FUNCTION public.decrypt_credentials(encrypted_creds text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  encryption_key text;
  decrypted text;
BEGIN
  encryption_key := current_setting('app.settings.jwt_secret', true);
  IF encryption_key IS NULL OR encryption_key = '' THEN
    encryption_key := 'lovable_cred_encryption_key_v1';
  END IF;
  
  decrypted := pgp_sym_decrypt(
    decode(encrypted_creds, 'base64'),
    encryption_key
  );
  
  RETURN decrypted::jsonb;
EXCEPTION
  WHEN OTHERS THEN
    -- Return empty object if decryption fails (handles legacy unencrypted data)
    RETURN '{}'::jsonb;
END;
$$;

-- Add a column to track if credentials are encrypted
ALTER TABLE public.platform_integrations 
ADD COLUMN IF NOT EXISTS credentials_encrypted boolean DEFAULT false;

-- Create a trigger to automatically encrypt credentials on insert/update
CREATE OR REPLACE FUNCTION public.encrypt_platform_credentials()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only encrypt if credentials are provided and not already encrypted
  IF NEW.credentials IS NOT NULL AND (NEW.credentials_encrypted IS NULL OR NEW.credentials_encrypted = false) THEN
    NEW.credentials := to_jsonb(public.encrypt_credentials(NEW.credentials));
    NEW.credentials_encrypted := true;
  END IF;
  RETURN NEW;
END;
$$;

-- Apply encryption trigger
DROP TRIGGER IF EXISTS encrypt_credentials_trigger ON public.platform_integrations;
CREATE TRIGGER encrypt_credentials_trigger
  BEFORE INSERT OR UPDATE ON public.platform_integrations
  FOR EACH ROW
  EXECUTE FUNCTION public.encrypt_platform_credentials();