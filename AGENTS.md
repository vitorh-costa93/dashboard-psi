# Instruções do repositório — Dashboard Psi

Leia integralmente `ROADMAP_MIGRACAO_SUPABASE.md` e `PROJECT_CONTEXT.md` antes de alterar autenticação, SQL, APIs, migração ou regras de negócio.

- Execute uma fase do roadmap por vez e pare para validação ao final.
- Preserve funcionalidades, cálculos e identidade visual existentes.
- Prefira migrations aditivas, importações idempotentes e mudanças reversíveis.
- Nunca exponha secrets, tokens, prontuários ou dados pessoais em código, logs ou commits.
- A `SUPABASE_SERVICE_KEY` é exclusivamente server-side.
- Confirme schema, colunas e regras no código ou nos dados antes de assumir comportamento.
- Revise o diff e execute as verificações relevantes antes de cada commit.
- Atualize `PROJECT_CONTEXT.md` quando houver decisão arquitetural ou avanço do roadmap.
