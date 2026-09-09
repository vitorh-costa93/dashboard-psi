-- A migration 20260909120000 corrigiu finalizar_agenda_atendimento para
-- gravar sessoes.horario no formato legado "Dia Hh(mm)" (ex.: "Sex 15h"),
-- mas isso só passou a valer para liquidações feitas DEPOIS do deploy.
-- Atendimentos já liquidados antes disso ficaram com o horário cru "HH:MM"
-- (ex.: "14:30"), deixando a coluna Horário da aba Dashboard com dois
-- formatos misturados. Esta migration converte, uma única vez, todo
-- sessoes.horario que ainda está em "HH:MM" para o formato legado -- usa o
-- dia da semana de data_sessao, então cada linha some corretamente.
UPDATE public.sessoes
SET horario = (ARRAY['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'])[EXTRACT(DOW FROM data_sessao)::int + 1]
  || ' ' || split_part(horario,':',1)::int || 'h'
  || CASE WHEN split_part(horario,':',2)::int = 0 THEN '' ELSE split_part(horario,':',2) END,
  atualizado_em = now()
WHERE horario ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$';
