INSERT INTO public.user_roles (user_id, role)
VALUES ('ff6ad0dd-8ea6-4f88-aff8-ca5b979d0c22', 'owner_superadmin')
ON CONFLICT (user_id, role) DO NOTHING;