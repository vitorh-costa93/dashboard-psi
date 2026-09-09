-- Laura mudou de quarta-feira para segunda-feira, mas a recorrência antiga
-- de quarta ficou ativa junto com a nova de segunda (mesmo problema já
-- visto com Guilherme F -- ver 09/09/2026, sessões duplicadas), gerando
-- atendimentos de quarta que não deveriam mais existir (ex.: 09/09/2026
-- 16:00, reportado pela psicóloga). Fecha qualquer recorrência ativa dela
-- que não seja de segunda-feira e remove os atendimentos de quarta ainda
-- não liquidados que já tinham sido gerados a partir dela.
UPDATE public.recorrencias_atendimento r
SET ativo=false, vigencia_fim=CURRENT_DATE-1, atualizado_em=now()
FROM public.pacientes p
WHERE r.paciente_id=p.id AND p.nome='Laura' AND r.ativo=true AND r.dia_semana<>1;

DELETE FROM public.agenda_atendimentos a
USING public.pacientes p
WHERE a.paciente_id=p.id AND p.nome='Laura' AND a.status='agendado' AND a.sessao_id IS NULL
  AND EXTRACT(ISODOW FROM a.data_atendimento)::int<>1;
