CREATE TABLE public.convenios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  nome_normalizado text NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.importacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origem text NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  contagens jsonb NOT NULL DEFAULT '{}'::jsonb,
  divergencias jsonb NOT NULL DEFAULT '[]'::jsonb,
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  concluido_em timestamptz
);

CREATE TABLE public.pacientes_origem (
  origem text NOT NULL,
  chave_origem text NOT NULL,
  paciente_id uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE RESTRICT,
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (origem, chave_origem)
);

CREATE TABLE public.pacotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE RESTRICT,
  source_key text NOT NULL UNIQUE,
  quantidade numeric(10,2) NOT NULL CHECK (quantidade > 0),
  valor_unitario numeric(12,2) NOT NULL DEFAULT 0 CHECK (valor_unitario >= 0),
  data_compra date NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  last_seen_import_id uuid REFERENCES public.importacoes(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sessoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE RESTRICT,
  convenio_id uuid REFERENCES public.convenios(id) ON DELETE RESTRICT,
  pacote_id uuid REFERENCES public.pacotes(id) ON DELETE SET NULL,
  source_key text NOT NULL UNIQUE,
  data_sessao date NOT NULL,
  genero text,
  faixa_etaria text,
  modalidade text,
  horario text,
  ativo_na_origem boolean NOT NULL DEFAULT false,
  comparecimento text,
  motivo text,
  valor_sessao numeric(12,2) NOT NULL DEFAULT 0,
  sessoes_cobradas numeric(10,2) NOT NULL DEFAULT 0,
  sessao_consumida numeric(10,2) NOT NULL DEFAULT 0,
  valor_total numeric(12,2) NOT NULL DEFAULT 0,
  valor_final numeric(12,2) NOT NULL DEFAULT 0,
  cnpj boolean,
  last_seen_import_id uuid REFERENCES public.importacoes(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessoes_paciente_data ON public.sessoes(paciente_id, data_sessao);
CREATE INDEX idx_sessoes_convenio ON public.sessoes(convenio_id);
CREATE INDEX idx_pacotes_paciente_data ON public.pacotes(paciente_id, data_compra);
CREATE INDEX idx_pacientes_origem_paciente ON public.pacientes_origem(paciente_id);

ALTER TABLE public.convenios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.importacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pacientes_origem ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pacotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessoes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.convenios FROM anon, authenticated;
REVOKE ALL ON TABLE public.importacoes FROM anon, authenticated;
REVOKE ALL ON TABLE public.pacientes_origem FROM anon, authenticated;
REVOKE ALL ON TABLE public.pacotes FROM anon, authenticated;
REVOKE ALL ON TABLE public.sessoes FROM anon, authenticated;

