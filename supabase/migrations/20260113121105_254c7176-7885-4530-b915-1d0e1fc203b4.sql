-- Create enum for ID document types
CREATE TYPE public.id_document_type AS ENUM ('drivers_license', 'passport', 'age_card');

-- Create enum for verification status
CREATE TYPE public.verification_status AS ENUM ('unverified', 'pending', 'verified', 'rejected');

-- Create user identity verification table
CREATE TABLE public.user_verification (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    
    -- Document info
    document_type public.id_document_type,
    document_front_url TEXT,
    document_back_url TEXT,
    
    -- Extracted data from OCR
    extracted_name TEXT,
    extracted_dob DATE,
    document_number TEXT,
    document_expiry DATE,
    issuing_country TEXT,
    
    -- Face biometrics
    selfie_url TEXT,
    face_match_confidence DECIMAL(5,2),
    liveness_score DECIMAL(5,2),
    biometric_template_id TEXT, -- Reference for future face matching
    
    -- Verification status
    document_status public.verification_status DEFAULT 'unverified',
    face_status public.verification_status DEFAULT 'unverified',
    overall_status public.verification_status DEFAULT 'unverified',
    is_age_verified BOOLEAN DEFAULT FALSE,
    
    -- Age calculation
    verified_age INTEGER,
    is_18_plus BOOLEAN DEFAULT FALSE,
    is_21_plus BOOLEAN DEFAULT FALSE,
    
    -- Audit trail
    verified_at TIMESTAMP WITH TIME ZONE,
    rejected_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    aws_verification_id TEXT, -- For AWS Rekognition reference
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_verification ENABLE ROW LEVEL SECURITY;

-- Users can view their own verification
CREATE POLICY "Users can view own verification"
ON public.user_verification
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own verification
CREATE POLICY "Users can create own verification"
ON public.user_verification
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own pending verification
CREATE POLICY "Users can update own pending verification"
ON public.user_verification
FOR UPDATE
USING (auth.uid() = user_id AND overall_status IN ('unverified', 'pending'));

-- Add is_18_plus flag to venues table for age-restricted venues
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS is_18_plus BOOLEAN DEFAULT FALSE;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS is_21_plus BOOLEAN DEFAULT FALSE;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS requires_id_verification BOOLEAN DEFAULT FALSE;

-- Create trigger for updated_at
CREATE TRIGGER update_user_verification_updated_at
BEFORE UPDATE ON public.user_verification
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for fast lookups
CREATE INDEX idx_user_verification_user_id ON public.user_verification(user_id);
CREATE INDEX idx_user_verification_status ON public.user_verification(overall_status);