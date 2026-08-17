-- Phase 1-5: Vibes, Performers, and Module Extensions

-- 1. Create venue_vibes table for demand testing feature
CREATE TABLE public.venue_vibes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  reach_type TEXT DEFAULT 'local' CHECK (reach_type IN ('local', 'followers', 'city')),
  status TEXT DEFAULT 'collecting' CHECK (status IN ('draft', 'collecting', 'converted', 'expired', 'cancelled')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  converted_to_deal_id UUID,
  response_summary JSONB DEFAULT '{"yes": 0, "maybe": 0, "no": 0}'::jsonb
);

-- Enable RLS for venue_vibes
ALTER TABLE public.venue_vibes ENABLE ROW LEVEL SECURITY;

-- Venue owners can manage their vibes
CREATE POLICY "Venue owners can manage their vibes"
ON public.venue_vibes
FOR ALL
USING (
  venue_id IN (SELECT id FROM public.venues WHERE owner_user_id = auth.uid())
);

-- 2. Create vibe_responses table for customer responses
CREATE TABLE public.vibe_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vibe_id UUID NOT NULL REFERENCES public.venue_vibes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  response TEXT NOT NULL CHECK (response IN ('yes', 'maybe', 'no')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(vibe_id, user_id)
);

-- Enable RLS for vibe_responses
ALTER TABLE public.vibe_responses ENABLE ROW LEVEL SECURITY;

-- Users can insert their own responses
CREATE POLICY "Users can respond to vibes"
ON public.vibe_responses
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can view their own responses
CREATE POLICY "Users can view their responses"
ON public.vibe_responses
FOR SELECT
USING (auth.uid() = user_id);

-- Venue owners can view responses to their vibes
CREATE POLICY "Venue owners can view vibe responses"
ON public.vibe_responses
FOR SELECT
USING (
  vibe_id IN (
    SELECT id FROM public.venue_vibes 
    WHERE venue_id IN (SELECT id FROM public.venues WHERE owner_user_id = auth.uid())
  )
);

-- 3. Create venue_performers table for DJ/Singer/Promoter roles
CREATE TABLE public.venue_performers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('dj', 'singer', 'promoter', 'mc', 'performer')),
  display_name TEXT,
  permissions TEXT[] DEFAULT '{}',
  active_start TIMESTAMPTZ,
  active_end TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'active', 'ended', 'revoked')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for venue_performers
ALTER TABLE public.venue_performers ENABLE ROW LEVEL SECURITY;

-- Venue owners can manage performers
CREATE POLICY "Venue owners can manage performers"
ON public.venue_performers
FOR ALL
USING (
  venue_id IN (SELECT id FROM public.venues WHERE owner_user_id = auth.uid())
);

-- Performers can view and update their own assignments
CREATE POLICY "Performers can view their assignments"
ON public.venue_performers
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Performers can accept assignments"
ON public.venue_performers
FOR UPDATE
USING (auth.uid() = user_id AND status = 'pending')
WITH CHECK (status IN ('accepted', 'active'));

-- 4. Add vibe_credits and vibes_enabled to venue_modules
ALTER TABLE public.venue_modules 
ADD COLUMN IF NOT EXISTS vibe_credits INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS vibes_enabled BOOLEAN DEFAULT true;

-- 5. Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.venue_vibes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vibe_responses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.venue_performers;

-- 6. Create function to update vibe response summary
CREATE OR REPLACE FUNCTION public.update_vibe_response_summary()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.venue_vibes
  SET response_summary = (
    SELECT jsonb_build_object(
      'yes', COUNT(*) FILTER (WHERE response = 'yes'),
      'maybe', COUNT(*) FILTER (WHERE response = 'maybe'),
      'no', COUNT(*) FILTER (WHERE response = 'no')
    )
    FROM public.vibe_responses
    WHERE vibe_id = COALESCE(NEW.vibe_id, OLD.vibe_id)
  )
  WHERE id = COALESCE(NEW.vibe_id, OLD.vibe_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 7. Create trigger to update summary on response changes
CREATE TRIGGER update_vibe_summary_on_response
AFTER INSERT OR UPDATE OR DELETE ON public.vibe_responses
FOR EACH ROW
EXECUTE FUNCTION public.update_vibe_response_summary();