-- Liquidação operacional: uma confirmação cria sessão e pacote de forma atômica.
ALTER TABLE public.agenda_atendimentos ADD COLUMN IF NOT EXISTS sessoes_cobradas numeric(10,2) NOT NULL DEFAULT 0 CHECK (sessoes_cobradas >= 0);
ALTER TABLE public.agenda_atendimentos ADD COLUMN IF NOT EXISTS sessao_consumida numeric(10,2) NOT NULL DEFAULT 0 CHECK (sessao_consumida >= 0);
ALTER TABLE public.agenda_atendimentos ADD COLUMN IF NOT EXISTS valor_recebido numeric(12,2) NOT NULL DEFAULT 0 CHECK (valor_recebido >= 0);
ALTER TABLE public.agenda_atendimentos ADD COLUMN IF NOT EXISTS finalizado_em timestamptz;

CREATE OR REPLACE FUNCTION public.finalizar_agenda_atendimento(
  p_agenda_id uuid,
  p_status text,
  p_sessoes_consumidas numeric DEFAULT 0,
  p_sessoes_cobradas numeric DEFAULT 0,
  p_valor_recebido numeric DEFAULT 0
) RETURNS public.agenda_atendimentos
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_agenda public.agenda_atendimentos;
  v_pacote_id uuid;
  v_sessao_id uuid;
BEGIN
  IF p_status NOT IN ('realizado','falta','cancelado') THEN RAISE EXCEPTION 'Resultado inválido'; END IF;
  IF p_sessoes_consumidas<0 OR p_sessoes_cobradas<0 OR p_valor_recebido<0 THEN RAISE EXCEPTION 'Valores negativos não são permitidos'; END IF;
  SELECT * INTO v_agenda FROM public.agenda_atendimentos WHERE id=p_agenda_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Atendimento não encontrado'; END IF;
  IF v_agenda.sessao_id IS NOT NULL THEN RAISE EXCEPTION 'Este atendimento já está vinculado a uma sessão'; END IF;
  IF p_status<>'realizado' AND (p_sessoes_consumidas<>0 OR p_sessoes_cobradas<>0 OR p_valor_recebido<>0) THEN RAISE EXCEPTION 'Falta ou cancelamento não podem consumir ou cobrar sessões'; END IF;
  IF p_status='realizado' AND p_sessoes_consumidas<=0 THEN RAISE EXCEPTION 'Informe ao menos uma sessão consumida'; END IF;
  IF p_sessoes_cobradas>0 THEN
    INSERT INTO public.pacotes(paciente_id,source_key,quantidade,valor_unitario,data_compra,ativo)
    VALUES(v_agenda.paciente_id,'agenda:'||v_agenda.id||':pacote',p_sessoes_cobradas,p_valor_recebido/p_sessoes_cobradas,v_agenda.data_atendimento,true)
    ON CONFLICT(source_key) DO UPDATE SET quantidade=EXCLUDED.quantidade,valor_unitario=EXCLUDED.valor_unitario,data_compra=EXCLUDED.data_compra,atualizado_em=now()
    RETURNING id INTO v_pacote_id;
  END IF;
  INSERT INTO public.sessoes(paciente_id,convenio_id,pacote_id,source_key,data_sessao,modalidade,horario,comparecimento,valor_sessao,sessoes_cobradas,sessao_consumida,valor_total,valor_final,cnpj)
  VALUES(v_agenda.paciente_id,v_agenda.convenio_id,v_pacote_id,'agenda:'||v_agenda.id,v_agenda.data_atendimento,v_agenda.modalidade,v_agenda.horario,
    CASE p_status WHEN 'realizado' THEN 'Realizado' WHEN 'falta' THEN 'Falta' ELSE 'Cancelado' END,
    v_agenda.valor_previsto,p_sessoes_cobradas,p_sessoes_consumidas,p_valor_recebido,p_valor_recebido,false)
  ON CONFLICT(source_key) DO UPDATE SET comparecimento=EXCLUDED.comparecimento,pacote_id=EXCLUDED.pacote_id,sessoes_cobradas=EXCLUDED.sessoes_cobradas,sessao_consumida=EXCLUDED.sessao_consumida,valor_total=EXCLUDED.valor_total,valor_final=EXCLUDED.valor_final,atualizado_em=now()
  RETURNING id INTO v_sessao_id;
  UPDATE public.agenda_atendimentos SET status=p_status,sessao_id=v_sessao_id,sessoes_cobradas=p_sessoes_cobradas,sessao_consumida=p_sessoes_consumidas,valor_recebido=p_valor_recebido,finalizado_em=now(),atualizado_em=now() WHERE id=v_agenda.id RETURNING * INTO v_agenda;
  RETURN v_agenda;
END; $$;

REVOKE ALL ON FUNCTION public.finalizar_agenda_atendimento(uuid,text,numeric,numeric,numeric) FROM PUBLIC, anon, authenticated;