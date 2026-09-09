-- Pedido: comentário opcional ao registrar (Agenda) ou editar (Dashboard)
-- um atendimento -- só exibido na sub-aba "Notas Fiscais (CNPJ)". Uso
-- principal: anotar quanto foi pago em dinheiro, para lançar no caixa do
-- fechamento do mês.
ALTER TABLE public.sessoes ADD COLUMN IF NOT EXISTS comentario text;

CREATE OR REPLACE FUNCTION public.finalizar_agenda_atendimento(
  p_agenda_id uuid,
  p_status text,
  p_sessoes_consumidas numeric DEFAULT 0,
  p_sessoes_cobradas numeric DEFAULT 0,
  p_valor_recebido numeric DEFAULT 0,
  p_comentario text DEFAULT NULL
) RETURNS public.agenda_atendimentos
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_agenda public.agenda_atendimentos;
  v_pacote_id uuid;
  v_sessao_id uuid;
  v_comparecimento text;
  v_cnpj boolean;
  v_horario_legado text;
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
  v_comparecimento:=CASE p_status WHEN 'realizado' THEN 'Sim' WHEN 'falta' THEN 'Não' ELSE 'Cancelado' END;
  SELECT contabiliza_cnpj INTO v_cnpj FROM public.pacientes WHERE id=v_agenda.paciente_id;
  v_cnpj:=COALESCE(v_cnpj,false);
  v_horario_legado:=(ARRAY['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'])[EXTRACT(DOW FROM v_agenda.data_atendimento)::int + 1]
    || ' ' || split_part(v_agenda.horario,':',1) || 'h'
    || CASE WHEN split_part(v_agenda.horario,':',2)::int = 0 THEN '' ELSE split_part(v_agenda.horario,':',2) END;
  SELECT s.id INTO v_sessao_id
    FROM public.sessoes s
    WHERE s.paciente_id=v_agenda.paciente_id AND s.data_sessao=v_agenda.data_atendimento
      AND (s.comparecimento IS NULL OR btrim(s.comparecimento)='')
      AND NOT EXISTS(SELECT 1 FROM public.agenda_atendimentos a WHERE a.sessao_id=s.id)
    ORDER BY s.criado_em ASC LIMIT 1;
  IF v_sessao_id IS NOT NULL THEN
    UPDATE public.sessoes SET
      convenio_id=v_agenda.convenio_id,pacote_id=v_pacote_id,source_key='agenda:'||v_agenda.id,
      modalidade=v_agenda.modalidade,horario=v_horario_legado,comparecimento=v_comparecimento,
      valor_sessao=v_agenda.valor_previsto,sessoes_cobradas=p_sessoes_cobradas,sessao_consumida=p_sessoes_consumidas,
      valor_total=p_valor_recebido,valor_final=p_valor_recebido,cnpj=v_cnpj,comentario=p_comentario,atualizado_em=now()
      WHERE id=v_sessao_id;
  ELSE
    INSERT INTO public.sessoes(paciente_id,convenio_id,pacote_id,source_key,data_sessao,modalidade,horario,comparecimento,valor_sessao,sessoes_cobradas,sessao_consumida,valor_total,valor_final,cnpj,comentario)
    VALUES(v_agenda.paciente_id,v_agenda.convenio_id,v_pacote_id,'agenda:'||v_agenda.id,v_agenda.data_atendimento,v_agenda.modalidade,v_horario_legado,
      v_comparecimento,v_agenda.valor_previsto,p_sessoes_cobradas,p_sessoes_consumidas,p_valor_recebido,p_valor_recebido,v_cnpj,p_comentario)
    ON CONFLICT(source_key) DO UPDATE SET comparecimento=EXCLUDED.comparecimento,pacote_id=EXCLUDED.pacote_id,sessoes_cobradas=EXCLUDED.sessoes_cobradas,sessao_consumida=EXCLUDED.sessao_consumida,valor_total=EXCLUDED.valor_total,valor_final=EXCLUDED.valor_final,cnpj=EXCLUDED.cnpj,comentario=EXCLUDED.comentario,atualizado_em=now()
    RETURNING id INTO v_sessao_id;
  END IF;
  UPDATE public.agenda_atendimentos SET status=p_status,sessao_id=v_sessao_id,sessoes_cobradas=p_sessoes_cobradas,sessao_consumida=p_sessoes_consumidas,valor_recebido=p_valor_recebido,finalizado_em=now(),atualizado_em=now() WHERE id=v_agenda.id RETURNING * INTO v_agenda;
  RETURN v_agenda;
END; $$;

REVOKE ALL ON FUNCTION public.finalizar_agenda_atendimento(uuid,text,numeric,numeric,numeric,text) FROM PUBLIC, anon, authenticated;
-- A assinatura antiga (sem p_comentario) deixa de existir -- todo caller já
-- foi atualizado nesta mesma entrega (api/operational.js).
DROP FUNCTION IF EXISTS public.finalizar_agenda_atendimento(uuid,text,numeric,numeric,numeric);
