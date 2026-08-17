-- Add unique constraint for upsert operations
ALTER TABLE public.venue_vibe_credits
ADD CONSTRAINT venue_vibe_credits_venue_reach_type_unique 
UNIQUE (venue_id, reach_tier, credit_type);