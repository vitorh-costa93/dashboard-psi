CREATE TABLE public.documentos_clinicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN (
    'termo_infantil','termo_adulto','orcamento','recibo',
    'relatorio_psicologico','solicitacao_escolar','declaracao_comparecimento'
  )),
  titulo text NOT NULL,
  conteudo jsonb NOT NULL,
  emitido_em date NOT NULL DEFAULT CURRENT_DATE,
  criado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  criado_em timestamptz NOT NULL DEFAULT now(),
  arquivado_em timestamptz,
  arquivado_por uuid REFERENCES auth.users(id) ON DELETE RESTRICT
);

CREATE INDEX idx_documentos_clinicos_paciente
  ON public.documentos_clinicos(paciente_id, criado_em DESC)
  WHERE arquivado_em IS NULL;

ALTER TABLE public.documentos_clinicos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.documentos_clinicos FROM anon, authenticated;
GRANT ALL ON TABLE public.documentos_clinicos TO service_role;

COMMENT ON TABLE public.documentos_clinicos IS
  'Documentos clínicos e administrativos criptografados, organizados por paciente.';
