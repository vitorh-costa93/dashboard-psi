CREATE TABLE IF NOT EXISTS public.app_admin (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_admin ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.app_admin FROM anon, authenticated;

DROP POLICY IF EXISTS "Permitir tudo via service role" ON public.atividades;
DROP POLICY IF EXISTS "Permitir tudo via service role" ON public.pacientes;
DROP POLICY IF EXISTS "Permitir tudo via service role" ON public.posts;
DROP POLICY IF EXISTS "Permitir tudo via service role" ON public.prontuarios;
DROP POLICY IF EXISTS "Permitir tudo via service role" ON public.trend_radar;

REVOKE ALL ON TABLE public.atividades FROM anon, authenticated;
REVOKE ALL ON TABLE public.pacientes FROM anon, authenticated;
REVOKE ALL ON TABLE public.post_artes FROM anon, authenticated;
REVOKE ALL ON TABLE public.posts FROM anon, authenticated;
REVOKE ALL ON TABLE public.prontuarios FROM anon, authenticated;
REVOKE ALL ON TABLE public.trend_radar FROM anon, authenticated;

