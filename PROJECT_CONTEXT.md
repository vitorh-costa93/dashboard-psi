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

## Autenticação administrativa

A Fase 1 implementa um único administrador:

- sem administrador configurado, o portal mostra somente o formulário de criação do primeiro acesso;
- a tabela `app_admin` aceita apenas uma linha e vincula esse acesso ao usuário do Supabase Auth;
- tentativas concorrentes de criar outro administrador falham; o usuário excedente é removido;
- depois da configuração, o formulário de criação deixa de existir no fluxo e somente o login é aceito;
- tokens de acesso e renovação ficam em cookies `HttpOnly`, `Secure` e `SameSite=Strict`;
- todas as APIs administrativas validam que a sessão pertence ao único usuário registrado;
- o cron de tendências exige `CRON_SECRET` quando não existe uma sessão administrativa;
- privilégios de `anon` e `authenticated` são revogados das tabelas privadas, e as políticas universais anteriores são removidas.

A primeira configuração deve ser feita pelo proprietário imediatamente após o deploy. Antes de existir a linha única em `app_admin`, o endereço de setup permanece disponível para a primeira criação bem-sucedida.

## Base operacional e migração

Em 19/08/2026, a Fase 2 criou de forma aditiva `convenios`, `pacotes`, `sessoes`, `pacientes_origem` e `importacoes`. As tabelas anteriores, incluindo `prontuarios`, não foram alteradas nem removidas.

O importador `scripts/import-sheet.mjs` usa uma chave determinística por paciente, data e ocorrência para fazer upsert. A correspondência permanente entre a identificação legada e `pacientes.id` fica em `pacientes_origem`, portanto mudanças futuras de atributos não recriam o paciente. Registros ausentes em uma execução posterior são relatados como obsoletos e não são excluídos automaticamente.

A importação foi executada duas vezes para testar idempotência. A reconciliação agregada confirmou, sem divergências:

- 2.343 sessões;
- 114 pacientes;
- 992 compras de pacote;
- 17 convênios;
- 1.788 sessões cobradas;
- 1.775 sessões consumidas;
- valor total de 155.930;
- valor final de 154.690.

A planilha continua preservada e o frontend ainda não foi trocado nesta fase.

## API e corte da fonte operacional

As Fases 3 a 5 adicionaram `/api/operational`, protegida pela sessão do administrador. Ela pagina todas as sessões no Supabase e devolve o contrato de campos já consumido pelo dashboard, preservando os cálculos e a interface atuais.

O frontend passou a carregar essa API e não contém mais URL, ID ou parser da planilha. A planilha permanece como backup e origem do importador/reconciliador, mas não participa mais do funcionamento normal da aplicação.

Rollback do corte: reverter o commit do frontend para a leitura anterior somente se uma divergência for comprovada. Não excluir as tabelas novas nem a planilha. Antes de qualquer rollback, executar `npm run reconcile:sheet` para registrar a diferença.

## Regras de continuidade

- Preserve a identidade visual e as regras comprovadas no código.
- Não exponha `SUPABASE_SERVICE_KEY`, tokens ou dados clínicos.
- Não altere o banco diretamente sem migration, revisão de impacto e rollback.
- Não trate nome, telefone, horário ou convênio como identidade permanente do paciente.
- Migrações e importadores devem ser repetíveis e não destrutivos.
- Atualize este documento quando houver mudança arquitetural, nova integração, alteração de schema ou avanço de fase do roadmap.
