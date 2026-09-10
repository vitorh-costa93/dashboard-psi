-- Varredura geral (pedido: "nao e pra ser um ajuste pontual, e pra ser
-- aplicado para todos os casos"): para TODA recorrencia ativa de paciente
-- ativo, remove os atendimentos futuros "agendado" (nao liquidados,
-- gerados por recorrencia) que nao batem com o padrao atual da regra --
-- sobras de quando a frequencia/dia/horario eram outros -- e regera as
-- ocorrencias corretas ate o fim do 3o mes a frente.
--
-- O conserto de raiz ja foi feito: save_recurrence limpa+regera ao mudar a
-- recorrencia, e generate_month passa a remover sobras do mes gerado. Esta
-- migration so acerta o que ja estava gravado errado agora.
--
-- `primeira` = 1a ocorrencia do dia da semana em/apos a vigencia (cobre o
-- caso da ancora ter caido num dia da semana errado). Para quinzenal ela
-- tambem serve de ancora de paridade do ciclo de 14 dias.

WITH ativa AS (
  SELECT DISTINCT ON (r.paciente_id)
    r.paciente_id, r.id AS rec_id, r.frequencia, r.dia_semana,
    left(r.horario,5) AS horario, r.convenio_id, r.modalidade, r.valor_sessao,
    r.vigencia_fim,
    (r.vigencia_inicio + (((r.dia_semana - EXTRACT(ISODOW FROM r.vigencia_inicio)::int) + 7) % 7))::date AS primeira
  FROM public.recorrencias_atendimento r
  JOIN public.pacientes p ON p.id = r.paciente_id
  WHERE r.ativo = true
    AND (p.status_operacional = 'ativo' OR (p.status_operacional IS NULL AND p.ativo))
  ORDER BY r.paciente_id, r.vigencia_inicio DESC
)
DELETE FROM public.agenda_atendimentos a
USING ativa
WHERE a.paciente_id = ativa.paciente_id
  AND a.status = 'agendado' AND a.sessao_id IS NULL AND a.origem = 'recorrencia'
  AND a.data_atendimento >= GREATEST(CURRENT_DATE, ativa.primeira)
  AND (
    EXTRACT(ISODOW FROM a.data_atendimento)::int <> ativa.dia_semana
    OR left(a.horario,5) <> ativa.horario
    OR (ativa.vigencia_fim IS NOT NULL AND a.data_atendimento > ativa.vigencia_fim)
    OR (ativa.frequencia = 'quinzenal' AND ((a.data_atendimento - ativa.primeira) % 14) <> 0)
  );

INSERT INTO public.agenda_atendimentos
  (paciente_id, recorrencia_id, data_atendimento, horario, status, convenio_id, modalidade, valor_previsto, origem)
SELECT x.paciente_id, x.rec_id, d::date, x.horario, 'agendado', x.convenio_id, x.modalidade, x.valor_sessao, 'recorrencia'
FROM (
  SELECT DISTINCT ON (r.paciente_id)
    r.paciente_id, r.id AS rec_id, r.frequencia,
    left(r.horario,5) AS horario, r.convenio_id, r.modalidade, r.valor_sessao,
    r.vigencia_fim,
    (r.vigencia_inicio + (((r.dia_semana - EXTRACT(ISODOW FROM r.vigencia_inicio)::int) + 7) % 7))::date AS primeira
  FROM public.recorrencias_atendimento r
  JOIN public.pacientes p ON p.id = r.paciente_id
  WHERE r.ativo = true
    AND (p.status_operacional = 'ativo' OR (p.status_operacional IS NULL AND p.ativo))
  ORDER BY r.paciente_id, r.vigencia_inicio DESC
) x
CROSS JOIN generate_series(
  x.primeira::timestamp,
  (date_trunc('month', CURRENT_DATE) + INTERVAL '4 months' - INTERVAL '1 day')::timestamp,
  CASE WHEN x.frequencia = 'quinzenal' THEN INTERVAL '14 days' ELSE INTERVAL '7 days' END
) AS d
WHERE d::date >= CURRENT_DATE
  AND (x.vigencia_fim IS NULL OR d::date <= x.vigencia_fim)
ON CONFLICT (paciente_id, data_atendimento, horario) DO NOTHING;
