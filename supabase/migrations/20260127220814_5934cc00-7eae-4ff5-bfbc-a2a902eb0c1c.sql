-- Create verification_documents table for detailed ID OCR results
CREATE TABLE public.verification_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  document_type TEXT NOT NULL, -- drivers_license, passport, age_card
  document_side TEXT NOT NULL DEFAULT 'front', -- front, back
  storage_url TEXT NOT NULL,
  s3_key TEXT, -- S3 key for AWS processing
  
  -- OCR extracted fields
  extracted_full_name TEXT,
  extracted_first_name TEXT,
  extracted_last_name TEXT,
  extracted_date_of_birth DATE,
  extracted_document_number TEXT,
  extracted_expiry_date DATE,
  extracted_issue_date DATE,
  extracted_country TEXT,
  extracted_address TEXT,
  extracted_gender TEXT,
  
  -- Confidence scores
  name_confidence NUMERIC,
  dob_confidence NUMERIC,
  document_number_confidence NUMERIC,
  overall_confidence NUMERIC,
  
  -- Raw OCR data
  raw_ocr_text TEXT,
  raw_ocr_blocks JSONB,
  
  -- Computed flags
  is_expired BOOLEAN DEFAULT FALSE,
  computed_age INTEGER,
  is_18_plus BOOLEAN DEFAULT FALSE,
  is_21_plus BOOLEAN DEFAULT FALSE,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, approved, needs_review, failed
  failure_reason TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create venue_verification_documents table for business document verification
CREATE TABLE public.venue_verification_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL,
  document_type TEXT NOT NULL, -- utility_bill, business_registration, liquor_license, lease_agreement, tax_certificate
  storage_url TEXT NOT NULL,
  s3_key TEXT,
  
  -- OCR extracted fields
  extracted_business_name TEXT,
  extracted_address TEXT,
  extracted_city TEXT,
  extracted_state TEXT,
  extracted_postal_code TEXT,
  extracted_country TEXT,
  extracted_issue_date DATE,
  extracted_expiry_date DATE,
  extracted_document_number TEXT,
  extracted_account_number TEXT,
  
  -- Confidence scores
  business_name_confidence NUMERIC,
  address_confidence NUMERIC,
  overall_confidence NUMERIC,
  
  -- Address match results
  address_match_score NUMERIC,
  business_name_match_score NUMERIC,
  
  -- Raw OCR data
  raw_ocr_text TEXT,
  raw_ocr_blocks JSONB,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, approved, needs_review, rejected
  failure_reason TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  admin_notes TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add indexes
CREATE INDEX idx_verification_documents_user_id ON public.verification_documents(user_id);
CREATE INDEX idx_verification_documents_status ON public.verification_documents(status);
CREATE INDEX idx_venue_verification_documents_venue_id ON public.venue_verification_documents(venue_id);
CREATE INDEX idx_venue_verification_documents_status ON public.venue_verification_documents(status);

-- Enable RLS
ALTER TABLE public.verification_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_verification_documents ENABLE ROW LEVEL SECURITY;

-- RLS policies for verification_documents
CREATE POLICY "Users can view own verification documents"
  ON public.verification_documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own verification documents"
  ON public.verification_documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "System can update verification documents"
  ON public.verification_documents FOR UPDATE
  USING (true);

CREATE POLICY "Admins can view all verification documents"
  ON public.verification_documents FOR SELECT
  USING (is_admin(auth.uid()));

-- RLS policies for venue_verification_documents
CREATE POLICY "Venue owners can view venue verification documents"
  ON public.venue_verification_documents FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM venues 
    WHERE venues.id = venue_verification_documents.venue_id 
    AND venues.owner_user_id = auth.uid()
  ));

CREATE POLICY "Venue owners can insert venue verification documents"
  ON public.venue_verification_documents FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM venues 
    WHERE venues.id = venue_verification_documents.venue_id 
    AND venues.owner_user_id = auth.uid()
  ));

CREATE POLICY "System can update venue verification documents"
  ON public.venue_verification_documents FOR UPDATE
  USING (true);

CREATE POLICY "Admins can view all venue verification documents"
  ON public.venue_verification_documents FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can update venue verification documents"
  ON public.venue_verification_documents FOR UPDATE
  USING (is_admin(auth.uid()));

-- Add trigger for updated_at
CREATE TRIGGER update_verification_documents_updated_at
  BEFORE UPDATE ON public.verification_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_venue_verification_documents_updated_at
  BEFORE UPDATE ON public.venue_verification_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();