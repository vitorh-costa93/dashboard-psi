# Contexto técnico — Dashboard Psi

Documento vivo para continuidade técnica. Leia também `ROADMAP_MIGRACAO_SUPABASE.md` antes de alterar autenticação, banco, APIs ou regras de negócio.

## Setup do repositório

- Repositório GitHub: `vitorh-costa93/dashboard-psi`.
- Aplicação estática com funções serverless em `api/`, publicada pela Vercel.
- Projeto Supabase: `dashboard-psi` (`tanluftwqzckzqiwqkhw`), região `us-west-2`, PostgreSQL 17.
- O Supabase CLI está fixado como dependência de desenvolvimento na versão `2.115.0`.
- Em 19/08/2026, o checkout foi vinculado ao projeto remoto e o schema `public` existente foi exportado, sem dados ou secrets, para `supabase/migrations/20260819000000_remote_schema.sql`.
- A baseline foi registrada como já aplicada no histórico remoto. `supabase db push --dry-run` confirmou que o banco está atualizado e que não há migrations, seeds ou roles pendentes.
- O vínculo local fica em `supabase/.temp` e nunca deve ser versionado.
- Secrets ficam somente no ambiente server-side e nas configurações da Vercel/Supabase.

## Estado da migração

A planilha pública ainda é a fonte operacional do dashboard. O Supabase já armazena pacientes sincronizados, prontuários, atividades, posts, artes e radar de tendências, mas o portal e as APIs ainda não têm autenticação administrativa.

O schema remoto foi capturado em uma migration baseline sem dados. A baseline representa o estado encontrado no projeto remoto e não deve ser reaplicada sobre esse mesmo projeto. Alterações futuras devem ser migrations aditivas posteriores.

A captura confirmou seis tabelas existentes: `atividades`, `pacientes`, `post_artes`, `posts`, `prontuarios` e `trend_radar`. O arquivo legado `supabase schema.sql` não é a fonte confiável do estado remoto: há diferenças de colunas, especialmente nas estruturas de artes e posts. Consulte a baseline antes de preparar qualquer migration.

Risco conhecido para a Fase 1: o schema remoto concede privilégios amplos a `anon` e `authenticated`, e cinco tabelas têm políticas RLS com condição universal (`USING (true)` e `WITH CHECK (true)`). A tabela `post_artes` tem RLS habilitada sem política. Nenhuma dessas permissões foi modificada durante a preparação da conexão.

## Regras de continuidade

- Preserve a identidade visual e as regras comprovadas no código.
- Não exponha `SUPABASE_SERVICE_KEY`, tokens ou dados clínicos.
- Não altere o banco diretamente sem migration, revisão de impacto e rollback.
- Não trate nome, telefone, horário ou convênio como identidade permanente do paciente.
- Migrações e importadores devem ser repetíveis e não destrutivos.
- Atualize este documento quando houver mudança arquitetural, nova integração, alteração de schema ou avanço de fase do roadmap.
