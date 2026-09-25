-- Anexos (atividade utilizada) por sessão de prontuário. Conteúdo cifrado no
-- servidor (AES-256-GCM); exclusão do prontuário remove seus anexos.
CREATE TABLE public.prontuario_anexos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prontuario_id uuid NOT NULL REFERENCES public.prontuarios(id) ON DELETE CASCADE,
  nome_arquivo text NOT NULL,
  tipo_mime text NOT NULL,
  tamanho integer NOT NULL CHECK (tamanho >= 0),
  conteudo jsonb NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_prontuario_anexos_prontuario ON public.prontuario_anexos(prontuario_id);
ALTER TABLE public.prontuario_anexos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.prontuario_anexos FROM anon, authenticated;
GRANT ALL ON TABLE public.prontuario_anexos TO service_role;
COMMENT ON TABLE public.prontuario_anexos IS 'Anexos criptografados das sessões de prontuário.';
