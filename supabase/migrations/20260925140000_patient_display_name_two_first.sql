-- Regra de exibição: dois primeiros nomes (ex.: "Vitor Hugo da Costa" -> "Vitor Hugo").
-- Partículas (da, de, do, das, dos, e) na segunda posição levam junto o nome seguinte.
-- Rótulo derivado apenas para a interface; nenhuma relação usa este texto.
CREATE OR REPLACE FUNCTION public.nome_exibicao_paciente(p_nome text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH w AS (SELECT regexp_split_to_array(btrim(coalesce(p_nome,'')), '\s+') AS a)
  SELECT CASE
    WHEN cardinality(a) <= 1 THEN btrim(coalesce(p_nome,''))
    WHEN lower(a[2]) IN ('da','de','do','das','dos','e') AND cardinality(a) > 2 THEN a[1]||' '||a[2]||' '||a[3]
    ELSE a[1]||' '||a[2]
  END FROM w
$$;

-- Mantém o rótulo (nome curto + " | Dia Hora") sempre coerente com o nome
-- cadastrado, inclusive quando a primeira anamnese atualiza o nome completo.
CREATE OR REPLACE FUNCTION public.atualizar_rotulo_paciente()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.ultimo_label := public.nome_exibicao_paciente(NEW.nome)
    || coalesce(' | ' || substring(coalesce(NEW.ultimo_label,'') from '\| (.+)$'), '');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pacientes_rotulo ON public.pacientes;
CREATE TRIGGER trg_pacientes_rotulo
BEFORE UPDATE OF nome ON public.pacientes
FOR EACH ROW WHEN (OLD.nome IS DISTINCT FROM NEW.nome)
EXECUTE FUNCTION public.atualizar_rotulo_paciente();

-- Reescreve os rótulos existentes preservando o sufixo de dia/horário.
UPDATE public.pacientes
SET ultimo_label = public.nome_exibicao_paciente(nome)
  || coalesce(' | ' || substring(coalesce(ultimo_label,'') from '\| (.+)$'), '')
WHERE ultimo_label IS DISTINCT FROM (public.nome_exibicao_paciente(nome)
  || coalesce(' | ' || substring(coalesce(ultimo_label,'') from '\| (.+)$'), ''));

REVOKE ALL ON FUNCTION public.nome_exibicao_paciente(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.atualizar_rotulo_paciente() FROM PUBLIC,anon,authenticated;
