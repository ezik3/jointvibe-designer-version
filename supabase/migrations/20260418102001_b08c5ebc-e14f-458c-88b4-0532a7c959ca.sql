-- Two trigger functions: one for tables with a 'content' column, one for venues' 'description'

CREATE OR REPLACE FUNCTION public.set_content_language_for_content()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result record;
BEGIN
  IF NEW.source_language IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.content IS NULL OR length(trim(NEW.content)) < 3 THEN RETURN NEW; END IF;
  SELECT * INTO v_result FROM public.detect_text_language(NEW.content);
  NEW.source_language := v_result.lang;
  NEW.language_confidence := v_result.confidence;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_content_language_for_description()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result record;
BEGIN
  IF NEW.source_language IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.description IS NULL OR length(trim(NEW.description)) < 3 THEN RETURN NEW; END IF;
  SELECT * INTO v_result FROM public.detect_text_language(NEW.description);
  NEW.source_language := v_result.lang;
  NEW.language_confidence := v_result.confidence;
  RETURN NEW;
END;
$$;

-- Re-attach triggers to the correct functions
DROP TRIGGER IF EXISTS trg_detect_lang_posts ON public.posts;
CREATE TRIGGER trg_detect_lang_posts BEFORE INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.set_content_language_for_content();

DROP TRIGGER IF EXISTS trg_detect_lang_post_comments ON public.post_comments;
CREATE TRIGGER trg_detect_lang_post_comments BEFORE INSERT ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_content_language_for_content();

DROP TRIGGER IF EXISTS trg_detect_lang_live_chat ON public.live_chat_messages;
CREATE TRIGGER trg_detect_lang_live_chat BEFORE INSERT ON public.live_chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_content_language_for_content();

DROP TRIGGER IF EXISTS trg_detect_lang_order_messages ON public.order_messages;
CREATE TRIGGER trg_detect_lang_order_messages BEFORE INSERT ON public.order_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_content_language_for_content();

DROP TRIGGER IF EXISTS trg_detect_lang_venues ON public.venues;
CREATE TRIGGER trg_detect_lang_venues BEFORE INSERT ON public.venues
  FOR EACH ROW EXECUTE FUNCTION public.set_content_language_for_description();

-- Drop the broken combined function
DROP FUNCTION IF EXISTS public.set_content_language();