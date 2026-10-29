# Continuidade — dashboard-psi

Atualizado: 29/10/2026. KPI financeiro concluído: consolidação pelo valor efetivamente recebido.

## Estado e próximo passo
- Não há tarefa funcional pendente desta etapa. Antes de uma nova alteração, confirme `git status -sb` e o histórico remoto; não sobrescreva alterações existentes.
- Leia somente as referências necessárias ao pedido. Regras obrigatórias em `AGENTS.md`.
- Ao encerrar a próxima etapa, substitua este estado pelo objetivo, decisões, caminhos alterados, verificações executadas e pendências reais.
- No live-coach, separar iRacing V3 e AMS2 no registro.

## Entrega mais recente
- Objetivo concluído: somar `valor_final`/“Valor Recebido” persistido, sem derivar valor de `sessões cobradas × valor da sessão`.
- Arquivos: `index.html`, `tests/dashboard-financials.test.js`, `PROJECT_CONTEXT.md`.
- Decisão: KPI, comparativos, gráficos, ticket médio e resumo CNPJ compartilham a mesma fonte financeira; linhas mensais históricas Wellz mantêm o valor histórico próprio.
- Evidência de validação: `node --test tests/dashboard-financials.test.js` e `npm test` (148 testes aprovados).
- Pendências: nenhuma funcional; publicação em GitHub e produção é a etapa de encerramento em curso.

## Próximo passo
- Conferir o mapa no ambiente publicado com cadastro real. A coluna de aniversariantes ativos foi entregue no commit anterior. Ler `AGENTS.md` antes de novas alterações.
