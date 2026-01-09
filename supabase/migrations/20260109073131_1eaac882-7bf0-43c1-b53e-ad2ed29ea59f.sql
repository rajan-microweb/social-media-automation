-- Add account_type column to stories table (same as posts table)
ALTER TABLE public.stories 
ADD COLUMN account_type text;