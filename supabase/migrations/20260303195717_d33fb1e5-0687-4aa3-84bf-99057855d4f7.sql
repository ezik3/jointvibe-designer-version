
ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS country_code TEXT;
ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';
ALTER TABLE venues ADD COLUMN IF NOT EXISTS country_code TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';
CREATE INDEX IF NOT EXISTS idx_customer_profiles_country ON customer_profiles(country_code);
CREATE INDEX IF NOT EXISTS idx_venues_country ON venues(country_code);
