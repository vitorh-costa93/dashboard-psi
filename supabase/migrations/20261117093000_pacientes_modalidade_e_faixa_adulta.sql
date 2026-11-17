-- Adiciona modalidade ao cadastro do paciente para que o que é definido no
-- cadastro prevaleça no Dashboard e na tabela de Atendimentos, mesmo sem
-- recorrência ativa. Também padroniza "Adulto" -> "Adulta" em faixa_etaria.
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS modalidade text;

UPDATE public.pacientes p
SET modalidade = COALESCE(
  NULLIF(trim(p.modalidade), ''),
  (
    SELECT r.modalidade
    FROM public.recorrencias_atendimento r
    WHERE r.paciente_id = p.id
      AND r.ativo = true
      AND r.modalidade IS NOT NULL
      AND trim(r.modalidade) <> ''
    ORDER BY r.vigencia_inicio DESC
    LIMIT 1
  ),
  (
    SELECT s.modalidade
    FROM public.sessoes s
    WHERE s.paciente_id = p.id
      AND s.modalidade IS NOT NULL
      AND trim(s.modalidade) <> ''
    ORDER BY s.data_sessao DESC
    LIMIT 1
  )
)
WHERE p.modalidade IS NULL OR trim(p.modalidade) = '';

UPDATE public.pacientes
SET faixa_etaria = 'Adulta'
WHERE trim(faixa_etaria) = 'Adulto';

UPDATE public.sessoes
SET faixa_etaria = 'Adulta'
WHERE trim(faixa_etaria) = 'Adulto';

UPDATE public.sessoes s
SET modalidade = p.modalidade
FROM public.pacientes p
WHERE s.paciente_id = p.id
  AND (s.modalidade IS NULL OR trim(s.modalidade) = '')
  AND p.modalidade IS NOT NULL
  AND trim(p.modalidade) <> '';
