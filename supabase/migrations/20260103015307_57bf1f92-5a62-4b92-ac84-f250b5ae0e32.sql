-- Create a table to track reservation reminders sent
CREATE TABLE public.reservation_reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reservation_id UUID NOT NULL REFERENCES public.table_reservations(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL, -- '1_day', '8_hours', '1_hour', '30_min'
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add unique constraint to prevent duplicate reminders
ALTER TABLE public.reservation_reminders 
ADD CONSTRAINT unique_reminder UNIQUE (reservation_id, reminder_type);

-- Enable RLS
ALTER TABLE public.reservation_reminders ENABLE ROW LEVEL SECURITY;

-- Allow system to insert/manage reminders
CREATE POLICY "System can manage reminders"
ON public.reservation_reminders
FOR ALL
USING (true);

-- Create a notifications table for customer notifications
CREATE TABLE public.customer_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL, -- 'reservation_reminder', 'order_update', 'like', 'comment', 'follow', etc.
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  reference_id UUID, -- Can link to order_id, reservation_id, post_id, etc.
  reference_type TEXT, -- 'reservation', 'order', 'post', etc.
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.customer_notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications
CREATE POLICY "Users can view own notifications"
ON public.customer_notifications
FOR SELECT
USING (auth.uid() = user_id);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications"
ON public.customer_notifications
FOR UPDATE
USING (auth.uid() = user_id);

-- System can insert notifications
CREATE POLICY "System can insert notifications"
ON public.customer_notifications
FOR INSERT
WITH CHECK (true);

-- Add realtime support
ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_notifications;

-- Create index for faster queries
CREATE INDEX idx_customer_notifications_user_id ON public.customer_notifications(user_id);
CREATE INDEX idx_customer_notifications_created_at ON public.customer_notifications(created_at DESC);