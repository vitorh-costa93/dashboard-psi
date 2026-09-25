-- "ativo" passa a ser sempre derivado de status_operacional: só "ativo" conta
-- como ativo (pausado e inativo não). Corrige cadastros que ficaram
-- inconsistentes (ativo=true com status inativo) e impede novas divergências.
UPDATE public.pacientes
SET ativo = (status_operacional = 'ativo')
WHERE status_operacional IS NOT NULL AND ativo IS DISTINCT FROM (status_operacional = 'ativo');

CREATE OR REPLACE FUNCTION public.sincronizar_ativo_com_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status_operacional IS NOT NULL THEN
    NEW.ativo := (NEW.status_operacional = 'ativo');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pacientes_ativo_status ON public.pacientes;
CREATE TRIGGER trg_pacientes_ativo_status
BEFORE INSERT OR UPDATE ON public.pacientes
FOR EACH ROW EXECUTE FUNCTION public.sincronizar_ativo_com_status();

REVOKE ALL ON FUNCTION public.sincronizar_ativo_com_status() FROM PUBLIC,anon,authenticated;
