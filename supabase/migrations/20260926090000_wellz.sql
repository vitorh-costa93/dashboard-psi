-- Wellz: plataforma online tratada como um único "paciente" com lançamento
-- semanal (5 quantidades) e histórico mensal fixo desde nov/2025.
INSERT INTO public.pacientes (nome, ativo, status_operacional, contabiliza_cnpj, ultimo_label, ultima_chave)
VALUES ('Wellz', true, 'ativo', true, 'Wellz', 'Wellz')
ON CONFLICT (nome) DO UPDATE SET contabiliza_cnpj = true;

CREATE TABLE public.wellz_semanas (
  semana_ref date PRIMARY KEY CHECK (extract(isodow FROM semana_ref) = 5),
  faltas integer NOT NULL DEFAULT 0 CHECK (faltas >= 0),
  acolh_antes integer NOT NULL DEFAULT 0 CHECK (acolh_antes >= 0),
  acolh_apos integer NOT NULL DEFAULT 0 CHECK (acolh_apos >= 0),
  real_antes integer NOT NULL DEFAULT 0 CHECK (real_antes >= 0),
  real_apos integer NOT NULL DEFAULT 0 CHECK (real_apos >= 0),
  valor_total numeric(12,2) NOT NULL DEFAULT 0 CHECK (valor_total >= 0),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.wellz_historico (
  mes date PRIMARY KEY CHECK (extract(day FROM mes) = 1),
  valor numeric(12,2) NOT NULL CHECK (valor >= 0)
);

INSERT INTO public.wellz_historico (mes, valor) VALUES
  ('2025-11-01', 1120.00), ('2025-12-01', 2025.00), ('2026-01-01', 2880.00),
  ('2026-02-01', 2385.00), ('2026-03-01', 1265.00), ('2026-04-01', 845.00),
  ('2026-05-01', 1465.00), ('2026-06-01', 1180.00), ('2026-07-01', 1550.00),
  ('2026-08-01', 1335.00)
ON CONFLICT (mes) DO UPDATE SET valor = EXCLUDED.valor;

ALTER TABLE public.wellz_semanas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wellz_historico ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.wellz_semanas, public.wellz_historico FROM anon, authenticated;
GRANT ALL ON TABLE public.wellz_semanas, public.wellz_historico TO service_role;
