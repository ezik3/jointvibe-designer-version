-- Translation cache table
CREATE TABLE IF NOT EXISTS public.content_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type text NOT NULL,
  content_id uuid NOT NULL,
  source_lang text NOT NULL,
  target_lang text NOT NULL,
  source_hash text NOT NULL,
  translated_text text NOT NULL,
  provider text NOT NULL DEFAULT 'lovable-ai',
  confidence numeric DEFAULT 1.0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT content_translations_unique UNIQUE (content_type, content_id, target_lang, source_hash)
);

CREATE INDEX IF NOT EXISTS idx_content_translations_lookup
  ON public.content_translations (content_type, content_id, target_lang);

CREATE INDEX IF NOT EXISTS idx_content_translations_created
  ON public.content_translations (created_at DESC);

ALTER TABLE public.content_translations ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read cached translations
CREATE POLICY "Authenticated users can read translations"
ON public.content_translations
FOR SELECT
TO authenticated
USING (true);

-- Only service role writes (edge function uses service role)
CREATE POLICY "Service role manages translations"
ON public.content_translations
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);