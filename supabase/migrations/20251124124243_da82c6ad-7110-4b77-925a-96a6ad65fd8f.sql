-- Create platform_integrations table
CREATE TABLE public.platform_integrations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform_name text NOT NULL,
  credentials jsonb NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, platform_name)
);

-- Enable Row Level Security
ALTER TABLE public.platform_integrations ENABLE ROW LEVEL SECURITY;

-- Create policies for users to manage their own integrations
CREATE POLICY "Users can view own integrations"
ON public.platform_integrations
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own integrations"
ON public.platform_integrations
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own integrations"
ON public.platform_integrations
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own integrations"
ON public.platform_integrations
FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger to auto-update updated_at timestamp
CREATE TRIGGER update_platform_integrations_updated_at
BEFORE UPDATE ON public.platform_integrations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();