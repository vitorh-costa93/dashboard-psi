ALTER TABLE public.formularios_modelos
  ADD COLUMN destino text NOT NULL DEFAULT 'anamnese'
  CHECK (destino IN ('anamnese', 'cadastro'));

CREATE OR REPLACE FUNCTION public.revisar_formulario(p_resposta_id uuid, p_acao text, p_revisor uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  SELECT c.paciente_id, m.destino INTO v_paciente, v_destino
    FROM public.formularios_convites c
    JOIN public.formularios_modelos m ON m.id=c.modelo_id
   WHERE c.id=v_resposta.convite_id;

  IF v_destino='cadastro' THEN
    UPDATE public.formularios_respostas SET status='approved',revisado_por=p_revisor,revisado_em=now() WHERE id=p_resposta_id;
    RETURN NULL;
  END IF;

  INSERT INTO public.registros_clinicos(paciente_id) VALUES(v_paciente)
    ON CONFLICT(paciente_id) DO UPDATE SET paciente_id=excluded.paciente_id RETURNING id INTO v_registro;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_registro::text, 0));
  SELECT coalesce(max(versao),0)+1 INTO v_versao FROM public.anamneses_versoes WHERE registro_clinico_id=v_registro;
  INSERT INTO public.anamneses_versoes(registro_clinico_id,versao,conteudo,criado_por)
    VALUES(v_registro,v_versao,v_resposta.conteudo,p_revisor) RETURNING id INTO v_anamnese;
  UPDATE public.formularios_respostas SET status='approved',revisado_por=p_revisor,revisado_em=now(),anamnese_versao_id=v_anamnese WHERE id=p_resposta_id;
  RETURN v_anamnese;
END $$;

REVOKE ALL ON FUNCTION public.revisar_formulario(uuid,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revisar_formulario(uuid,text,uuid) TO service_role;
