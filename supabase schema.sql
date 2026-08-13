-- ══════════════════════════════════════════════════════════
-- SCHEMA DO SUPABASE — Consultório
-- Rode este script no SQL Editor do Supabase.
-- Ele é compatível com o banco já existente.
-- ══════════════════════════════════════════════════════════

create table if not exists atividades (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  tipo text,
  faixa text,
  tema text,
  img_b64 text,
  imagens_b64 jsonb,
  logo_cor text,
  prompt text,
  criado_em timestamptz default now()
);

-- Identidade permanente do paciente.
-- O nome vem da aba "Base de Pacientes" e é único.
create table if not exists pacientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ativo boolean not null default true,
  ultima_chave text,
  ultimo_label text,
  atualizado_em timestamptz default now(),
  criado_em timestamptz default now()
);

create unique index if not exists idx_pacientes_nome_unique on pacientes(nome);

create table if not exists prontuarios (
  id uuid primary key default gen_random_uuid(),
  paciente_key text not null,
  paciente_label text not null,
  paciente_id uuid references pacientes(id) on delete set null,
  data_sessao date not null,
  relato text not null,
  criado_em timestamptz default now()
);

create index if not exists idx_atividades_tipo on atividades(tipo);
alter table prontuarios add column if not exists paciente_id uuid references pacientes(id) on delete set null;

create index if not exists idx_prontuarios_paciente on prontuarios(paciente_key);
create index if not exists idx_prontuarios_paciente_id on prontuarios(paciente_id);
create index if not exists idx_pacientes_nome on pacientes(nome);
create index if not exists idx_pacientes_ativo on pacientes(ativo);

-- Posts ficam separados das atividades terapêuticas.
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  tema text,
  formato text,
  publico text,
  legenda text,
  hashtags text,
  cta text,
  img_b64 text,
  imagens_b64 jsonb,
  logo_cor text,
  prompt text,
  fonte_tendencia text,
  tendencia text,
  status text not null default 'rascunho',
  criado_em timestamptz default now()
);

create index if not exists idx_posts_status on posts(status);
create index if not exists idx_posts_criado_em on posts(criado_em desc);

alter table posts add column if not exists imagens_b64 jsonb;
alter table posts add column if not exists logo_cor text;
alter table posts add column if not exists arte_count integer not null default 0;

create table if not exists trend_radar (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  resumo text,
  por_que text,
  formato text,
  potencial text,
  angulo text,
  fonte_titulo text,
  fonte_url text,
  fonte_publicacao text,
  criado_em timestamptz default now()
);
create index if not exists idx_trend_radar_criado_em on trend_radar(criado_em desc);


alter table atividades enable row level security;
alter table pacientes enable row level security;
alter table prontuarios enable row level security;
alter table posts enable row level security;
alter table trend_radar enable row level security;

-- A API usa service_role; as políticas abaixo mantêm compatibilidade
-- com a configuração atual.
do $$ begin
  create policy "Permitir tudo via service role" on atividades
    for all using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Permitir tudo via service role" on pacientes
    for all using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Permitir tudo via service role" on prontuarios
    for all using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Permitir tudo via service role" on posts
    for all using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Permitir tudo via service role" on trend_radar
    for all using (true) with check (true);
exception when duplicate_object then null; end $$;
