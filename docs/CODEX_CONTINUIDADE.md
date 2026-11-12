# Continuidade — Dashboard Psi

Atualizado: 12/11/2026.

- Objetivo atual: reaplicar ao perfil a resposta cadastral de hoje, já aprovada antes da correção de sincronização. Acesso autenticado obtido e perfil conferido: nome completo e nascimento já coincidem com a resposta; CPF no cadastro vazio e CPF recebido tem apenas 8 dígitos. Reaplicação recusada pela validação, sem gravar identificador incompleto. Falta CPF completo; não afirmar cadastro integral concluído.
- Solução geral publicada anteriormente: aprovação das Informações iniciais atualiza o perfil; identificação no Dashboard usa horário recorrente, sem alterar o histórico das sessões avulsas.
- Complemento: botão “Atualizar perfil” nas respostas cadastrais aprovadas e RPC `reaplicar_cadastro_aprovado`, exclusiva do servidor, valida status/destino/arquivamento e registra autor/data. Campos decifrados somente no servidor; nenhuma credencial ou dado pessoal registrado.
- Arquivos: `api/forms.js`, `index.html`, migration `20261112193332_reapply_approved_registration.sql`, `tests/forms-template.test.js`, `PROJECT_CONTEXT.md`.
- Validação: 162 testes aprovados; scripts da página válidos; migration aplicada; teste SQL transacional com dados fictícios passou (gravação, auditoria e bloqueio de resposta pendente; rollback completo).
- Publicação do complemento: `9438c49` em main e produção READY; botão conferido na página publicada e alias externo confirmado. Tentativa de recuperação por runner foi removida: variáveis sensíveis de produção não são exportáveis; usar o fluxo autenticado da aplicação.
- Próximo passo: perfil aberto no navegador para o usuário informar o CPF completo. Depois conferir/salvar pelo fluxo normal. Os outros campos pessoais equivalentes já conferem. Resposta original preservada; nenhuma alteração aplicada nesta conferência.
