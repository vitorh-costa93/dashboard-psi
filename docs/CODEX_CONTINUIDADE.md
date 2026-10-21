# Continuidade — dashboard-psi

Atualizado: 21/10/2026.

## Entrega mais recente
- Base: main, commit `b133007f0f961d0f10293c9f37a571e64a1fb588`.
- Pedido: corrigir as legendas do mapa da agenda e destacar quinzenal sozinho, com vaga para revezar.
- `index.html`: legenda corresponde às cores de ocupação (livre, ocupado, quinzenal com vaga e Wellz). A frequência vem da recorrência da Agenda. Azul e texto “15d + vaga” somente quando existe uma única regra quinzenal naquela célula; duas regras, semanal, Wellz ou histórico sem recorrência não sugerem vaga. A grade continua agregada por hora cheia, conservadoramente sem sugerir vaga quando há mais de uma regra na hora.
- `tests/agenda-map.test.js`: quatro testes de renderização para vaga quinzenal, horário compartilhado/semanal, Wellz, fallback histórico e legenda.
- Validação: `npm test` passou nos 23 arquivos; os quatro testes específicos passaram em execução direta. Sintaxe dos scripts inline verificada.
- Sem alteração de API, schema ou regras financeiras. Usuário autorizou push direto na main e fará a conferência em PRD.

## Próximo passo
- Conferir o mapa no ambiente publicado com cadastro real. A coluna de aniversariantes ativos foi entregue no commit anterior. Ler `AGENTS.md` antes de novas alterações.
