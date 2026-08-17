ALTER TABLE public.user_follows 
ADD COLUMN IF NOT EXISTS is_close_friend boolean DEFAULT false;