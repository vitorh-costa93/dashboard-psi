CREATE TABLE public.psm_modelos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publico text NOT NULL CHECK (publico IN ('adulto', 'infantil')),
  titulo text NOT NULL,
  valor_individual numeric(10,2) NOT NULL CHECK (valor_individual > 0),
  valor_pacote numeric(10,2) NOT NULL CHECK (valor_pacote > 0),
  criado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  criado_em timestamptz NOT NULL DEFAULT now(),
  arquivado_em timestamptz,
  arquivado_por uuid REFERENCES auth.users(id) ON DELETE RESTRICT
);

CREATE INDEX idx_psm_modelos_ativos
  ON public.psm_modelos(criado_em DESC)
  WHERE arquivado_em IS NULL;

ALTER TABLE public.psm_modelos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.psm_modelos FROM anon, authenticated;
GRANT ALL ON TABLE public.psm_modelos TO service_role;

COMMENT ON TABLE public.psm_modelos IS
  'Biblioteca administrativa de PSMs reutilizáveis por público e valores.';
