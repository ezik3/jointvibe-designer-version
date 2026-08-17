-- Migration: Add translation fields to posts table
-- Date: 2026-04-15 09:14 UTC
-- Description: Adds language detection and translation storage for user-generated posts

-- Add language detection fields to posts table
ALTER TABLE public.posts 
ADD COLUMN IF NOT EXISTS content_original TEXT, -- Store original text for reference
ADD COLUMN IF NOT EXISTS content_language TEXT DEFAULT 'en',
ADD COLUMN IF NOT EXISTS detection_confidence DECIMAL(3,2) DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS translations JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS translation_updated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS embedding_vector VECTOR(1536), -- For future AI vector search (OpenAI dimensions)
ADD COLUMN IF NOT EXISTS embedding_updated_at TIMESTAMP WITH TIME ZONE;

-- Add comment for documentation
COMMENT ON COLUMN public.posts.content_original IS 'Original text content (for reference and fallback)';
COMMENT ON COLUMN public.posts.content_language IS 'Detected language of the original content (ISO 639-1 code)';
COMMENT ON COLUMN public.posts.detection_confidence IS 'Confidence score (0.0-1.0) of language detection';
COMMENT ON COLUMN public.posts.translations IS 'JSON object storing translations: {"en": "English text", "es": "Spanish text", ...}';
COMMENT ON COLUMN public.posts.translation_updated_at IS 'When translations were last updated';
COMMENT ON COLUMN public.posts.embedding_vector IS 'Vector embedding for AI similarity search (future use)';
COMMENT ON COLUMN public.posts.embedding_updated_at IS 'When embedding was last updated';

-- Create index for faster language-based queries
CREATE INDEX IF NOT EXISTS idx_posts_content_language ON public.posts(content_language);
CREATE INDEX IF NOT EXISTS idx_posts_translation_updated_at ON public.posts(translation_updated_at);

-- Create GIN index for efficient JSONB queries on translations
CREATE INDEX IF NOT EXISTS idx_posts_translations_gin ON public.posts USING gin(translations);

-- Update existing posts to have default language 'en' and copy content to translations
UPDATE public.posts 
SET 
  content_original = content,
  content_language = 'en',
  detection_confidence = 1.0,
  translations = jsonb_build_object('en', content),
  translation_updated_at = created_at
WHERE content_language IS NULL;

-- Create function to detect language (placeholder - will be implemented in app logic)
CREATE OR REPLACE FUNCTION public.detect_content_language(content_text TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
BEGIN
  -- This is a placeholder function
  -- In production, this would call a language detection service
  -- For now, default to English
  RETURN 'en';
END;
$$;

-- Create function to update translations
CREATE OR REPLACE FUNCTION public.update_post_translations(
  post_id UUID,
  new_translations JSONB
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.posts
  SET 
    translations = translations || new_translations,
    translation_updated_at = NOW()
  WHERE id = post_id;
END;
$$;

-- Create trigger to auto-detect language on insert/update
CREATE OR REPLACE FUNCTION public.auto_detect_post_language()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Auto-detect language if not set
  IF NEW.content_language IS NULL THEN
    NEW.content_language := public.detect_content_language(NEW.content);
  END IF;
  
  -- Ensure English translation exists
  IF NEW.translations IS NULL OR NOT NEW.translations ? 'en' THEN
    NEW.translations := COALESCE(NEW.translations, '{}'::jsonb) || jsonb_build_object('en', NEW.content);
  END IF;
  
  -- Set translation update timestamp
  NEW.translation_updated_at := NOW();
  
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_auto_detect_post_language ON public.posts;
CREATE TRIGGER trigger_auto_detect_post_language
  BEFORE INSERT OR UPDATE OF content ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_detect_post_language();

-- Verify the changes
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'posts' 
    AND column_name = 'content_language'
  ) THEN
    RAISE NOTICE 'Translation fields added successfully to posts table';
  ELSE
    RAISE EXCEPTION 'Failed to add translation fields to posts table';
  END IF;
END $$;