-- Reaplicação explícita e auditável de cadastro aprovado pela administração.
ALTER TABLE public.formularios_respostas
  ADD COLUMN IF NOT EXISTS perfil_atualizado_em timestamptz,
  ADD COLUMN IF NOT EXISTS perfil_atualizado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.reaplicar_cadastro_aprovado(
  p_resposta_id uuid, p_revisor uuid, p_perfil jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_resposta public.formularios_respostas; v_paciente uuid; v_destino text;
BEGIN
  SELECT * INTO v_resposta FROM public.formularios_respostas WHERE id=p_resposta_id FOR UPDATE;
  IF NOT FOUND OR v_resposta.status<>'approved' OR v_resposta.arquivado_em IS NOT NULL THEN
    RAISE EXCEPTION 'approved_registration_required';
  END IF;
  SELECT c.paciente_id,m.destino INTO v_paciente,v_destino
  FROM public.formularios_convites c JOIN public.formularios_modelos m ON m.id=c.modelo_id
  WHERE c.id=v_resposta.convite_id;
  IF v_destino IS DISTINCT FROM 'cadastro' THEN RAISE EXCEPTION 'registration_required'; END IF;
  PERFORM public.aplicar_cadastro_formulario(v_paciente,p_perfil);
  UPDATE public.formularios_respostas SET perfil_atualizado_em=now(),perfil_atualizado_por=p_revisor WHERE id=p_resposta_id;
END;
$$;
REVOKE ALL ON FUNCTION public.reaplicar_cadastro_aprovado(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reaplicar_cadastro_aprovado(uuid,uuid,jsonb) TO service_role;
