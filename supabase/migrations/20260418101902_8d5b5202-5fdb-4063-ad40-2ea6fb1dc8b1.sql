-- Phase A: schema + detector + triggers (backfill done separately)

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS source_language text,
  ADD COLUMN IF NOT EXISTS language_confidence numeric;

ALTER TABLE public.post_comments
  ADD COLUMN IF NOT EXISTS source_language text,
  ADD COLUMN IF NOT EXISTS language_confidence numeric;

ALTER TABLE public.live_chat_messages
  ADD COLUMN IF NOT EXISTS source_language text,
  ADD COLUMN IF NOT EXISTS language_confidence numeric;

ALTER TABLE public.order_messages
  ADD COLUMN IF NOT EXISTS source_language text,
  ADD COLUMN IF NOT EXISTS language_confidence numeric;

ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS source_language text,
  ADD COLUMN IF NOT EXISTS language_confidence numeric;

CREATE INDEX IF NOT EXISTS idx_posts_source_language
  ON public.posts (source_language) WHERE source_language IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_post_comments_source_language
  ON public.post_comments (source_language) WHERE source_language IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_live_chat_messages_source_language
  ON public.live_chat_messages (source_language) WHERE source_language IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_messages_source_language
  ON public.order_messages (source_language) WHERE source_language IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_venues_source_language
  ON public.venues (source_language) WHERE source_language IS NOT NULL;

CREATE OR REPLACE FUNCTION public.detect_text_language(p_text text)
RETURNS TABLE(lang text, confidence numeric)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_text text;
  v_lower text;
  v_words text[];
  v_word_count int;
  v_score record;
  v_best_lang text := 'en';
  v_best_score int := 0;
BEGIN
  IF p_text IS NULL THEN
    RETURN QUERY SELECT NULL::text, 0::numeric; RETURN;
  END IF;

  v_text := trim(p_text);
  IF length(v_text) < 3 THEN
    RETURN QUERY SELECT 'en'::text, 0.1::numeric; RETURN;
  END IF;

  v_text := regexp_replace(v_text, 'https?://[^\s]+', ' ', 'g');
  v_text := regexp_replace(v_text, '[@#]\w+', ' ', 'g');
  v_lower := lower(v_text);

  IF v_text ~ '[\u4E00-\u9FFF]' THEN
    RETURN QUERY SELECT 'zh'::text, 0.95::numeric; RETURN;
  ELSIF v_text ~ '[\u3040-\u309F\u30A0-\u30FF]' THEN
    RETURN QUERY SELECT 'ja'::text, 0.95::numeric; RETURN;
  ELSIF v_text ~ '[\uAC00-\uD7AF]' THEN
    RETURN QUERY SELECT 'ko'::text, 0.95::numeric; RETURN;
  ELSIF v_text ~ '[\u0600-\u06FF]' THEN
    RETURN QUERY SELECT 'ar'::text, 0.95::numeric; RETURN;
  ELSIF v_text ~ '[\u0400-\u04FF]' THEN
    RETURN QUERY SELECT 'ru'::text, 0.9::numeric; RETURN;
  ELSIF v_text ~ '[\u0900-\u097F]' THEN
    RETURN QUERY SELECT 'hi'::text, 0.95::numeric; RETURN;
  ELSIF v_text ~ '[\u0E00-\u0E7F]' THEN
    RETURN QUERY SELECT 'th'::text, 0.95::numeric; RETURN;
  END IF;

  v_words := regexp_split_to_array(v_lower, '\s+');
  v_word_count := array_length(v_words, 1);
  IF v_word_count IS NULL OR v_word_count = 0 THEN
    RETURN QUERY SELECT 'en'::text, 0.1::numeric; RETURN;
  END IF;

  FOR v_score IN
    SELECT l.code, COUNT(*) FILTER (WHERE w = ANY(l.stopwords))::int AS hits
    FROM unnest(v_words) AS w
    CROSS JOIN (VALUES
      ('en', ARRAY['the','a','an','and','or','but','is','are','was','were','be','to','of','in','on','at','for','with','from','this','that','it','you','have','has','not','what','when','where','how','all','can','will','just','about','like','get','if','so','no','yes']),
      ('es', ARRAY['el','la','los','las','un','una','y','o','pero','es','son','era','ser','de','en','con','por','para','que','este','esta','yo','tu','ella','nosotros','ellos','mi','su','tener','hacer','no','si','muy','mas','como','cuando','donde','porque','todo','puede','va','le','se','lo','del','al','ya']),
      ('fr', ARRAY['le','la','les','un','une','des','et','ou','mais','est','sont','etait','etre','de','dans','avec','pour','par','que','ce','cette','ces','je','tu','il','elle','nous','vous','ils','mon','son','avoir','faire','ne','pas','si','oui','non','tres','plus','comme','quand','pourquoi','tout','peut','va','au','du','aux','sur']),
      ('de', ARRAY['der','die','das','ein','eine','und','oder','aber','ist','sind','war','sein','von','in','an','auf','zu','mit','fur','durch','dass','dies','diese','ich','du','er','sie','wir','ihr','mein','haben','machen','nicht','ja','nein','sehr','mehr','wie','wann','wo','warum','alles','kann','wird','dem','den','des','im','am','bei','nach']),
      ('pt', ARRAY['o','a','os','as','um','uma','e','ou','mas','sao','era','ser','estar','de','em','com','por','para','que','este','esta','isto','isso','eu','tu','ele','ela','nos','eles','meu','seu','ter','fazer','nao','sim','muito','mais','como','quando','onde','porque','tudo','pode','vai','do','da','no','na','se','ja']),
      ('it', ARRAY['il','la','i','le','un','una','e','o','ma','sono','era','essere','di','in','con','per','che','questo','questa','io','tu','lui','lei','noi','voi','loro','mio','suo','avere','fare','non','si','no','molto','piu','come','quando','dove','perche','tutto','puo','va','del','della','nel','nella','al','alla','dal','sul']),
      ('nl', ARRAY['de','het','een','en','of','maar','is','zijn','was','waren','van','in','op','aan','met','voor','door','dat','dit','deze','ik','jij','hij','zij','wij','jullie','mijn','hebben','doen','niet','ja','nee','heel','meer','als','wanneer','waar','waarom','alles','kan','zal','om','te','bij','naar','uit','over','onder'])
    ) AS l(code, stopwords)
    GROUP BY l.code
    ORDER BY hits DESC
    LIMIT 7
  LOOP
    IF v_score.hits > v_best_score THEN
      v_best_score := v_score.hits;
      v_best_lang := v_score.code;
    END IF;
  END LOOP;

  IF v_best_score = 0 THEN
    RETURN QUERY SELECT 'en'::text, 0.2::numeric;
  ELSE
    RETURN QUERY SELECT v_best_lang, LEAST(0.9, GREATEST(0.3, v_best_score::numeric / GREATEST(v_word_count, 1)::numeric * 2.0));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_content_language()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_text text;
  v_result record;
BEGIN
  IF NEW.source_language IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_text := CASE TG_TABLE_NAME
    WHEN 'posts' THEN NEW.content
    WHEN 'post_comments' THEN NEW.content
    WHEN 'live_chat_messages' THEN NEW.content
    WHEN 'order_messages' THEN NEW.content
    WHEN 'venues' THEN NEW.description
    ELSE NULL
  END;

  IF v_text IS NULL OR length(trim(v_text)) < 3 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_result FROM public.detect_text_language(v_text);
  NEW.source_language := v_result.lang;
  NEW.language_confidence := v_result.confidence;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_detect_lang_posts ON public.posts;
CREATE TRIGGER trg_detect_lang_posts
  BEFORE INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.set_content_language();

DROP TRIGGER IF EXISTS trg_detect_lang_post_comments ON public.post_comments;
CREATE TRIGGER trg_detect_lang_post_comments
  BEFORE INSERT ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_content_language();

DROP TRIGGER IF EXISTS trg_detect_lang_live_chat ON public.live_chat_messages;
CREATE TRIGGER trg_detect_lang_live_chat
  BEFORE INSERT ON public.live_chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_content_language();

DROP TRIGGER IF EXISTS trg_detect_lang_order_messages ON public.order_messages;
CREATE TRIGGER trg_detect_lang_order_messages
  BEFORE INSERT ON public.order_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_content_language();

DROP TRIGGER IF EXISTS trg_detect_lang_venues ON public.venues;
CREATE TRIGGER trg_detect_lang_venues
  BEFORE INSERT ON public.venues
  FOR EACH ROW EXECUTE FUNCTION public.set_content_language();