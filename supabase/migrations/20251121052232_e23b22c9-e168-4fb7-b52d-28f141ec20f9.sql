-- Update storage policy to restrict uploads to user's own folder
DROP POLICY IF EXISTS "Authenticated users can upload media" ON storage.objects;

CREATE POLICY "Users can upload to own folder" ON storage.objects
  FOR INSERT 
  WITH CHECK (
    bucket_id = 'post-media' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );