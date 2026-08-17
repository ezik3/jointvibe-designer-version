-- Employee Venue Links (connects employees to venues they work at)
CREATE TABLE public.employee_venue_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'staff', -- 'kitchen', 'waiter', 'bartender', 'host', 'manager'
  permissions JSONB DEFAULT '{"pos": true, "kitchen": false, "tables": true, "orders": true, "menu": false, "inventory": false, "analytics": false, "staff": false, "settings": false}'::jsonb,
  pin_hash TEXT, -- Hashed 6-digit PIN for POS access
  is_active BOOLEAN DEFAULT true,
  hired_date TIMESTAMPTZ DEFAULT now(),
  terminated_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, venue_id)
);

-- Employee Invitations
CREATE TABLE public.employee_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  employee_email TEXT NOT NULL,
  invited_by UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff',
  permissions JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'pending', -- 'pending', 'accepted', 'declined', 'expired'
  invitation_token UUID DEFAULT gen_random_uuid(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Employee Shifts (clock in/out tracking)
CREATE TABLE public.employee_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL,
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  clock_in_time TIMESTAMPTZ DEFAULT now(),
  clock_out_time TIMESTAMPTZ,
  clock_in_location JSONB, -- {latitude, longitude}
  clock_out_location JSONB,
  total_sales NUMERIC(10,2) DEFAULT 0,
  orders_served INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active', -- 'active', 'break', 'ended'
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Roster/Schedule
CREATE TABLE public.employee_roster (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL,
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  day_of_week TEXT NOT NULL, -- 'monday', 'tuesday', etc.
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_recurring BOOLEAN DEFAULT true,
  specific_date DATE, -- For non-recurring, one-time shifts
  station TEXT, -- 'bar', 'floor', 'kitchen', 'host'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.employee_venue_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_roster ENABLE ROW LEVEL SECURITY;

-- RLS Policies for employee_venue_links
CREATE POLICY "Venue managers can manage employees"
ON public.employee_venue_links
FOR ALL
USING (
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Employees can view own link"
ON public.employee_venue_links
FOR SELECT
USING (auth.uid() = user_id);

-- RLS Policies for employee_invitations
CREATE POLICY "Venue managers can manage invitations"
ON public.employee_invitations
FOR ALL
USING (
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Invitees can view own invitations"
ON public.employee_invitations
FOR SELECT
USING (employee_email = (SELECT email FROM auth.users WHERE id = auth.uid()));

CREATE POLICY "Invitees can update own invitations"
ON public.employee_invitations
FOR UPDATE
USING (employee_email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- RLS Policies for employee_shifts
CREATE POLICY "Venue staff can view shifts"
ON public.employee_shifts
FOR SELECT
USING (true);

CREATE POLICY "Employees can manage own shifts"
ON public.employee_shifts
FOR ALL
USING (auth.uid() = employee_id);

CREATE POLICY "Managers can manage all shifts"
ON public.employee_shifts
FOR ALL
USING (
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- RLS Policies for employee_roster
CREATE POLICY "Staff can view roster"
ON public.employee_roster
FOR SELECT
USING (true);

CREATE POLICY "Managers can manage roster"
ON public.employee_roster
FOR ALL
USING (
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- Add index for faster lookups
CREATE INDEX idx_employee_venue_links_user ON public.employee_venue_links(user_id);
CREATE INDEX idx_employee_venue_links_venue ON public.employee_venue_links(venue_id);
CREATE INDEX idx_employee_shifts_employee ON public.employee_shifts(employee_id);
CREATE INDEX idx_employee_shifts_venue ON public.employee_shifts(venue_id);
CREATE INDEX idx_employee_roster_employee ON public.employee_roster(employee_id);
CREATE INDEX idx_employee_roster_venue ON public.employee_roster(venue_id);