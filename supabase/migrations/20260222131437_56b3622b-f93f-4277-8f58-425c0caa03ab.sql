
-- Add timezone column to venues
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS timezone text;

-- Create shift_reminders table
CREATE TABLE public.shift_reminders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL,
  venue_id uuid NOT NULL REFERENCES public.venues(id),
  roster_id uuid NOT NULL REFERENCES public.employee_roster(id) ON DELETE CASCADE,
  day_of_week text NOT NULL,
  reminder_minutes_before integer NOT NULL DEFAULT 60,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.shift_reminders ENABLE ROW LEVEL SECURITY;

-- Employees can CRUD their own reminders
CREATE POLICY "Employees can view own reminders"
ON public.shift_reminders FOR SELECT TO authenticated
USING (auth.uid() = employee_id);

CREATE POLICY "Employees can insert own reminders"
ON public.shift_reminders FOR INSERT TO authenticated
WITH CHECK (auth.uid() = employee_id);

CREATE POLICY "Employees can update own reminders"
ON public.shift_reminders FOR UPDATE TO authenticated
USING (auth.uid() = employee_id)
WITH CHECK (auth.uid() = employee_id);

CREATE POLICY "Employees can delete own reminders"
ON public.shift_reminders FOR DELETE TO authenticated
USING (auth.uid() = employee_id);

-- Enable realtime on employee_roster
ALTER PUBLICATION supabase_realtime ADD TABLE public.employee_roster;

-- Add unique constraint to prevent duplicate reminders
ALTER TABLE public.shift_reminders ADD CONSTRAINT unique_employee_roster_reminder UNIQUE (employee_id, roster_id);
