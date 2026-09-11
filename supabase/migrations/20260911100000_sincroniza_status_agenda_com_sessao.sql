-- Bug real: editar um atendimento pelo Dashboard (Atendimentos --
-- detalhado) só atualizava a tabela `sessoes` -- o `agenda_atendimentos`
-- vinculado (usado pela aba Agenda) ficava com o status/valores antigos
-- para sempre. Reportado pela psicóloga: corrigiu a sessão de Yasmin
-- Garcia em 10/09 (Sim, 2 sessões, R$260), mas a Agenda continuava
-- mostrando "Cancelado". Mesma coisa com o Raul em 07/09 (Cancelado, R$160
-- na sessão real, mas a Agenda ainda mostrava "Não").
--
-- O conserto de raiz (api/operational.js: update_session agora sincroniza
-- de volta) já vai junto nesta entrega. Aqui corrige TODOS os
-- agenda_atendimentos de 2026 (já na Agenda nova) que estão desalinhados
-- da sessão vinculada -- não só os dois casos relatados. Sem mexer no
-- status impreciso de registros históricos importados da planilha antes
-- de 2026, que é cosmético (a tela sempre usa o valor ao vivo da sessão
-- vinculada, não o campo cacheado) e não afeta nada em uso hoje.
UPDATE public.agenda_atendimentos a
SET status = CASE s.comparecimento WHEN 'Sim' THEN 'realizado' WHEN 'Não' THEN 'falta' ELSE 'cancelado' END,
    sessoes_cobradas = s.sessoes_cobradas,
    sessao_consumida = s.sessao_consumida,
    valor_recebido = s.valor_final,
    atualizado_em = now()
FROM public.sessoes s
WHERE a.sessao_id = s.id
  AND a.data_atendimento >= '2026-01-01'
  AND s.comparecimento IN ('Sim','Não','Cancelado')
  AND (
    a.status <> CASE s.comparecimento WHEN 'Sim' THEN 'realizado' WHEN 'Não' THEN 'falta' ELSE 'cancelado' END
    OR a.sessoes_cobradas IS DISTINCT FROM s.sessoes_cobradas
    OR a.valor_recebido IS DISTINCT FROM s.valor_final
  );
