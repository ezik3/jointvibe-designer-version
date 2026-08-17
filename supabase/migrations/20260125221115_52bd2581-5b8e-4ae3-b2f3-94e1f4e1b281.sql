-- Add INSERT policy for profiles table so users can create their own profile
CREATE POLICY "Users can insert their own profile"
ON public.profiles
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Add INSERT policy for user_roles table so the system can assign roles during signup
-- Using a service role or allowing users to insert their own initial role
CREATE POLICY "Users can insert their own role"
ON public.user_roles
FOR INSERT
WITH CHECK (auth.uid() = user_id);