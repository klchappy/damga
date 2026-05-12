-- Default-deny RLS hardening for Damga public tables.
--
-- Damga's Express API uses the Supabase service_role key and bypasses RLS, so
-- enabling RLS here does not change normal app behavior. It closes direct
-- Supabase PostgREST access with the browser/public anon key unless explicit
-- policies are added later.

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT LIKE 'pg_%'
      AND tablename NOT LIKE '_prisma%'
      AND tablename NOT LIKE '__drizzle%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
