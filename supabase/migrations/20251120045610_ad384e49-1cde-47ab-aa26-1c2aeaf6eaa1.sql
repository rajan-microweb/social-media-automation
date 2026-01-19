-- Add new columns to posts table
ALTER TABLE posts
ADD COLUMN type_of_post TEXT,
ADD COLUMN platforms TEXT[],
ADD COLUMN account_type TEXT,
ADD COLUMN text TEXT,
ADD COLUMN image TEXT,
ADD COLUMN video TEXT,
ADD COLUMN pdf TEXT,
ADD COLUMN url TEXT,
ADD COLUMN tags TEXT[];

-- Remove the old media_url column (replaced by image, video, pdf)
ALTER TABLE posts
DROP COLUMN media_url;

-- Update existing records to have default values
UPDATE posts SET platforms = '{}' WHERE platforms IS NULL;
UPDATE posts SET tags = '{}' WHERE tags IS NULL;