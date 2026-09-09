-- Dois problemas encontrados:
--
-- 1) João Victor: a recorrência ativa tinha dia_semana=3 (quarta), mas o
--    horário e todo o histórico dele (sempre às quintas -- confirmado pela
--    psicóloga e pelo próprio padrão das sessões já realizadas) mostram que
--    é quinta (4). Combinado com a âncora de vigência corrigida antes
--    (2026-09-10, uma quinta), esse desalinhamento fazia buildOccurrences()
--    não encontrar NENHUMA data em setembro. Corrige dia_semana para 4 e
--    insere as ocorrências corretas de setembro/outubro que nunca chegaram
--    a ser geradas (e remove as de outubro geradas erradas, com o dia
--    errado, antes desta correção).
--
-- 2) buildOccurrences() (lib/agenda.js) tinha um bug de paridade quinzenal
--    entre meses, já corrigido no código desta mesma entrega: quando a 1ª
--    ocorrência do dia da semana dentro de um mês cai por acaso na semana
--    "de folga", o mês inteiro ficava sem nenhuma data. Isso explica o caso
--    do João Victor em outubro, e pode ter afetado outros pacientes
--    quinzenais silenciosamente -- sem reportar nada aqui, pois nenhum
--    outro caso concreto foi confirmado ainda.
--
-- Efeito colateral já identificado e limpo aqui de passagem: atendimentos
-- "agendado" (nunca liquidados) que sobraram de recorrências já fechadas
-- (Guilherme F e Maitê, mesmo padrão da correção anterior de paridade),
-- inclusive alguns que já tinham vazado para outubro.

UPDATE public.recorrencias_atendimento
SET dia_semana=4, atualizado_em=now()
WHERE id='64a175cb-c33a-4f57-8992-0de640c7006e' AND ativo=true;

-- Remove os atendimentos de outubro do João Victor gerados com o dia
-- errado (ainda não liquidados).
DELETE FROM public.agenda_atendimentos a
USING public.pacientes p
WHERE a.paciente_id=p.id AND p.nome ILIKE 'João Victor%'
  AND a.status='agendado' AND a.sessao_id IS NULL
  AND a.data_atendimento IN ('2026-10-07','2026-10-21');

-- Insere as ocorrências corretas (setembro e outubro) que nunca existiram.
INSERT INTO public.agenda_atendimentos(paciente_id,recorrencia_id,data_atendimento,horario,status,convenio_id,modalidade,valor_previsto,origem)
SELECT r.paciente_id, r.id, d.data, r.horario, 'agendado', r.convenio_id, r.modalidade, r.valor_sessao, 'recorrencia'
FROM public.recorrencias_atendimento r
CROSS JOIN (VALUES ('2026-09-10'::date),('2026-09-24'::date),('2026-10-08'::date),('2026-10-22'::date)) AS d(data)
WHERE r.id='64a175cb-c33a-4f57-8992-0de640c7006e'
ON CONFLICT (paciente_id,data_atendimento,horario) DO NOTHING;

-- Limpeza de leftovers de recorrências já fechadas (mesmo padrão da
-- correção anterior de Laura -- ver 20260909190000), agora cobrindo
-- qualquer atendimento já vazado para além do mês em que a recorrência foi
-- fechada, não só o mês corrente.
DELETE FROM public.agenda_atendimentos a
USING public.recorrencias_atendimento r
WHERE a.recorrencia_id=r.id
  AND a.status='agendado' AND a.sessao_id IS NULL
  AND r.ativo=false AND r.vigencia_fim IS NOT NULL
  AND a.data_atendimento > r.vigencia_fim;
