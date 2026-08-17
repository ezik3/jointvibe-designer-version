
CREATE OR REPLACE FUNCTION public.increment_vibe_behavioral_weight(
  p_user_id uuid,
  p_tag_name text,
  p_increment numeric DEFAULT 0.1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.user_vibe_preferences (user_id, tag_name, declared_weight, behavioral_weight, last_reinforced_at)
  VALUES (p_user_id, p_tag_name, 0, p_increment, now())
  ON CONFLICT (user_id, tag_name) DO UPDATE SET
    behavioral_weight = LEAST(5.0, user_vibe_preferences.behavioral_weight + p_increment),
    last_reinforced_at = now();
END;
$$;
