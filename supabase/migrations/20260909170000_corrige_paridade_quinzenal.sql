-- Aline Sgardiolli, João Victor, Juliana e Laura J já estavam corretamente
-- marcados como "quinzenal", mas a data de vigência (âncora usada por
-- buildOccurrences() para decidir qual semana é "par"/"ímpar") estava
-- errada, fazendo a Agenda gerar atendimento na semana "de folga" de cada
-- um. A psicóloga confirmou a semana correta de cada paciente:
--   Aline Sgardiolli: terça, semana de 15/09/2026 (não 08/09)
--   João Victor:      quinta, semana de 10/09/2026 (não 17/09)
--   Juliana:           quinta, semana de 17/09/2026 (não 10/09)
--   Laura J:           quarta, semana de 16/09/2026 (não 09/09 -- o
--                      comparecimento de 09/09 foi um engano e deve ser
--                      apagado, confirmado pela psicóloga)
-- Corrige a âncora e limpa os atendimentos já gerados na semana errada
-- (só os ainda "agendado", nunca um atendimento já liquidado -- exceto o
-- de Laura J em 09/09, removido explicitamente abaixo por pedido direto).

UPDATE public.recorrencias_atendimento
SET vigencia_inicio='2026-09-15', atualizado_em=now()
WHERE ativo=true AND paciente_id=(SELECT id FROM public.pacientes WHERE nome ILIKE 'Aline Sgardiolli%');

UPDATE public.recorrencias_atendimento
SET vigencia_inicio='2026-09-10', atualizado_em=now()
WHERE ativo=true AND paciente_id=(SELECT id FROM public.pacientes WHERE nome ILIKE 'João Victor%');

UPDATE public.recorrencias_atendimento
SET vigencia_inicio='2026-09-17', atualizado_em=now()
WHERE ativo=true AND paciente_id=(SELECT id FROM public.pacientes WHERE nome ILIKE 'Juliana%');

UPDATE public.recorrencias_atendimento
SET vigencia_inicio='2026-09-16', atualizado_em=now()
WHERE ativo=true AND paciente_id=(SELECT id FROM public.pacientes WHERE nome ILIKE 'Laura J%');

-- Remove atendimentos de setembro/2026 já gerados na semana errada (ainda
-- não liquidados) para os 4 pacientes, usando a âncora já corrigida acima.
DELETE FROM public.agenda_atendimentos a
USING public.pacientes p, public.recorrencias_atendimento r
WHERE a.paciente_id=p.id AND r.paciente_id=p.id AND r.ativo=true
  AND p.nome ILIKE ANY(ARRAY['Aline Sgardiolli%','João Victor%','Juliana%','Laura J%'])
  AND a.status='agendado' AND a.sessao_id IS NULL
  AND a.data_atendimento BETWEEN '2026-09-01' AND '2026-09-30'
  AND (a.data_atendimento - r.vigencia_inicio) % 14 <> 0;

-- Comparecimento de Laura J em 09/09/2026 -- pedido explícito: apagar (era
-- semana de folga dela). Esse atendimento já estava liquidado (Sim), então
-- não é pego pelo DELETE acima (que só mexe em "agendado"); remove a linha
-- de agenda_atendimentos e a sessão financeira vinculada a ela.
DO $$
DECLARE v_agenda_id uuid; v_sessao_id uuid;
BEGIN
  SELECT a.id, a.sessao_id INTO v_agenda_id, v_sessao_id
    FROM public.agenda_atendimentos a
    JOIN public.pacientes p ON p.id=a.paciente_id
    WHERE p.nome ILIKE 'Laura J%' AND a.data_atendimento='2026-09-09';
  IF v_agenda_id IS NOT NULL THEN
    DELETE FROM public.agenda_atendimentos WHERE id=v_agenda_id;
    IF v_sessao_id IS NOT NULL THEN DELETE FROM public.sessoes WHERE id=v_sessao_id; END IF;
  END IF;
END $$;
