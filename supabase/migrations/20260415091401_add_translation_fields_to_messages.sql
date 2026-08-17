-- Migration: Add translation fields to messages tables
-- Date: 2026-04-15 09:14 UTC
-- Description: Adds language detection and translation caching for chat messages

-- 1. Live chat messages
ALTER TABLE public.live_chat_messages 
ADD COLUMN IF NOT EXISTS content_language TEXT DEFAULT 'en',
ADD COLUMN IF NOT EXISTS detection_confidence DECIMAL(3,2) DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS translation_cache JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS translation_cached_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.live_chat_messages.content_language IS 'Detected language of the message';
COMMENT ON COLUMN public.live_chat_messages.detection_confidence IS 'Confidence score (0.0-1.0) of language detection';
COMMENT ON COLUMN public.live_chat_messages.translation_cache IS 'Cached translations for recent messages: {"en": "...", "es": "..."}';
COMMENT ON COLUMN public.live_chat_messages.translation_cached_at IS 'When translation was last cached';

-- 2. Order messages
ALTER TABLE public.order_messages 
ADD COLUMN IF NOT EXISTS content_language TEXT DEFAULT 'en',
ADD COLUMN IF NOT EXISTS detection_confidence DECIMAL(3,2) DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS translation_cache JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS translation_cached_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.order_messages.content_language IS 'Detected language of the message';
COMMENT ON COLUMN public.order_messages.detection_confidence IS 'Confidence score (0.0-1.0) of language detection';
COMMENT ON COLUMN public.order_messages.translation_cache IS 'Cached translations for recent messages';
COMMENT ON COLUMN public.order_messages.translation_cached_at IS 'When translation was last cached';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_live_chat_messages_language ON public.live_chat_messages(content_language);
CREATE INDEX IF NOT EXISTS idx_live_chat_messages_cached_at ON public.live_chat_messages(translation_cached_at);
CREATE INDEX IF NOT EXISTS idx_order_messages_language ON public.order_messages(content_language);
CREATE INDEX IF NOT EXISTS idx_order_messages_cached_at ON public.order_messages(translation_cached_at);

-- Update existing messages with default values
UPDATE public.live_chat_messages 
SET 
  content_language = 'en',
  detection_confidence = 1.0,
  translation_cache = jsonb_build_object('en', content),
  translation_cached_at = created_at
WHERE content_language IS NULL;

UPDATE public.order_messages 
SET 
  content_language = 'en',
  detection_confidence = 1.0,
  translation_cache = jsonb_build_object('en', content),
  translation_cached_at = created_at
WHERE content_language IS NULL;

-- Create function to cache translation
CREATE OR REPLACE FUNCTION public.cache_message_translation(
  message_id UUID,
  message_table TEXT,
  target_language TEXT,
  translated_text TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF message_table = 'live_chat_messages' THEN
    UPDATE public.live_chat_messages
    SET 
      translation_cache = translation_cache || jsonb_build_object(target_language, translated_text),
      translation_cached_at = NOW()
    WHERE id = message_id;
  ELSIF message_table = 'order_messages' THEN
    UPDATE public.order_messages
    SET 
      translation_cache = translation_cache || jsonb_build_object(target_language, translated_text),
      translation_cached_at = NOW()
    WHERE id = message_id;
  END IF;
END;
$$;

-- Create function to get cached translation
CREATE OR REPLACE FUNCTION public.get_cached_translation(
  message_id UUID,
  message_table TEXT,
  target_language TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  cached_text TEXT;
BEGIN
  IF message_table = 'live_chat_messages' THEN
    SELECT translation_cache->>target_language
    INTO cached_text
    FROM public.live_chat_messages
    WHERE id = message_id;
  ELSIF message_table = 'order_messages' THEN
    SELECT translation_cache->>target_language
    INTO cached_text
    FROM public.order_messages
    WHERE id = message_id;
  END IF;
  
  RETURN cached_text;
END;
$$;

-- Create function to check if translation is stale (older than 1 hour)
CREATE OR REPLACE FUNCTION public.is_translation_stale(
  cached_at TIMESTAMP WITH TIME ZONE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN cached_at IS NULL OR cached_at < NOW() - INTERVAL '1 hour';
END;
$$;

-- Create trigger for live chat messages
CREATE OR REPLACE FUNCTION public.auto_detect_live_chat_language()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Auto-detect language if not set
  IF NEW.content_language IS NULL THEN
    NEW.content_language := 'en'; -- Placeholder - would call detection service
  END IF;
  
  -- Cache English translation
  IF NEW.translation_cache IS NULL OR NOT NEW.translation_cache ? 'en' THEN
    NEW.translation_cache := COALESCE(NEW.translation_cache, '{}'::jsonb) || jsonb_build_object('en', NEW.content);
  END IF;
  
  NEW.translation_cached_at := NOW();
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auto_detect_live_chat_language ON public.live_chat_messages;
CREATE TRIGGER trigger_auto_detect_live_chat_language
  BEFORE INSERT ON public.live_chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_detect_live_chat_language();

-- Create trigger for order messages
CREATE OR REPLACE FUNCTION public.auto_detect_order_message_language()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.content_language IS NULL THEN
    NEW.content_language := 'en';
  END IF;
  
  IF NEW.translation_cache IS NULL OR NOT NEW.translation_cache ? 'en' THEN
    NEW.translation_cache := COALESCE(NEW.translation_cache, '{}'::jsonb) || jsonb_build_object('en', NEW.content);
  END IF;
  
  NEW.translation_cached_at := NOW();
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auto_detect_order_message_language ON public.order_messages;
CREATE TRIGGER trigger_auto_detect_order_message_language
  BEFORE INSERT ON public.order_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_detect_order_message_language();

-- Verify changes
DO $$
BEGIN
  -- Check live_chat_messages
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'live_chat_messages' 
    AND column_name = 'content_language'
  ) THEN
    RAISE NOTICE 'Translation fields added to live_chat_messages';
  ELSE
    RAISE EXCEPTION 'Failed to add translation fields to live_chat_messages';
  END IF;
  
  -- Check order_messages
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'order_messages' 
    AND column_name = 'content_language'
  ) THEN
    RAISE NOTICE 'Translation fields added to order_messages';
  ELSE
    RAISE EXCEPTION 'Failed to add translation fields to order_messages';
  END IF;
END $$;