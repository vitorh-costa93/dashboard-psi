# Continuidade — dashboard-psi

Atualizado: 21/10/2026.

## Entrega mais recente
- Base: main, commit `28129f917dd5df89e490f8984392f97a92a2e646`.
- Pedido: aniversariantes da semana no painel de alertas, ao lado de pendências e renovações.
- `index.html`: nomes curtos e dia/mês, ordenados por data; contador e estado vazio. Usa `data_nascimento` apenas dos pacientes ativos do cadastro, exclui Wellz e independe do histórico financeiro. Semana de segunda a domingo, incluindo virada do ano; 29/02 somente quando existe no ano.
- `tests/birthday-alerts.test.js`: cinco testes de calendário, elegibilidade e renderização/resumo, incluindo escape de HTML e limpeza do contador.
- Validação: `npm test` passou nos 22 arquivos; os cinco testes específicos passaram em execução direta. Sintaxe dos scripts inline verificada.
- Sem alteração de API, schema ou regras financeiras. Usuário autorizou push direto na main e fará a conferência em PRD.

## Próximo passo
- Conferir a coluna no ambiente publicado com cadastro real. Ler `AGENTS.md` antes de novas alterações.
