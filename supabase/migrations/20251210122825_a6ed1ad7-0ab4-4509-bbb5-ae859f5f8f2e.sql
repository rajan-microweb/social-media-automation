-- Fix 1: Add missing UPDATE and DELETE RLS policies for posts and stories tables
-- These provide defense in depth alongside edge function security

-- Posts table UPDATE/DELETE policies
CREATE POLICY "Users can update own posts"
ON public.posts FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own posts"
ON public.posts FOR DELETE USING (auth.uid() = user_id);

-- Stories table UPDATE/DELETE policies  
CREATE POLICY "Users can update own stories"
ON public.stories FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own stories"
ON public.stories FOR DELETE USING (auth.uid() = user_id);

-- Fix 2: Remove overly permissive storage policies
-- The ownership-checking policies will remain active
DROP POLICY IF EXISTS "Authenticated users can delete files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update files" ON storage.objects;