-- Create venue_reports table for scammer/fraud reporting
CREATE TABLE public.venue_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id UUID NOT NULL,
  reported_venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL CHECK (report_type IN ('scam', 'impersonation', 'fraud', 'inappropriate_content', 'wrong_location', 'closed_business', 'other')),
  description TEXT NOT NULL,
  evidence_urls TEXT[],
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'resolved', 'dismissed')),
  admin_notes TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.venue_reports ENABLE ROW LEVEL SECURITY;

-- Users can create reports
CREATE POLICY "Users can create venue reports"
ON public.venue_reports
FOR INSERT
WITH CHECK (auth.uid() = reporter_id);

-- Users can view their own reports
CREATE POLICY "Users can view their own reports"
ON public.venue_reports
FOR SELECT
USING (auth.uid() = reporter_id);

-- Admins can view all reports
CREATE POLICY "Admins can view all venue reports"
ON public.venue_reports
FOR SELECT
USING (public.is_admin(auth.uid()));

-- Admins can update reports
CREATE POLICY "Admins can update venue reports"
ON public.venue_reports
FOR UPDATE
USING (public.is_admin(auth.uid()));

-- Add trigger for updated_at
CREATE TRIGGER update_venue_reports_updated_at
BEFORE UPDATE ON public.venue_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add venue_setup_type column to venues table
ALTER TABLE public.venues 
ADD COLUMN IF NOT EXISTS venue_setup_type TEXT DEFAULT 'permanent' CHECK (venue_setup_type IN ('permanent', 'mobile', 'temporary', 'home_based'));

-- Add staff_size column to venues table
ALTER TABLE public.venues 
ADD COLUMN IF NOT EXISTS staff_size TEXT;