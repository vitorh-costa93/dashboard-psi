# Continuidade — Dashboard Psi

Atualizado: 12/11/2026.

- Objetivo: Informações iniciais online atualizam o perfil na aprovação; sessões esporádicas não substituem o horário recorrente na identificação do Dashboard.
- Arquivos: `api/forms.js`, `index.html`, migration `20261112191713_registration_profile_approval.sql`, testes de formulário/horário e `tests/sql/registration-profile-approval.sql`.
- Decisões: cada aprovação de cadastro aplica campos equivalentes não vazios; não altera marcadores da Anamnese. Respostas antigas já aprovadas não são reaplicadas automaticamente. Histórico mantém o horário real.
- Validação: 161 testes aprovados; migration aplicada; teste SQL transacional passou com rollback, incluindo rejeição, CPF inválido, repetição e permissões.
- Publicação: código `281a117` em main e produção READY; alias externo confirmado. Página publicada contém a correção e a API mantém autenticação obrigatória. Publicação via Git; CLI local recusou autorização, integração conectada concluiu normalmente.
- Pendências funcionais: nenhuma; dados de respostas antigas permanecem preservados para revisão administrativa.
