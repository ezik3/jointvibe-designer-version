-- Migration: Create translation service configuration table
-- Date: 2026-04-15 09:14 UTC
-- Description: Stores configuration for translation services and caching

-- Create translation service configuration table
CREATE TABLE IF NOT EXISTS public.translation_service_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name TEXT NOT NULL,
  api_key_encrypted TEXT,
  base_url TEXT,
  rate_limit_per_minute INTEGER DEFAULT 60,
  enabled BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 1, -- Lower number = higher priority
  supported_languages TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_priority CHECK (priority > 0),
  CONSTRAINT unique_service_name UNIQUE (service_name)
);

-- Create translation cache table for expensive operations
CREATE TABLE IF NOT EXISTS public.translation_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_text_hash TEXT NOT NULL, -- Hash of source text for deduplication
  source_language TEXT NOT NULL,
  target_language TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  service_used TEXT,
  confidence_score DECIMAL(3,2) DEFAULT 1.0,
  hit_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_confidence CHECK (confidence_score >= 0 AND confidence_score <= 1),
  CONSTRAINT unique_translation_hash UNIQUE (source_text_hash, source_language, target_language)
);

-- Create translation request log for monitoring
CREATE TABLE IF NOT EXISTS public.translation_request_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_text_hash TEXT,
  source_language TEXT,
  target_language TEXT,
  service_used TEXT,
  success BOOLEAN DEFAULT true,
  response_time_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_translation_cache_hash ON public.translation_cache(source_text_hash);
CREATE INDEX IF NOT EXISTS idx_translation_cache_languages ON public.translation_cache(source_language, target_language);
CREATE INDEX IF NOT EXISTS idx_translation_cache_last_accessed ON public.translation_cache(last_accessed_at);
CREATE INDEX IF NOT EXISTS idx_translation_request_log_created ON public.translation_request_log(created_at);
CREATE INDEX IF NOT EXISTS idx_translation_request_log_success ON public.translation_request_log(success);

-- Insert default configuration for translation services
INSERT INTO public.translation_service_config (service_name, priority, supported_languages) VALUES
  ('google_translate', 1, ARRAY['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh', 'ar', 'hi']),
  ('deepl', 2, ARRAY['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh']),
  ('fallback_basic', 3, ARRAY['en']) -- English-only fallback
ON CONFLICT (service_name) DO NOTHING;

-- Create function to get cached translation
CREATE OR REPLACE FUNCTION public.get_cached_translation_v2(
  p_source_text TEXT,
  p_source_language TEXT,
  p_target_language TEXT
)
RETURNS TABLE (
  translated_text TEXT,
  confidence_score DECIMAL(3,2),
  from_cache BOOLEAN
)
LANGUAGE plpgsql
AS $$
BEGIN
  -- Calculate hash of source text
  DECLARE
    v_hash TEXT := encode(digest(p_source_text, 'sha256'), 'hex');
  BEGIN
    -- Try to get from cache
    RETURN QUERY
    SELECT 
      tc.translated_text,
      tc.confidence_score,
      true AS from_cache
    FROM public.translation_cache tc
    WHERE tc.source_text_hash = v_hash
      AND tc.source_language = p_source_language
      AND tc.target_language = p_target_language
      AND tc.last_accessed_at > NOW() - INTERVAL '30 days' -- Cache expires after 30 days
    LIMIT 1;
    
    -- If not found in cache, return empty
    IF NOT FOUND THEN
      translated_text := NULL;
      confidence_score := NULL;
      from_cache := false;
      RETURN NEXT;
    END IF;
  END;
END;
$$;

-- Create function to cache translation
CREATE OR REPLACE FUNCTION public.cache_translation_v2(
  p_source_text TEXT,
  p_source_language TEXT,
  p_target_language TEXT,
  p_translated_text TEXT,
  p_service_used TEXT DEFAULT NULL,
  p_confidence_score DECIMAL(3,2) DEFAULT 1.0
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_hash TEXT := encode(digest(p_source_text, 'sha256'), 'hex');
  v_cache_id UUID;
BEGIN
  INSERT INTO public.translation_cache (
    source_text_hash,
    source_language,
    target_language,
    translated_text,
    service_used,
    confidence_score
  ) VALUES (
    v_hash,
    p_source_language,
    p_target_language,
    p_translated_text,
    p_service_used,
    p_confidence_score
  )
  ON CONFLICT (source_text_hash, source_language, target_language) 
  DO UPDATE SET
    translated_text = EXCLUDED.translated_text,
    service_used = EXCLUDED.service_used,
    confidence_score = EXCLUDED.confidence_score,
    hit_count = translation_cache.hit_count + 1,
    last_accessed_at = NOW(),
    updated_at = NOW()
  RETURNING id INTO v_cache_id;
  
  RETURN v_cache_id;
END;
$$;

-- Create function to log translation request
CREATE OR REPLACE FUNCTION public.log_translation_request(
  p_source_text_hash TEXT,
  p_source_language TEXT,
  p_target_language TEXT,
  p_service_used TEXT,
  p_success BOOLEAN,
  p_response_time_ms INTEGER,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.translation_request_log (
    source_text_hash,
    source_language,
    target_language,
    service_used,
    success,
    response_time_ms,
    error_message
  ) VALUES (
    p_source_text_hash,
    p_source_language,
    p_target_language,
    p_service_used,
    p_success,
    p_response_time_ms,
    p_error_message
  );
END;
$$;

-- Create function to get best translation service for language pair
CREATE OR REPLACE FUNCTION public.get_best_translation_service(
  p_source_language TEXT,
  p_target_language TEXT
)
RETURNS TABLE (
  service_name TEXT,
  base_url TEXT,
  api_key_encrypted TEXT,
  rate_limit_per_minute INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tsc.service_name,
    tsc.base_url,
    tsc.api_key_encrypted,
    tsc.rate_limit_per_minute
  FROM public.translation_service_config tsc
  WHERE tsc.enabled = true
    AND (p_source_language = ANY(tsc.supported_languages) OR tsc.supported_languages = '{}')
    AND (p_target_language = ANY(tsc.supported_languages) OR tsc.supported_languages = '{}')
  ORDER BY tsc.priority
  LIMIT 1;
END;
$$;

-- Create cleanup function for old cache entries
CREATE OR REPLACE FUNCTION public.cleanup_old_translation_cache()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM public.translation_cache
  WHERE last_accessed_at < NOW() - INTERVAL '30 days'
    AND hit_count < 5; -- Keep frequently accessed entries longer
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  -- Also clean up old logs (keep 90 days)
  DELETE FROM public.translation_request_log
  WHERE created_at < NOW() - INTERVAL '90 days';
  
  RETURN v_deleted_count;
END;
$$;

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION public.update_translation_config_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_translation_config_updated_at ON public.translation_service_config;
CREATE TRIGGER trigger_update_translation_config_updated_at
  BEFORE UPDATE ON public.translation_service_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_translation_config_updated_at();

-- Verify tables created
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'translation_service_config'
  ) THEN
    RAISE NOTICE 'Translation service configuration table created';
  ELSE
    RAISE EXCEPTION 'Failed to create translation service configuration table';
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'translation_cache'
  ) THEN
    RAISE NOTICE 'Translation cache table created';
  ELSE
    RAISE EXCEPTION 'Failed to create translation cache table';
  END IF;
END $$;