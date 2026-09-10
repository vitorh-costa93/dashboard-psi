-- A feature de push notifications (migration remota 20260910000000,
-- "push_notifications") foi revertida no codigo (commit 7cbac0e) mas os
-- objetos de banco ficaram: um cron a cada 15min chamando uma rota que nao
-- existe mais (/api/trends?job=send-notifications), duas tabelas vazias,
-- uma coluna nunca usada e duas funcoes sem chamador. Nada tem dado (0
-- inscricoes, 0 lembretes). Remove tudo -- se a feature voltar, o
-- `git revert 7cbac0e` traz de volta codigo + migration.

DO $$
DECLARE v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'send-notifications';
  IF v_jobid IS NOT NULL THEN PERFORM cron.unschedule(v_jobid); END IF;
END $$;

DROP FUNCTION IF EXISTS public.invoke_send_notifications();
DROP FUNCTION IF EXISTS public.resumo_agenda_dia(date);
DROP TABLE IF EXISTS public.push_subscriptions;
DROP TABLE IF EXISTS public.notificacoes_diarias;
ALTER TABLE public.agenda_atendimentos DROP COLUMN IF EXISTS lembrete_prontuario_enviado_em;
