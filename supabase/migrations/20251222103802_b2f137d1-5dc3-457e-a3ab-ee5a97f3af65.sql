-- Enable pgcrypto extension for encryption functions
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Grant usage to roles
GRANT USAGE ON SCHEMA extensions TO authenticated;
GRANT USAGE ON SCHEMA extensions TO service_role;

-- Update encrypt_credentials function to use extensions schema
CREATE OR REPLACE FUNCTION public.encrypt_credentials(credentials jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  encryption_key text;
BEGIN
  encryption_key := current_setting('app.settings.jwt_secret', true);
  IF encryption_key IS NULL OR encryption_key = '' THEN
    encryption_key := 'lovable_cred_encryption_key_v1';
  END IF;
  
  RETURN encode(
    extensions.pgp_sym_encrypt(
      credentials::text,
      encryption_key,
      'compress-algo=1, cipher-algo=aes256'
    ),
    'base64'
  );
END;
$function$;

-- Update decrypt_credentials function to use extensions schema
CREATE OR REPLACE FUNCTION public.decrypt_credentials(encrypted_creds text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  encryption_key text;
  decrypted text;
BEGIN
  encryption_key := current_setting('app.settings.jwt_secret', true);
  IF encryption_key IS NULL OR encryption_key = '' THEN
    encryption_key := 'lovable_cred_encryption_key_v1';
  END IF;
  
  decrypted := extensions.pgp_sym_decrypt(
    decode(encrypted_creds, 'base64'),
    encryption_key
  );
  
  RETURN decrypted::jsonb;
EXCEPTION
  WHEN OTHERS THEN
    RETURN '{}'::jsonb;
END;
$function$;

-- Update the trigger function as well
CREATE OR REPLACE FUNCTION public.encrypt_platform_credentials()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.credentials IS NOT NULL AND (NEW.credentials_encrypted IS NULL OR NEW.credentials_encrypted = false) THEN
    NEW.credentials := to_jsonb(public.encrypt_credentials(NEW.credentials));
    NEW.credentials_encrypted := true;
  END IF;
  RETURN NEW;
END;
$function$;