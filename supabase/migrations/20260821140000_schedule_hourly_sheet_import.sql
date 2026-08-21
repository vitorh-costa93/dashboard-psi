-- Mirrors the pattern used by the iracing-analytics project: Supabase's own
-- pg_cron (not Vercel's) owns the clock, calling a protected Vercel endpoint
-- over HTTP via pg_net. This sidesteps the Vercel Hobby plan's cron limits
-- (daily-only schedules, and a hard cap on serverless functions per
-- deployment) entirely, since Vercel Cron is never involved.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.invoke_hourly_sheet_import()
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
    url := 'https://dashboard-psi-tau.vercel.app/api/trends?job=import-sheet',
    headers := jsonb_build_object('Authorization', 'Bearer ' || sync_secret),
    timeout_milliseconds := 110000
  );
end;
$$;

revoke all on function public.invoke_hourly_sheet_import() from public, anon, authenticated;
grant execute on function public.invoke_hourly_sheet_import() to postgres, service_role;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
    from cron.job
   where jobname = 'hourly-sheet-import';

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule(
    'hourly-sheet-import',
    '7 * * * *',
    'select public.invoke_hourly_sheet_import()'
  );
end;
$$;

comment on function public.invoke_hourly_sheet_import() is
  'Invokes the protected Vercel endpoint for an hourly spreadsheet import.';
