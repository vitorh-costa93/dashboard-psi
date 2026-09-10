-- Yasmin Garcia trocou de semanal para quinzenal a partir de 17/09/2026.
-- A recorrencia nova (quinzenal, quinta, ancora 17/09) ja esta correta, mas
-- os atendimentos "agendado" gerados antes da troca continuaram na agenda
-- nas semanas de folga (24/09, 08/10, 22/10 -- reportado pela psicologa) e
-- a ocorrencia correta de 01/10 nunca foi gerada.
--
-- Mesma classe de bug de Laura / Guilherme F / Maite / Joao Victor. O
-- conserto de raiz (save_recurrence passa a limpar + regerar os
-- atendimentos futuros do paciente ao mudar a recorrencia) vai junto nesta
-- entrega, em api/operational.js. Aqui so o conserto pontual do que ja
-- estava gravado errado.

-- Remove atendimentos futuros "agendado" (nao liquidados) que caem na
-- semana de folga do ciclo quinzenal da recorrencia ativa.
DELETE FROM public.agenda_atendimentos a
USING public.pacientes p, public.recorrencias_atendimento r
WHERE a.paciente_id = p.id
  AND r.paciente_id = p.id AND r.ativo = true
  AND p.nome ILIKE 'Yasmin Garcia%'
  AND a.status = 'agendado' AND a.sessao_id IS NULL
  AND a.origem = 'recorrencia'
  AND a.data_atendimento >= r.vigencia_inicio
  AND (a.data_atendimento - r.vigencia_inicio) % 14 <> 0;

-- Insere as ocorrencias corretas do ciclo (a partir de hoje, ate ~8
-- semanas a frente) que ainda nao existem.
INSERT INTO public.agenda_atendimentos
  (paciente_id, recorrencia_id, data_atendimento, horario, status, convenio_id, modalidade, valor_previsto, origem)
SELECT r.paciente_id, r.id, d::date, r.horario, 'agendado', r.convenio_id, r.modalidade, r.valor_sessao, 'recorrencia'
FROM public.recorrencias_atendimento r
JOIN public.pacientes p ON p.id = r.paciente_id
CROSS JOIN generate_series(
  r.vigencia_inicio::timestamp,
  (CURRENT_DATE + INTERVAL '8 weeks')::timestamp,
  INTERVAL '14 days'
) AS d
WHERE p.nome ILIKE 'Yasmin Garcia%'
  AND r.ativo = true
  AND d::date >= CURRENT_DATE
ON CONFLICT (paciente_id, data_atendimento, horario) DO NOTHING;
