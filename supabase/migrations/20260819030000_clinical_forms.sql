CREATE TABLE public.registros_clinicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id uuid NOT NULL UNIQUE REFERENCES public.pacientes(id) ON DELETE RESTRICT,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.anamneses_versoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registro_clinico_id uuid NOT NULL REFERENCES public.registros_clinicos(id) ON DELETE RESTRICT,
  versao integer NOT NULL CHECK (versao > 0),
  conteudo jsonb NOT NULL,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (registro_clinico_id, versao)
);

CREATE TABLE public.formularios_modelos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  finalidade text NOT NULL,
  campos jsonb NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.formularios_convites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo_id uuid NOT NULL REFERENCES public.formularios_modelos(id) ON DELETE RESTRICT,
  paciente_id uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE,
  expira_em timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','submitted','revoked')),
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  usado_em timestamptz
);

CREATE TABLE public.formularios_respostas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  convite_id uuid NOT NULL UNIQUE REFERENCES public.formularios_convites(id) ON DELETE RESTRICT,
  conteudo jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','approved','rejected')),
  revisado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revisado_em timestamptz,
  anamnese_versao_id uuid REFERENCES public.anamneses_versoes(id) ON DELETE RESTRICT,
  enviado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_anamneses_registro_versao ON public.anamneses_versoes(registro_clinico_id, versao DESC);
CREATE INDEX idx_convites_paciente ON public.formularios_convites(paciente_id, criado_em DESC);
CREATE INDEX idx_respostas_status ON public.formularios_respostas(status, enviado_em DESC);

ALTER TABLE public.registros_clinicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anamneses_versoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formularios_modelos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formularios_convites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formularios_respostas ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.registros_clinicos, public.anamneses_versoes, public.formularios_modelos, public.formularios_convites, public.formularios_respostas FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.enviar_formulario_externo(p_token_hash text, p_conteudo jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_convite public.formularios_convites; v_id uuid;
BEGIN
  SELECT * INTO v_convite FROM public.formularios_convites WHERE token_hash=p_token_hash FOR UPDATE;
  IF NOT FOUND OR v_convite.status<>'pending' OR v_convite.expira_em<=now() THEN RAISE EXCEPTION 'invalid_or_expired_token'; END IF;
  INSERT INTO public.formularios_respostas(convite_id,conteudo) VALUES(v_convite.id,p_conteudo) RETURNING id INTO v_id;
  UPDATE public.formularios_convites SET status='submitted',usado_em=now() WHERE id=v_convite.id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.revisar_formulario(p_resposta_id uuid, p_acao text, p_revisor uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_resposta public.formularios_respostas; v_paciente uuid; v_registro uuid; v_versao integer; v_anamnese uuid;
BEGIN
  SELECT * INTO v_resposta FROM public.formularios_respostas WHERE id=p_resposta_id FOR UPDATE;
  IF NOT FOUND OR v_resposta.status<>'pending_review' THEN RAISE EXCEPTION 'submission_not_pending'; END IF;
  IF p_acao='reject' THEN UPDATE public.formularios_respostas SET status='rejected',revisado_por=p_revisor,revisado_em=now() WHERE id=p_resposta_id; RETURN NULL; END IF;
  IF p_acao<>'approve' THEN RAISE EXCEPTION 'invalid_action'; END IF;
  SELECT paciente_id INTO v_paciente FROM public.formularios_convites WHERE id=v_resposta.convite_id;
  INSERT INTO public.registros_clinicos(paciente_id) VALUES(v_paciente) ON CONFLICT(paciente_id) DO UPDATE SET paciente_id=excluded.paciente_id RETURNING id INTO v_registro;
  SELECT coalesce(max(versao),0)+1 INTO v_versao FROM public.anamneses_versoes WHERE registro_clinico_id=v_registro;
  INSERT INTO public.anamneses_versoes(registro_clinico_id,versao,conteudo,criado_por) VALUES(v_registro,v_versao,v_resposta.conteudo,p_revisor) RETURNING id INTO v_anamnese;
  UPDATE public.formularios_respostas SET status='approved',revisado_por=p_revisor,revisado_em=now(),anamnese_versao_id=v_anamnese WHERE id=p_resposta_id;
  RETURN v_anamnese;
END $$;

REVOKE ALL ON FUNCTION public.enviar_formulario_externo(text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revisar_formulario(uuid,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enviar_formulario_externo(text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.revisar_formulario(uuid,text,uuid) TO service_role;

