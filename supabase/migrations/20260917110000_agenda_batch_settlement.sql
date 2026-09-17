-- Salva a tabela da Agenda em uma única transação. A validação inteira ocorre
-- antes de qualquer liquidação; um erro em uma linha reverte o lote completo.
CREATE OR REPLACE FUNCTION public.finalizar_agenda_em_lote(p_itens jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_indice integer := 0;
  v_id uuid;
  v_status text;
  v_cobradas numeric;
  v_recebido numeric;
  v_comentario text;
  v_resultado public.agenda_atendimentos;
  v_saida jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 OR jsonb_array_length(p_itens) > 100 THEN
    RAISE EXCEPTION 'O lote deve conter entre 1 e 100 atendimentos';
  END IF;

  -- Primeira passagem: não toca em dados. Assim qualquer erro de entrada é
  -- devolvido antes de a rotina transacional de uma linha ser executada.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
  LOOP
    v_indice := v_indice + 1;
    BEGIN
      v_id := (v_item->>'id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Linha %: atendimento inválido', v_indice;
    END;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Linha %: atendimento inválido', v_indice; END IF;
    v_status := coalesce(v_item->>'status','');
    IF v_status NOT IN ('realizado','falta','cancelado') THEN
      RAISE EXCEPTION 'Linha %: escolha Sim, Não ou Cancelado', v_indice;
    END IF;
    IF coalesce(v_item->>'sessoes_cobradas','0') !~ '^[0-9]+([.][0-9]+)?$'
       OR coalesce(v_item->>'valor_recebido','0') !~ '^[0-9]+([.][0-9]+)?$' THEN
      RAISE EXCEPTION 'Linha %: valores inválidos', v_indice;
    END IF;
    v_cobradas := (v_item->>'sessoes_cobradas')::numeric;
    v_recebido := (v_item->>'valor_recebido')::numeric;
    IF v_status <> 'realizado' AND (v_cobradas <> 0 OR v_recebido <> 0) THEN
      RAISE EXCEPTION 'Linha %: falta ou cancelamento não podem cobrar sessões', v_indice;
    END IF;
    IF char_length(coalesce(v_item->>'comentario','')) > 500 THEN
      RAISE EXCEPTION 'Linha %: comentário muito extenso', v_indice;
    END IF;
  END LOOP;

  -- Segunda passagem: a chamada inteira é uma única transação PostgreSQL.
  -- Se finalizar_agenda_atendimento falhar em qualquer posição, nada do lote
  -- é confirmado, inclusive as linhas que a precederam.
  v_indice := 0;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
  LOOP
    v_indice := v_indice + 1;
    v_id := (v_item->>'id')::uuid;
    v_status := v_item->>'status';
    v_cobradas := (v_item->>'sessoes_cobradas')::numeric;
    v_recebido := (v_item->>'valor_recebido')::numeric;
    v_comentario := nullif(btrim(coalesce(v_item->>'comentario','')), '');
    BEGIN
      v_resultado := public.finalizar_agenda_atendimento(
        v_id, v_status, CASE WHEN v_status='realizado' THEN 1 ELSE 0 END,
        v_cobradas, v_recebido, v_comentario
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Linha %: %', v_indice, SQLERRM;
    END;
    v_saida := v_saida || jsonb_build_array(jsonb_build_object('id',v_resultado.id,'status',v_resultado.status,'sessao_id',v_resultado.sessao_id));
  END LOOP;
  RETURN v_saida;
END;
$$;

REVOKE ALL ON FUNCTION public.finalizar_agenda_em_lote(jsonb) FROM PUBLIC, anon, authenticated;
