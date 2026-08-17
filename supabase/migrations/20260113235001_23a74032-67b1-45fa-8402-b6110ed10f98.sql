-- Fix: Customer profiles should require authentication to view
-- Drop the existing overly permissive policy
DROP POLICY IF EXISTS "Anyone can view customer profiles" ON customer_profiles;

-- Create new policy requiring authentication
CREATE POLICY "Authenticated users can view customer profiles" 
ON customer_profiles 
FOR SELECT 
USING (auth.uid() IS NOT NULL);