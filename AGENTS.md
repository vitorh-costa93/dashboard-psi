# Instruções do repositório — Dashboard Psi

Consulte as seções pertinentes de `PROJECT_CONTEXT.md` antes de alterar autenticação, SQL, APIs ou regras de negócio. O roadmap de migração está marcado como concluído: consulte `ROADMAP_MIGRACAO_SUPABASE.md` para histórico, rollback ou migração transversal. Leia integralmente quando a mudança exigir abrangência.

- Execute uma fase do roadmap por vez e pare para validação ao final.
- Preserve funcionalidades, cálculos e identidade visual existentes.
- Prefira migrations aditivas, importações idempotentes e mudanças reversíveis.
- Nunca exponha secrets, tokens, prontuários ou dados pessoais em código, logs ou commits.
- A `SUPABASE_SERVICE_KEY` é exclusivamente server-side.
- Confirme schema, colunas e regras no código ou nos dados antes de assumir comportamento.
- Revise o diff e execute as verificações relevantes antes de cada commit.
- Atualize `PROJECT_CONTEXT.md` quando houver decisão arquitetural ou avanço do roadmap.

## Mapa e invariantes
- Aplicação em `index.html`/`form.html`, APIs em `api/`, funções em `lib/`, migrations em `supabase/migrations/`.
- APIs administrativas validam sessão; dados privados com RLS. Identidade de paciente usa ID permanente, nunca nome/telefone.
- O cadastro operacional é a fonte de verdade; não reintroduza sincronização legada que sobrescreva dados atuais.
- Para código, execute `npm test`; para PSM/exportação, valide o PDF real e aparência além dos testes.
- PSM infantil vetorial: não usar páginas inteiras rasterizadas como fundo; preservar template compartilhado, dados dinâmicos e dimensões 864×576 pontos.
- Publicação por CLI precisa conferir o alias dos links externos: ver a seção correspondente de `CLAUDE.md`.

## Execução econômica
- Leia `docs/CODEX_CONTINUIDADE.md` somente ao retomar trabalho; atualize-o ao fechar uma etapa, sem copiar histórico ou segredos.
- Busque arquivos e seções relevantes antes de carregar documentos inteiros. Seções históricas são contexto sob demanda.
- Tarefas pequenas são diretas; delegue apenas trabalho independente extenso ou revisão de risco, com escopo e critério de aceite.
- Um responsável integra e valida o estado final. Subagentes fazem testes focados e devolvem evidência; não repetem toda a suíte/build por hábito.
- Alterações somente em instruções/documentação exigem revisão de diff e links, sem build de aplicação. Para código, cumpra as verificações abaixo; repita se o estado relevante mudar.
- Consulte `docs/CODEX_CONTEXTO.md` quando existir para localizar seções de contexto.
