CREATE TABLE public.venue_ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL,
  usage_type text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.venue_ai_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Venues can read own AI usage" ON public.venue_ai_usage
  FOR SELECT TO authenticated
  USING (venue_id IN (SELECT id FROM public.venues WHERE owner_user_id = auth.uid()));
CREATE POLICY "Venues can insert own AI usage" ON public.venue_ai_usage
  FOR INSERT TO authenticated
  WITH CHECK (venue_id IN (SELECT id FROM public.venues WHERE owner_user_id = auth.uid()));