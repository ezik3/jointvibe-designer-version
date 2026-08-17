INSERT INTO public.user_roles (user_id, role)
VALUES ('387d9332-0a97-4453-85d2-f3d24fa4add1', 'owner_superadmin')
ON CONFLICT (user_id, role) DO NOTHING;