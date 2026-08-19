WITH latest AS (
  SELECT DISTINCT ON (s.paciente_id) s.paciente_id, s.horario
  FROM public.sessoes s
  ORDER BY s.paciente_id, s.data_sessao DESC, s.criado_em DESC
)
UPDATE public.pacientes p
SET ultimo_label = split_part(trim(p.nome), ' ', 1) ||
  CASE WHEN trim(coalesce(latest.horario, '')) <> '' THEN ' | ' || latest.horario ELSE '' END,
    atualizado_em = now()
FROM latest
WHERE latest.paciente_id = p.id AND p.ativo = true;
