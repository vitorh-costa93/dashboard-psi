-- ══════════════════════════════════════════════════════════
-- SCHEMA DO SUPABASE — Cole isso no SQL Editor do Supabase
-- (Supabase → SQL Editor → New query → cole e clique em RUN)
-- ══════════════════════════════════════════════════════════

-- Tabela de atividades (imagens geradas) e apresentações (PPT)
create table if not exists atividades (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  tipo text,
  faixa text,
  tema text,
  img_b64 text,        -- imagem em base64 (null para apresentações)
  prompt text,          -- prompt da imagem OU JSON dos slides da apresentação
  criado_em timestamptz default now()
);

-- Tabela de prontuários (sessões por paciente)
create table if not exists prontuarios (
  id uuid primary key default gen_random_uuid(),
  paciente_key text not null,     -- identificador único do paciente (vem do dashboard)
  paciente_label text not null,   -- label amigável "Horário | Iniciais"
  data_sessao date not null,
  relato text not null,
  criado_em timestamptz default now()
);

-- Índices para busca rápida
create index if not exists idx_atividades_tipo on atividades(tipo);
create index if not exists idx_prontuarios_paciente on prontuarios(paciente_key);

-- Habilita Row Level Security (mas com política aberta, já que
-- o acesso é controlado pela nossa API route no Vercel usando a service key)
alter table atividades enable row level security;
alter table prontuarios enable row level security;

-- Política: permite tudo via service_role key (usada pela nossa API)
create policy "Permitir tudo via service role" on atividades
  for all using (true) with check (true);

create policy "Permitir tudo via service role" on prontuarios
  for all using (true) with check (true);
