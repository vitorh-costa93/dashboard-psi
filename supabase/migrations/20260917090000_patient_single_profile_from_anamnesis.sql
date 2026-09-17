-- O cadastro administrativo é a fonte única de dados pessoais. A primeira
-- Anamnese pode completá-lo uma única vez; versões posteriores não o alteram.
ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS cpf_paciente text,
  ADD COLUMN IF NOT EXISTS cpf_responsavel text,
  ADD COLUMN IF NOT EXISTS inicio_atendimentos date,
  ADD COLUMN IF NOT EXISTS data_anamnese date,
  ADD COLUMN IF NOT EXISTS cadastro_sincronizado_anamnese_em timestamptz;

ALTER TABLE public.pacientes
  DROP CONSTRAINT IF EXISTS pacientes_cpf_paciente_formato,
  DROP CONSTRAINT IF EXISTS pacientes_cpf_responsavel_formato;
ALTER TABLE public.pacientes
  ADD CONSTRAINT pacientes_cpf_paciente_formato CHECK (cpf_paciente IS NULL OR cpf_paciente ~ '^\d{11}$'),
  ADD CONSTRAINT pacientes_cpf_responsavel_formato CHECK (cpf_responsavel IS NULL OR cpf_responsavel ~ '^\d{11}$');

CREATE OR REPLACE FUNCTION public.nome_exibicao_paciente(p_nome text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN cardinality(regexp_split_to_array(btrim(coalesce(p_nome,'')), '\s+')) <= 1 THEN btrim(coalesce(p_nome,''))
    ELSE (regexp_split_to_array(btrim(coalesce(p_nome,'')), '\s+'))[1]
      || ' ' || (regexp_split_to_array(btrim(coalesce(p_nome,'')), '\s+'))[cardinality(regexp_split_to_array(btrim(coalesce(p_nome,'')), '\s+'))]
  END
$$;

CREATE OR REPLACE FUNCTION public.aplicar_cadastro_primeira_anamnese(
  p_paciente_id uuid,
  p_perfil jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome text := nullif(btrim(coalesce(p_perfil->>'nome','')), '');
  v_cpf_paciente text := nullif(regexp_replace(coalesce(p_perfil->>'cpf_paciente',''), '\D', '', 'g'), '');
  v_responsavel text := nullif(btrim(coalesce(p_perfil->>'responsavel_nome','')), '');
  v_cpf_responsavel text := nullif(regexp_replace(coalesce(p_perfil->>'cpf_responsavel',''), '\D', '', 'g'), '');
  v_nascimento date := CASE
    WHEN coalesce(p_perfil->>'data_nascimento','') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      THEN (p_perfil->>'data_nascimento')::date
    ELSE NULL
  END;
  v_nome_seguro text;
BEGIN
  PERFORM 1 FROM public.pacientes WHERE id=p_paciente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'patient_not_found'; END IF;
  IF EXISTS (SELECT 1 FROM public.pacientes WHERE id=p_paciente_id AND cadastro_sincronizado_anamnese_em IS NOT NULL) THEN RETURN; END IF;
  IF v_cpf_paciente IS NOT NULL AND v_cpf_paciente !~ '^\d{11}$' THEN RAISE EXCEPTION 'invalid_patient_cpf'; END IF;
  IF v_cpf_responsavel IS NOT NULL AND v_cpf_responsavel !~ '^\d{11}$' THEN RAISE EXCEPTION 'invalid_guardian_cpf'; END IF;
  -- Nunca troca para um nome já atribuído a outro ID permanente.
  v_nome_seguro := CASE WHEN v_nome IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.pacientes WHERE nome=v_nome AND id<>p_paciente_id) THEN v_nome ELSE NULL END;
  UPDATE public.pacientes SET
    nome=coalesce(v_nome_seguro,nome),
    cpf_paciente=coalesce(v_cpf_paciente,cpf_paciente),
    data_nascimento=coalesce(v_nascimento,data_nascimento),
    responsavel_nome=coalesce(v_responsavel,responsavel_nome),
    cpf_responsavel=coalesce(v_cpf_responsavel,cpf_responsavel),
    data_anamnese=CURRENT_DATE,
    cadastro_sincronizado_anamnese_em=now(),
    atualizado_em=now()
  WHERE id=p_paciente_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.salvar_anamnese_com_cadastro(
  p_paciente_id uuid,
  p_conteudo jsonb,
  p_autor uuid,
  p_perfil jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_anamnese uuid;
BEGIN
  PERFORM 1 FROM public.pacientes WHERE id=p_paciente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'patient_not_found'; END IF;
  v_anamnese := public.salvar_anamnese(p_paciente_id,p_conteudo,p_autor);
  PERFORM public.aplicar_cadastro_primeira_anamnese(p_paciente_id,coalesce(p_perfil,'{}'::jsonb));
  RETURN v_anamnese;
END;
$$;

CREATE OR REPLACE FUNCTION public.revisar_formulario_com_cadastro(
  p_resposta_id uuid,
  p_acao text,
  p_revisor uuid,
  p_perfil jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resposta public.formularios_respostas;
  v_paciente uuid;
  v_destino text;
  v_registro uuid;
  v_versao integer;
  v_anamnese uuid;
BEGIN
  SELECT * INTO v_resposta FROM public.formularios_respostas WHERE id=p_resposta_id FOR UPDATE;
  IF NOT FOUND OR v_resposta.status<>'pending_review' THEN RAISE EXCEPTION 'submission_not_pending'; END IF;
  IF p_acao='reject' THEN
    UPDATE public.formularios_respostas SET status='rejected',revisado_por=p_revisor,revisado_em=now() WHERE id=p_resposta_id;
    RETURN NULL;
  END IF;
  IF p_acao<>'approve' THEN RAISE EXCEPTION 'invalid_action'; END IF;
  SELECT c.paciente_id,m.destino INTO v_paciente,v_destino FROM public.formularios_convites c JOIN public.formularios_modelos m ON m.id=c.modelo_id WHERE c.id=v_resposta.convite_id;
  IF v_destino='cadastro' THEN
    UPDATE public.formularios_respostas SET status='approved',revisado_por=p_revisor,revisado_em=now() WHERE id=p_resposta_id;
    RETURN NULL;
  END IF;
  PERFORM 1 FROM public.pacientes WHERE id=v_paciente FOR UPDATE;
  INSERT INTO public.registros_clinicos(paciente_id) VALUES(v_paciente) ON CONFLICT(paciente_id) DO UPDATE SET paciente_id=excluded.paciente_id RETURNING id INTO v_registro;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_registro::text,0));
  SELECT coalesce(max(versao),0)+1 INTO v_versao FROM public.anamneses_versoes WHERE registro_clinico_id=v_registro;
  INSERT INTO public.anamneses_versoes(registro_clinico_id,versao,conteudo,criado_por) VALUES(v_registro,v_versao,v_resposta.conteudo,p_revisor) RETURNING id INTO v_anamnese;
  PERFORM public.aplicar_cadastro_primeira_anamnese(v_paciente,coalesce(p_perfil,'{}'::jsonb));
  UPDATE public.formularios_respostas SET status='approved',revisado_por=p_revisor,revisado_em=now(),anamnese_versao_id=v_anamnese WHERE id=p_resposta_id;
  RETURN v_anamnese;
END;
$$;

-- Atualiza somente rótulos derivados; nenhum relacionamento usa estes textos.
UPDATE public.pacientes p
SET ultimo_label=coalesce((
  SELECT public.nome_exibicao_paciente(p.nome)||' | '||
    (ARRAY['','Seg','Ter','Qua','Qui','Sex','Sáb','Dom'])[r.dia_semana]||' '||
    to_char(r.horario::time,'HH24"h"') ||
    CASE WHEN to_char(r.horario::time,'MI')='00' THEN '' ELSE to_char(r.horario::time,'MI') END
  FROM public.recorrencias_atendimento r WHERE r.paciente_id=p.id AND r.ativo=true ORDER BY r.vigencia_inicio DESC LIMIT 1
),public.nome_exibicao_paciente(p.nome)),atualizado_em=now();

REVOKE ALL ON FUNCTION public.nome_exibicao_paciente(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.aplicar_cadastro_primeira_anamnese(uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.salvar_anamnese_com_cadastro(uuid,jsonb,uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.revisar_formulario_com_cadastro(uuid,text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
