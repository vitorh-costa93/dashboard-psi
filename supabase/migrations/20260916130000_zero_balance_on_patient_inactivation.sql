-- Mantém a mudança de status e o ajuste de saldo na mesma transação do banco.
CREATE OR REPLACE FUNCTION public.zerar_saldo_ao_inativar_paciente()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status_operacional = 'inativo'
     AND (TG_OP = 'INSERT' OR OLD.status_operacional IS DISTINCT FROM 'inativo') THEN
    PERFORM public.zerar_saldo_sessoes(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pacientes_zerar_saldo_ao_inativar ON public.pacientes;
CREATE TRIGGER pacientes_zerar_saldo_ao_inativar
AFTER INSERT OR UPDATE OF status_operacional ON public.pacientes
FOR EACH ROW EXECUTE FUNCTION public.zerar_saldo_ao_inativar_paciente();

REVOKE ALL ON FUNCTION public.zerar_saldo_ao_inativar_paciente() FROM PUBLIC, anon, authenticated;
