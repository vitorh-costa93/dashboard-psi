-- Movimentações administrativas preservam o histórico de sessões e tornam
-- explícito qualquer ajuste de saldo (inativação ou transferência).
CREATE TABLE IF NOT EXISTS public.movimentos_saldo_sessoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_transferencia_id uuid,
  paciente_id uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN ('inativacao','transferencia_origem','transferencia_destino')),
  quantidade numeric(10,2) NOT NULL CHECK (quantidade <> 0),
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_movimentos_saldo_sessoes_paciente
  ON public.movimentos_saldo_sessoes(paciente_id, criado_em DESC);

ALTER TABLE public.movimentos_saldo_sessoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.movimentos_saldo_sessoes FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.zerar_saldo_sessoes(p_paciente_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saldo numeric(10,2);
  v_movimento uuid;
BEGIN
  PERFORM 1 FROM public.pacientes WHERE id = p_paciente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Paciente não encontrado'; END IF;

  SELECT COALESCE(SUM(sessoes_cobradas - sessao_consumida), 0)
    INTO v_saldo
    FROM public.sessoes
   WHERE paciente_id = p_paciente_id;
  IF v_saldo = 0 THEN RETURN 0; END IF;

  INSERT INTO public.movimentos_saldo_sessoes(paciente_id, tipo, quantidade)
  VALUES(p_paciente_id, 'inativacao', -v_saldo)
  RETURNING id INTO v_movimento;

  INSERT INTO public.sessoes(
    paciente_id, source_key, data_sessao, horario, comparecimento,
    valor_sessao, sessoes_cobradas, sessao_consumida, valor_total, valor_final, cnpj, comentario
  ) VALUES (
    p_paciente_id, 'movimento-saldo:' || v_movimento, CURRENT_DATE, '', 'Ajuste administrativo',
    0, -v_saldo, 0, 0, 0, false, 'Saldo zerado ao inativar o paciente.'
  );
  RETURN -v_saldo;
END;
$$;

CREATE OR REPLACE FUNCTION public.transferir_sessoes_paciente(
  p_origem_id uuid,
  p_destino_id uuid,
  p_quantidade numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saldo numeric(10,2);
  v_grupo uuid := gen_random_uuid();
  v_origem_movimento uuid;
  v_destino_movimento uuid;
BEGIN
  IF p_origem_id IS NULL OR p_destino_id IS NULL OR p_origem_id = p_destino_id THEN
    RAISE EXCEPTION 'Selecione pacientes diferentes';
  END IF;
  IF p_quantidade IS NULL OR p_quantidade <= 0 THEN
    RAISE EXCEPTION 'Quantidade inválida';
  END IF;

  PERFORM id FROM public.pacientes
   WHERE id IN (p_origem_id, p_destino_id)
   ORDER BY id FOR UPDATE;
  IF (SELECT count(*) FROM public.pacientes WHERE id IN (p_origem_id, p_destino_id)) <> 2 THEN
    RAISE EXCEPTION 'Paciente não encontrado';
  END IF;

  SELECT COALESCE(SUM(sessoes_cobradas - sessao_consumida), 0)
    INTO v_saldo
    FROM public.sessoes
   WHERE paciente_id = p_origem_id;
  IF p_quantidade > v_saldo THEN
    RAISE EXCEPTION 'A quantidade supera o saldo de sessões disponível';
  END IF;

  INSERT INTO public.movimentos_saldo_sessoes(grupo_transferencia_id, paciente_id, tipo, quantidade)
  VALUES(v_grupo, p_origem_id, 'transferencia_origem', -p_quantidade)
  RETURNING id INTO v_origem_movimento;
  INSERT INTO public.movimentos_saldo_sessoes(grupo_transferencia_id, paciente_id, tipo, quantidade)
  VALUES(v_grupo, p_destino_id, 'transferencia_destino', p_quantidade)
  RETURNING id INTO v_destino_movimento;

  INSERT INTO public.sessoes(
    paciente_id, source_key, data_sessao, horario, comparecimento,
    valor_sessao, sessoes_cobradas, sessao_consumida, valor_total, valor_final, cnpj, comentario
  ) VALUES
    (p_origem_id, 'movimento-saldo:' || v_origem_movimento, CURRENT_DATE, '', 'Transferência de sessões', 0, -p_quantidade, 0, 0, 0, false, 'Sessão transferida para outro paciente.'),
    (p_destino_id, 'movimento-saldo:' || v_destino_movimento, CURRENT_DATE, '', 'Transferência de sessões', 0, p_quantidade, 0, 0, 0, false, 'Sessão recebida de outro paciente.');

  RETURN jsonb_build_object('transferencia_id', v_grupo, 'quantidade', p_quantidade);
END;
$$;

REVOKE ALL ON FUNCTION public.zerar_saldo_sessoes(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transferir_sessoes_paciente(uuid,uuid,numeric) FROM PUBLIC, anon, authenticated;
