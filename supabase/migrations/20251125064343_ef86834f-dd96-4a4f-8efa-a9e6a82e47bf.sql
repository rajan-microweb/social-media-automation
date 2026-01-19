-- Enable authenticated users to upload to post-media bucket
CREATE POLICY "Authenticated users can upload files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'post-media');

-- Enable authenticated users to update their uploaded files
CREATE POLICY "Authenticated users can update files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'post-media');

-- Enable authenticated users to delete their files
CREATE POLICY "Authenticated users can delete files"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'post-media');

-- Allow public read access (bucket is already public)
CREATE POLICY "Public users can read files"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'post-media');