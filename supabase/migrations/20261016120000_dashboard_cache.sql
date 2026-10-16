-- Cache de leitura do Dashboard/Agenda, compartilhado entre todas as instâncias
-- da API (não fica preso ao navegador nem a uma instância serverless).
-- Qualquer escrita nas tabelas lidas pelo Dashboard incrementa `versao`; um
-- payload só vale enquanto sua versão for a atual, então nunca serve dado velho.
-- Acesso só pela camada servidor (service role); RLS ligado sem policies.
CREATE TABLE IF NOT EXISTS public.dashboard_cache_meta (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  versao bigint NOT NULL DEFAULT 1
);
INSERT INTO public.dashboard_cache_meta (singleton) VALUES (true) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.dashboard_cache (
  chave text PRIMARY KEY,
  versao bigint NOT NULL,
  payload jsonb NOT NULL,
  gerado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dashboard_cache_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.dashboard_cache_meta, public.dashboard_cache FROM anon, authenticated;
GRANT ALL ON TABLE public.dashboard_cache_meta, public.dashboard_cache TO service_role;

CREATE OR REPLACE FUNCTION public.dashboard_cache_invalidar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.dashboard_cache_meta SET versao = versao + 1 WHERE singleton;
  RETURN NULL;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sessoes','pacientes','convenios','agenda_atendimentos','recorrencias_atendimento','wellz_semanas','wellz_historico'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS dashboard_cache_inv ON public.%I', t);
    EXECUTE format('CREATE TRIGGER dashboard_cache_inv AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.dashboard_cache_invalidar()', t);
  END LOOP;
END $$;

-- Versão atual (barata: 1 linha).
CREATE OR REPLACE FUNCTION public.dashboard_cache_versao() RETURNS bigint
LANGUAGE sql STABLE AS $$ SELECT versao FROM public.dashboard_cache_meta $$;

-- Devolve o payload só se ainda for da versão vigente.
CREATE OR REPLACE FUNCTION public.dashboard_cache_get(p_chave text) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT c.payload FROM public.dashboard_cache c
  JOIN public.dashboard_cache_meta m ON m.versao = c.versao
  WHERE c.chave = p_chave
$$;

-- Grava só se nada mudou desde que o servidor leu a versão (evita gravar dado velho numa corrida).
CREATE OR REPLACE FUNCTION public.dashboard_cache_put(p_chave text, p_versao bigint, p_payload jsonb) RETURNS boolean
LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT versao FROM public.dashboard_cache_meta) <> p_versao THEN RETURN false; END IF;
  INSERT INTO public.dashboard_cache (chave, versao, payload, gerado_em)
  VALUES (p_chave, p_versao, p_payload, now())
  ON CONFLICT (chave) DO UPDATE SET versao = EXCLUDED.versao, payload = EXCLUDED.payload, gerado_em = EXCLUDED.gerado_em;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.dashboard_cache_versao(), public.dashboard_cache_get(text), public.dashboard_cache_put(text,bigint,jsonb), public.dashboard_cache_invalidar() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_cache_versao(), public.dashboard_cache_get(text), public.dashboard_cache_put(text,bigint,jsonb) TO service_role;
