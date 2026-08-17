
-- First: Add the new enum values only
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'owner_superadmin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin_manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin_support';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin_finance';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin_compliance';
