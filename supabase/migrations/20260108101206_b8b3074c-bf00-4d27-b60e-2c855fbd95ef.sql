-- Add metadata column for dynamic titles/descriptions per content type
ALTER TABLE public.posts ADD COLUMN metadata jsonb DEFAULT NULL;