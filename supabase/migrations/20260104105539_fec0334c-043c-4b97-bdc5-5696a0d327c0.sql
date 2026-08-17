-- Create enum for property types
CREATE TYPE public.property_type AS ENUM ('for_sale', 'for_lease', 'for_rent');

-- Create enum for ad campaign status
CREATE TYPE public.ad_campaign_status AS ENUM ('draft', 'pending', 'approved', 'rejected', 'live', 'paused', 'completed');

-- Create enum for ad placement types
CREATE TYPE public.ad_placement_type AS ENUM ('city_view', 'public_post', 'both');

-- Create advertisers table (real estate agents, homeowners, businesses)
CREATE TABLE public.advertisers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  company_name TEXT,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  license_number TEXT,
  is_verified BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id)
);

-- Create ad campaigns table (individual property advertisements)
CREATE TABLE public.ad_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id UUID REFERENCES public.advertisers(id) ON DELETE CASCADE NOT NULL,
  property_address TEXT NOT NULL,
  city TEXT NOT NULL,
  property_price NUMERIC,
  property_type property_type NOT NULL,
  bedrooms INTEGER,
  bathrooms INTEGER,
  parking INTEGER,
  headline TEXT NOT NULL,
  description TEXT,
  cta_text TEXT DEFAULT 'View Property',
  cta_url TEXT,
  status ad_campaign_status DEFAULT 'draft',
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create ad media table (images/videos for campaigns)
CREATE TABLE public.ad_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.ad_campaigns(id) ON DELETE CASCADE NOT NULL,
  media_url TEXT NOT NULL,
  media_type TEXT DEFAULT 'image',
  is_primary BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create ad bookings table (time slots and payments)
CREATE TABLE public.ad_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.ad_campaigns(id) ON DELETE CASCADE NOT NULL,
  placement_type ad_placement_type NOT NULL,
  target_cities TEXT[] NOT NULL,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  base_price NUMERIC NOT NULL,
  bid_amount NUMERIC DEFAULT 0,
  final_price NUMERIC NOT NULL,
  payment_status TEXT DEFAULT 'pending',
  stripe_payment_intent_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create ad analytics table (track impressions, clicks)
CREATE TABLE public.ad_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.ad_campaigns(id) ON DELETE CASCADE NOT NULL,
  booking_id UUID REFERENCES public.ad_bookings(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  ctr NUMERIC DEFAULT 0,
  placement_type ad_placement_type,
  city TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.advertisers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_analytics ENABLE ROW LEVEL SECURITY;

-- Advertisers policies
CREATE POLICY "Users can view own advertiser profile"
ON public.advertisers FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own advertiser profile"
ON public.advertisers FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own advertiser profile"
ON public.advertisers FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all advertisers"
ON public.advertisers FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can update all advertisers"
ON public.advertisers FOR UPDATE
USING (is_admin(auth.uid()));

-- Ad campaigns policies
CREATE POLICY "Advertisers can view own campaigns"
ON public.ad_campaigns FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.advertisers
  WHERE advertisers.id = ad_campaigns.advertiser_id
  AND advertisers.user_id = auth.uid()
));

CREATE POLICY "Advertisers can create campaigns"
ON public.ad_campaigns FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.advertisers
  WHERE advertisers.id = ad_campaigns.advertiser_id
  AND advertisers.user_id = auth.uid()
));

CREATE POLICY "Advertisers can update own campaigns"
ON public.ad_campaigns FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.advertisers
  WHERE advertisers.id = ad_campaigns.advertiser_id
  AND advertisers.user_id = auth.uid()
));

CREATE POLICY "Advertisers can delete draft campaigns"
ON public.ad_campaigns FOR DELETE
USING (EXISTS (
  SELECT 1 FROM public.advertisers
  WHERE advertisers.id = ad_campaigns.advertiser_id
  AND advertisers.user_id = auth.uid()
) AND status = 'draft');

CREATE POLICY "Admins can view all campaigns"
ON public.ad_campaigns FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can update all campaigns"
ON public.ad_campaigns FOR UPDATE
USING (is_admin(auth.uid()));

CREATE POLICY "Public can view live campaigns"
ON public.ad_campaigns FOR SELECT
USING (status = 'live');

-- Ad media policies
CREATE POLICY "Advertisers can manage own campaign media"
ON public.ad_media FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.ad_campaigns
  JOIN public.advertisers ON advertisers.id = ad_campaigns.advertiser_id
  WHERE ad_campaigns.id = ad_media.campaign_id
  AND advertisers.user_id = auth.uid()
));

CREATE POLICY "Public can view media for live campaigns"
ON public.ad_media FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.ad_campaigns
  WHERE ad_campaigns.id = ad_media.campaign_id
  AND ad_campaigns.status = 'live'
));

-- Ad bookings policies
CREATE POLICY "Advertisers can view own bookings"
ON public.ad_bookings FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.ad_campaigns
  JOIN public.advertisers ON advertisers.id = ad_campaigns.advertiser_id
  WHERE ad_campaigns.id = ad_bookings.campaign_id
  AND advertisers.user_id = auth.uid()
));

CREATE POLICY "Advertisers can create bookings"
ON public.ad_bookings FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.ad_campaigns
  JOIN public.advertisers ON advertisers.id = ad_campaigns.advertiser_id
  WHERE ad_campaigns.id = ad_bookings.campaign_id
  AND advertisers.user_id = auth.uid()
));

CREATE POLICY "Admins can manage all bookings"
ON public.ad_bookings FOR ALL
USING (is_admin(auth.uid()));

-- Ad analytics policies
CREATE POLICY "Advertisers can view own analytics"
ON public.ad_analytics FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.ad_campaigns
  JOIN public.advertisers ON advertisers.id = ad_campaigns.advertiser_id
  WHERE ad_campaigns.id = ad_analytics.campaign_id
  AND advertisers.user_id = auth.uid()
));

CREATE POLICY "System can insert analytics"
ON public.ad_analytics FOR INSERT
WITH CHECK (true);

CREATE POLICY "System can update analytics"
ON public.ad_analytics FOR UPDATE
USING (true);

CREATE POLICY "Admins can view all analytics"
ON public.ad_analytics FOR SELECT
USING (is_admin(auth.uid()));

-- Create indexes for performance
CREATE INDEX idx_ad_campaigns_advertiser ON public.ad_campaigns(advertiser_id);
CREATE INDEX idx_ad_campaigns_city ON public.ad_campaigns(city);
CREATE INDEX idx_ad_campaigns_status ON public.ad_campaigns(status);
CREATE INDEX idx_ad_bookings_campaign ON public.ad_bookings(campaign_id);
CREATE INDEX idx_ad_bookings_dates ON public.ad_bookings(start_date, end_date);
CREATE INDEX idx_ad_analytics_campaign ON public.ad_analytics(campaign_id);
CREATE INDEX idx_ad_analytics_date ON public.ad_analytics(date);

-- Create updated_at triggers
CREATE TRIGGER update_advertisers_updated_at
BEFORE UPDATE ON public.advertisers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ad_campaigns_updated_at
BEFORE UPDATE ON public.ad_campaigns
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ad_bookings_updated_at
BEFORE UPDATE ON public.ad_bookings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ad_analytics_updated_at
BEFORE UPDATE ON public.ad_analytics
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();