-- Table for venue follows/pounds
CREATE TABLE public.venue_follows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  follow_type TEXT NOT NULL DEFAULT 'follow' CHECK (follow_type IN ('follow', 'pound')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, venue_id, follow_type)
);

-- Enable RLS
ALTER TABLE public.venue_follows ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Anyone can view venue follows"
  ON public.venue_follows FOR SELECT
  USING (true);

CREATE POLICY "Users can create their own follows"
  ON public.venue_follows FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own follows"
  ON public.venue_follows FOR DELETE
  USING (auth.uid() = user_id);

-- Table for driver-customer chat messages
CREATE TABLE public.order_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL,
  order_type TEXT NOT NULL CHECK (order_type IN ('delivery', 'ride')),
  sender_id UUID NOT NULL,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('driver', 'customer')),
  content TEXT NOT NULL,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.order_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies for order messages
CREATE POLICY "Users can view messages for their orders"
  ON public.order_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.food_delivery_orders 
      WHERE id = order_messages.order_id 
      AND (customer_id = auth.uid() OR driver_id = auth.uid())
    )
    OR
    EXISTS (
      SELECT 1 FROM public.ride_bookings 
      WHERE id = order_messages.order_id 
      AND (customer_id = auth.uid() OR driver_id = auth.uid())
    )
  );

CREATE POLICY "Users can send messages for their orders"
  ON public.order_messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id AND (
      EXISTS (
        SELECT 1 FROM public.food_delivery_orders 
        WHERE id = order_messages.order_id 
        AND (customer_id = auth.uid() OR driver_id = auth.uid())
      )
      OR
      EXISTS (
        SELECT 1 FROM public.ride_bookings 
        WHERE id = order_messages.order_id 
        AND (customer_id = auth.uid() OR driver_id = auth.uid())
      )
    )
  );

CREATE POLICY "Users can update their own messages"
  ON public.order_messages FOR UPDATE
  USING (auth.uid() = sender_id);

-- Table for push notification tokens
CREATE TABLE public.push_notification_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  token TEXT NOT NULL,
  device_type TEXT DEFAULT 'web',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, token)
);

-- Enable RLS
ALTER TABLE public.push_notification_tokens ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can manage their own tokens"
  ON public.push_notification_tokens FOR ALL
  USING (auth.uid() = user_id);

-- Enable realtime for order_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_messages;