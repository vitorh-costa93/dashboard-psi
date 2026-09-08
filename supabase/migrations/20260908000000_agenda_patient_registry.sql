-- Item 3 do pedido: catálogo de pacotes por valor (auto-match/criação "Pacote Pn")
-- e exclusão definitiva de paciente (com todo o histórico vinculado).

CREATE TABLE IF NOT EXISTS public.planos_pacote (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  valor_sessao numeric(12,2) NOT NULL UNIQUE CHECK (valor_sessao >= 0),
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.recorrencias_atendimento ADD COLUMN IF NOT EXISTS plano_pacote_id uuid REFERENCES public.planos_pacote(id) ON DELETE SET NULL;
ALTER TABLE public.planos_pacote ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.planos_pacote FROM anon, authenticated;
GRANT ALL ON TABLE public.planos_pacote TO service_role;

-- Busca (ou cria, com nome incremental "Pacote Pn") o plano associado a um valor de sessão.
CREATE OR REPLACE FUNCTION public.obter_ou_criar_plano_pacote(p_valor_sessao numeric)
RETURNS public.planos_pacote
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plano public.planos_pacote;
  v_seq integer;
BEGIN
  IF p_valor_sessao IS NULL OR p_valor_sessao <= 0 THEN RETURN NULL; END IF;
  SELECT * INTO v_plano FROM public.planos_pacote WHERE valor_sessao = p_valor_sessao;
  IF FOUND THEN RETURN v_plano; END IF;
  SELECT count(*) + 1 INTO v_seq FROM public.planos_pacote;
  INSERT INTO public.planos_pacote(nome, valor_sessao) VALUES ('Pacote P' || v_seq, p_valor_sessao)
  RETURNING * INTO v_plano;
  RETURN v_plano;
END; $$;
REVOKE ALL ON FUNCTION public.obter_ou_criar_plano_pacote(numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obter_ou_criar_plano_pacote(numeric) TO service_role;

-- Exclusão definitiva de paciente: apaga todo o histórico vinculado, na ordem
-- exigida pelas foreign keys, dentro de uma única transação (tudo ou nada).
-- Ação irreversível -- usada apenas quando a psicóloga pede explicitamente
-- para apagar um paciente "de verdade", inclusive com histórico clínico e
-- financeiro. Não há soft-delete aqui: pacientes.status_operacional='inativo'
-- já cobre o caso de só desativar sem perder dados.
CREATE OR REPLACE FUNCTION public.excluir_paciente_definitivo(p_paciente_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_registro_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.pacientes WHERE id = p_paciente_id) THEN
    RAISE EXCEPTION 'Paciente não encontrado';
  END IF;
  SELECT id INTO v_registro_id FROM public.registros_clinicos WHERE paciente_id = p_paciente_id;
  IF v_registro_id IS NOT NULL THEN
    DELETE FROM public.formularios_respostas WHERE anamnese_versao_id IN (
      SELECT id FROM public.anamneses_versoes WHERE registro_clinico_id = v_registro_id
    );
    DELETE FROM public.anamneses_versoes WHERE registro_clinico_id = v_registro_id;
  END IF;
  DELETE FROM public.formularios_respostas WHERE convite_id IN (
    SELECT id FROM public.formularios_convites WHERE paciente_id = p_paciente_id
  );
  DELETE FROM public.formularios_convites WHERE paciente_id = p_paciente_id;
  IF v_registro_id IS NOT NULL THEN
    DELETE FROM public.registros_clinicos WHERE id = v_registro_id;
  END IF;
  DELETE FROM public.documentos_clinicos WHERE paciente_id = p_paciente_id;
  DELETE FROM public.agenda_atendimentos WHERE paciente_id = p_paciente_id;
  DELETE FROM public.recorrencias_atendimento WHERE paciente_id = p_paciente_id;
  DELETE FROM public.sessoes WHERE paciente_id = p_paciente_id;
  DELETE FROM public.pacotes WHERE paciente_id = p_paciente_id;
  DELETE FROM public.prontuarios WHERE paciente_id = p_paciente_id;
  DELETE FROM public.pacientes_origem WHERE paciente_id = p_paciente_id;
  DELETE FROM public.pacientes WHERE id = p_paciente_id;
END; $$;
REVOKE ALL ON FUNCTION public.excluir_paciente_definitivo(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.excluir_paciente_definitivo(uuid) TO service_role;
