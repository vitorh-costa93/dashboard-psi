-- Infraestrutura de notificações push (Web Push): inscrição do navegador,
-- controle de envio único por tipo de lembrete, e a consulta que resume um
-- dia da Agenda (quem tem sessão, quem está em débito, quem renova pacote).

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.push_subscriptions FROM anon, authenticated;
GRANT ALL ON TABLE public.push_subscriptions TO service_role;

-- Marca quando o lembrete pós-sessão ("atualize o prontuário") já foi
-- enviado para aquela linha da Agenda, pra não mandar de novo a cada
-- execução do cron (que roda a cada ~15min, não só uma vez no horário exato).
ALTER TABLE public.agenda_atendimentos ADD COLUMN IF NOT EXISTS lembrete_prontuario_enviado_em timestamptz;

-- Mesma ideia pro resumo diário (só um por dia).
CREATE TABLE IF NOT EXISTS public.notificacoes_diarias (
  data date PRIMARY KEY,
  enviado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notificacoes_diarias ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.notificacoes_diarias FROM anon, authenticated;
GRANT ALL ON TABLE public.notificacoes_diarias TO service_role;

-- Resume um dia da Agenda: pacientes com sessão marcada, saldo atual do
-- pacote (sessões cobradas - sessões consumidas, olhando todo o histórico
-- em `sessoes`) e o tamanho habitual do pacote que costumam comprar (moda
-- das compras >0, desempate pela mais recente -- mesma lógica já usada no
-- alerta de renovação do Dashboard, só que em SQL).
CREATE OR REPLACE FUNCTION public.resumo_agenda_dia(p_data date)
RETURNS TABLE(paciente_id uuid, nome text, horario text, saldo numeric, pacote_habitual numeric)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT p.id, p.nome, a.horario,
    COALESCE(s.saldo, 0) AS saldo,
    COALESCE(m.pacote_habitual, 0) AS pacote_habitual
  FROM public.agenda_atendimentos a
  JOIN public.pacientes p ON p.id = a.paciente_id
  LEFT JOIN LATERAL (
    SELECT SUM(sessoes_cobradas) - SUM(sessao_consumida) AS saldo
    FROM public.sessoes WHERE paciente_id = a.paciente_id
  ) s ON true
  LEFT JOIN LATERAL (
    SELECT sessoes_cobradas AS pacote_habitual
    FROM public.sessoes
    WHERE paciente_id = a.paciente_id AND sessoes_cobradas > 0
    GROUP BY sessoes_cobradas
    ORDER BY count(*) DESC, max(data_sessao) DESC
    LIMIT 1
  ) m ON true
  WHERE a.data_atendimento = p_data AND a.status IN ('agendado','realizado')
  ORDER BY a.horario ASC;
$$;
REVOKE ALL ON FUNCTION public.resumo_agenda_dia(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resumo_agenda_dia(date) TO service_role;

-- pg_cron a cada 15min chamando a mesma rota protegida (padrão já usado pelo
-- import horário da planilha) -- reaproveita o mesmo secret do Vault, já que
-- requireAuthOrCron só confere CRON_SECRET, sem distinguir o job.
create or replace function public.invoke_send_notifications()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  sync_secret text;
begin
  select decrypted_secret
    into sync_secret
    from vault.decrypted_secrets
   where name = 'sheet_import_secret'
   order by created_at desc
   limit 1;

  if sync_secret is null then
    raise warning 'Supabase Vault secret sheet_import_secret is not configured';
    return;
  end if;

  perform net.http_get(
    url := 'https://dashboard-psi-tau.vercel.app/api/trends?job=send-notifications',
    headers := jsonb_build_object('Authorization', 'Bearer ' || sync_secret),
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function public.invoke_send_notifications() from public, anon, authenticated;
grant execute on function public.invoke_send_notifications() to postgres, service_role;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
    from cron.job
   where jobname = 'send-notifications';

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule(
    'send-notifications',
    '*/15 * * * *',
    'select public.invoke_send_notifications()'
  );
end;
$$;

comment on function public.invoke_send_notifications() is
  'Invokes the protected Vercel endpoint that checks and sends due push notifications, every 15 minutes.';
