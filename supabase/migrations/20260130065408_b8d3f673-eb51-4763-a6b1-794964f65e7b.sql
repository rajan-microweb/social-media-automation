-- Add metadata column to platform_integrations table
ALTER TABLE public.platform_integrations 
ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;