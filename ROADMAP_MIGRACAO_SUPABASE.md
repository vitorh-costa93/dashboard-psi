# Handoff e roadmap — migração do dashboard-psi para Supabase

## 1. Objetivo deste documento

Este documento orienta a evolução segura do projeto `dashboard-psi`, preservando as funcionalidades e a identidade visual existentes enquanto a fonte de dados pública em planilha é substituída por uma arquitetura autenticada baseada em Supabase PostgreSQL.

Ele deve ser usado como fonte de contexto para o Codex durante a auditoria e a implementação. A execução deve ser incremental, validada e reversível. Nenhuma fase autoriza alterações destrutivas, exclusão prematura de dados, quebra intencional de compatibilidade ou mudanças visuais não solicitadas.

## 2. Decisões já tomadas

1. A Google Sheets API **não será a arquitetura final**. A planilha atual será somente uma fonte temporária para migração e validação.
2. O Supabase PostgreSQL será a fonte de verdade para pacientes, sessões, pacotes, convênios e, posteriormente, prontuários, anamneses e formulários.
3. O portal terá Supabase Auth e acesso administrativo completo. Não é necessário criar perfis distintos, rastreamento individual ou uma matriz complexa de permissões neste momento.
4. Todas as tabelas com dados privados deverão usar Row Level Security (RLS). Toda API privada deverá validar a sessão autenticada.
5. Chaves privilegiadas, especialmente `SUPABASE_SERVICE_ROLE_KEY`, nunca poderão aparecer no HTML, JavaScript entregue ao navegador, repositório ou logs. Secrets deverão existir somente no backend e nas variáveis de ambiente da Vercel/Supabase.
6. Pacientes terão IDs permanentes e imutáveis. Nome, telefone, convênio ou situação do paciente não poderão ser usados como identificador principal.
7. A migração será incremental, com comparação entre origem e destino, relatórios de divergência e possibilidade de rollback antes de cada troca de fonte.
8. Funcionalidades, cálculos, KPIs, alertas, filtros, fluxos e identidade visual atuais deverão ser preservados, salvo correção explicitamente aprovada.
9. Cada fase deverá terminar com validação e commit próprio. O Codex deverá parar e apresentar o resultado antes de iniciar a fase seguinte.

## 3. Arquitetura-alvo

Fluxo administrativo:

```text
Navegador
  -> Supabase Auth
  -> portal autenticado
  -> APIs autenticadas em /api
  -> Supabase PostgreSQL com RLS
```

Fluxo futuro de formulário externo:

```text
Link com token aleatório e expiração
  -> formulário público limitado ao propósito do token
  -> API pública específica, com validação e proteção contra abuso
  -> resposta pendente de revisão
  -> revisão administrativa autenticada
  -> incorporação explícita à anamnese/prontuário
```

Princípios:

- O navegador poderá usar somente credenciais públicas apropriadas, como a chave `anon`, sempre sob proteção de RLS.
- Operações privilegiadas deverão ocorrer no backend.
- A API nunca deverá confiar apenas em campos enviados pelo cliente; sessão, autorização, token, escopo e payload deverão ser validados no servidor.
- Dados clínicos exigem minimização de coleta, acesso restrito, transporte seguro, prevenção de vazamento em logs e rotinas claras de backup/recuperação.

## 4. Modelo de dados inicial proposto

Os nomes e campos definitivos dependem da auditoria do repositório e da planilha. O esquema abaixo é um ponto de partida, não uma autorização para aplicá-lo sem análise.

### `patients`

- `id uuid primary key default gen_random_uuid()`
- `legacy_id text null` para rastreabilidade da migração, se existir identificador anterior
- `full_name text not null`
- campos de contato estritamente necessários
- `status` ou `is_active`
- `insurance_id uuid null`
- metadados operacionais necessários
- `created_at`, `updated_at`

O `id` deverá ser permanente. Alterar nome, telefone ou convênio não poderá gerar um novo paciente.

### `insurances`

- `id uuid primary key`
- `name text not null`
- regras/valores específicos comprovadamente usados pelo sistema
- `active boolean`
- timestamps

### `packages`

- `id uuid primary key`
- `patient_id uuid not null references patients(id)`
- quantidade contratada, valor e datas aplicáveis
- estado do pacote
- timestamps

O saldo deverá ser derivado de regras explícitas e registros de sessões/movimentações, evitando campos duplicados sem reconciliação.

### `sessions`

- `id uuid primary key`
- `patient_id uuid not null references patients(id)`
- `package_id uuid null references packages(id)`
- data/hora e duração, quando aplicável
- comparecimento/status
- indicação de cobrança e valor efetivo
- convênio aplicável no momento da sessão, se necessário para preservar histórico
- timestamps

### Evolução posterior: prontuários e anamnese

Separar dados operacionais de dados clínicos. A estrutura definitiva deverá ser definida somente depois da base operacional estar estável. Possíveis entidades:

- `medical_records` ou `clinical_records` ligados por `patient_id`;
- `anamneses`, preferencialmente versionadas;
- registros de revisão e incorporação de respostas externas;
- anexos em storage privado, se necessários, com políticas específicas.

### Evolução posterior: formulários externos

Possíveis entidades:

- `form_templates`;
- `form_invites` com hash do token, finalidade, paciente, expiração, status e uso único quando aplicável;
- `form_submissions` com estado `pending_review`, `approved`, `rejected` ou equivalente;
- vínculo explícito entre submissão aprovada e a versão da anamnese que a incorporou.

Nunca armazenar o token bruto quando um hash verificável for suficiente. O link poderá ser enviado manualmente pelo WhatsApp; integração automatizada com WhatsApp não faz parte deste roadmap inicial.

## 5. Segurança e privacidade

Requisitos mínimos:

- autenticação obrigatória para todas as telas e APIs administrativas;
- sessão persistente com expiração e renovação seguras oferecidas pelo Supabase Auth;
- RLS habilitada em todas as tabelas privadas, sem políticas permissivas genéricas;
- APIs administrativas validando o JWT/sessão e recusando acesso não autenticado;
- `service_role` somente no ambiente server-side;
- nenhuma credencial em `index.html`, bundles, respostas da API, commits ou logs;
- variáveis de ambiente separadas por desenvolvimento, preview e produção;
- validação e normalização de entradas;
- mensagens de erro sem dados sensíveis;
- logs sem prontuários, respostas clínicas, tokens brutos ou dados pessoais desnecessários;
- links externos com token de alta entropia, finalidade limitada, expiração e revogação;
- proteção contra reenvio, enumeração e abuso nos endpoints públicos;
- backups e um procedimento testado de restauração antes de retirar a planilha do fluxo;
- revisão das políticas e do tratamento de dados clínicos conforme as obrigações aplicáveis ao responsável pelo sistema.

## 6. Estratégia de migração da planilha

A migração deverá ser repetível e idempotente.

1. Inventariar todas as colunas, abas, formatos, fórmulas e regras implícitas.
2. Definir o mapeamento de cada campo de origem para o novo esquema.
3. Normalizar datas, horários, valores, booleanos, nomes de convênios e estados.
4. Criar IDs permanentes e uma tabela/arquivo de correspondência com a origem.
5. Importar primeiro em ambiente seguro de desenvolvimento ou staging.
6. Produzir relatório com contagens, rejeições, duplicidades e divergências.
7. Comparar amostras e totais relevantes: pacientes, sessões, comparecimentos, cobranças, valores e saldos de pacote.
8. Corrigir o mapeamento e repetir a importação até obter resultados aceitos.
9. Fazer uma sincronização final ou estabelecer uma janela curta de congelamento da planilha.
10. Trocar a leitura do sistema para Supabase somente após validação formal.
11. Manter a planilha original como backup somente leitura pelo período acordado; não apagá-la durante este projeto.

Não deduplicar pacientes automaticamente por nome. Casos ambíguos deverão ser relatados para decisão humana.

## 7. Plano de execução por fases

### Fase 0 — auditoria somente leitura

Objetivo: entender o sistema real antes de propor mudanças.

Entregáveis:

- mapa de arquivos, endpoints e integrações;
- inventário completo dos acessos à planilha;
- modelo das colunas e regras de negócio atuais;
- inventário do Supabase já existente, schema SQL e uso atual;
- mapa de secrets e variáveis, apenas pelos nomes e locais de uso, sem revelar valores;
- riscos, lacunas e dúvidas;
- plano revisado com arquivos afetados, ordem, testes, critérios de aceite e rollback.

Nesta fase é proibido editar arquivos, executar migrações, alterar Supabase/Vercel ou instalar mudanças permanentes.

### Fase 1 — fundação de autenticação e segurança

Objetivo: proteger o portal e definir a fronteira cliente/servidor.

Escopo esperado:

- Supabase Auth no portal;
- tela de login coerente com a identidade visual existente;
- sessão persistente e logout;
- proteção das rotas/telas administrativas;
- função compartilhada de validação de sessão nas APIs;
- inventário e correção de secrets expostos, com rotação manual indicada quando necessária;
- políticas RLS iniciais testadas.

Não migrar a fonte principal de dados ainda.

Critérios de aceite: usuário autorizado entra e mantém sessão; usuário anônimo não acessa dados nem APIs privadas; nenhuma chave privilegiada chega ao navegador.

### Fase 2 — schema operacional e migração reproduzível

Objetivo: criar a estrutura de pacientes, convênios, pacotes e sessões, além do importador validado.

Escopo esperado:

- migrations SQL versionadas;
- constraints, índices, chaves estrangeiras e timestamps;
- RLS sem lacunas;
- script/rotina idempotente de importação;
- relatório de reconciliação;
- documentação de execução e rollback.

Critérios de aceite: reexecução não duplica registros; IDs permanecem estáveis; totais e amostras conciliam com a origem; nenhuma exclusão da planilha.

### Fase 3 — camada de APIs autenticadas

Objetivo: disponibilizar dados operacionais por contratos seguros e estáveis.

Escopo esperado:

- endpoints para as operações realmente usadas;
- autenticação, validação de payload e tratamento uniforme de erros;
- testes de acesso autorizado e negado;
- compatibilidade temporária quando necessária para permitir troca gradual.

Critérios de aceite: APIs não autenticadas falham com status apropriado; contratos estão documentados; service role permanece somente no servidor.

### Fase 4 — troca incremental do frontend

Objetivo: substituir as leituras da planilha por Supabase/APIs sem regressão funcional ou visual.

Migrar um domínio/fluxo por vez. Após cada troca, comparar com o comportamento anterior.

Validar:

- pacientes ativos;
- agenda/sessões e horários;
- comparecimento e cobrança;
- pacotes, saldo e renovação;
- valores e convênios;
- KPIs, alertas, filtros, estados vazios e erros;
- responsividade e identidade visual.

Critérios de aceite: paridade funcional e visual documentada; nenhuma dependência de leitura pública da planilha permanece antes do desligamento final.

### Fase 5 — corte definitivo e estabilização

Objetivo: tornar o Supabase a fonte de verdade operacional.

Escopo esperado:

- migração/sincronização final;
- validação de produção;
- remoção somente das integrações de execução com a planilha, sem apagar o backup;
- monitoramento de erros;
- plano de rollback testado;
- documentação operacional atualizada.

### Fase 6 — Prontuários e anamnese

Começar somente após a estabilização operacional. Definir separação entre dados administrativos e clínicos, versionamento da anamnese, acesso mínimo, storage privado quando necessário e prevenção de exposição em logs/exports.

### Fase 7 — formulários externos por token

Criar links individuais para envio via WhatsApp, com token seguro, expiração, revogação e escopo limitado. A submissão deverá entrar como pendente. Nenhuma resposta poderá alterar automaticamente a anamnese: o administrador deverá revisar, aprovar e incorporar explicitamente o conteúdo, preservando a versão anterior.

## 8. Regras obrigatórias para o Codex durante a implementação

- Antes de editar, ler este documento, `IMPLEMENTACAO.md`, o schema existente e as instruções do repositório.
- Não supor regras de negócio; comprovar no código/dados ou apresentar a dúvida.
- Não alterar arquivos fora do escopo da fase.
- Não reformatar arquivos inteiros sem necessidade.
- Não mudar identidade visual, textos ou navegação além do necessário para a fase.
- Não apagar tabelas, colunas, dados, planilhas, arquivos ou secrets.
- Não aplicar migrations destrutivas. Alterações aditivas primeiro; remoções somente em fase futura explicitamente aprovada.
- Não executar mudanças diretamente em produção sem mostrar plano, impacto e rollback.
- Não imprimir valores de secrets.
- Criar testes e verificações proporcionais ao risco.
- Conferir `git diff` antes do commit e incluir somente arquivos da fase.
- Fazer um commit separado por fase, com mensagem clara.
- Ao final de cada fase, parar e informar: arquivos alterados, decisões, testes, resultados, pendências, riscos, instruções manuais e rollback.
- Aguardar validação expressa antes de iniciar a fase seguinte.

## 9. Prompt pronto — auditoria somente leitura

Copie e envie este prompt ao Codex com o repositório `dashboard-psi` aberto:

```text
Leia integralmente o arquivo ROADMAP_MIGRACAO_SUPABASE.md na raiz e use-o como contexto e conjunto de restrições.

Execute somente a Fase 0: auditoria integral e estritamente somente leitura do repositório dashboard-psi. Não edite, crie, exclua, mova ou formate arquivos. Não faça commits. Não altere Supabase, Vercel, GitHub ou qualquer serviço externo. Não instale dependências nem execute comandos que modifiquem dados.

Mapeie:
1. Todos os arquivos e fluxos relevantes do sistema.
2. Todos os pontos em que frontend ou backend lê ou escreve na planilha atual, incluindo URLs, parsers, colunas, abas e fallbacks.
3. O significado das colunas e todas as regras de negócio comprovadas no código: pacientes ativos, sessões, horários, comparecimento, cobrança, pacotes, saldo, renovação, valores, convênios, KPIs, alertas, filtros e tratamento de erros.
4. Todas as tabelas, políticas, funções e integrações Supabase já existentes, incluindo o arquivo de schema atual.
5. Todos os endpoints em /api, seus contratos, autenticação atual e variáveis de ambiente utilizadas.
6. Riscos de segurança. Cite nomes de variáveis e locais de uso, mas nunca mostre valores de secrets.
7. Funcionalidades e elementos visuais que precisam ser preservados.
8. Lacunas, ambiguidades e decisões que exigem validação humana.

Depois proponha um plano revisado fase a fase, com:
- arquivos que provavelmente serão alterados;
- mudanças de schema e APIs;
- estratégia idempotente de migração e reconciliação;
- testes e critérios de aceite;
- riscos e rollback;
- ordem de commits.

Entregue apenas o relatório da auditoria e pare. Não implemente nenhuma mudança. Aguarde minha validação explícita.
```

## 10. Prompt pronto — execução faseada

Use este prompt somente depois de revisar e aprovar a auditoria:

```text
Leia ROADMAP_MIGRACAO_SUPABASE.md e o relatório aprovado da auditoria. Implemente somente a próxima fase aprovada por mim.

Antes de editar:
1. confirme o escopo exato da fase;
2. liste os arquivos que pretende alterar;
3. registre os critérios de aceite e o plano de rollback;
4. verifique o estado do Git e preserve qualquer mudança preexistente não relacionada.

Durante a execução:
- não avance para fases seguintes;
- não faça mudanças destrutivas;
- não apague dados, tabelas, colunas, planilhas ou arquivos;
- não exponha secrets e nunca envie service_role ao navegador;
- preserve funcionalidades e identidade visual;
- use migrations versionadas, operações aditivas e importação idempotente;
- valide autenticação, RLS e APIs tanto para acesso permitido quanto negado;
- faça mudanças mínimas e focadas.

Ao terminar:
1. execute as verificações e testes relevantes;
2. revise o diff para garantir que somente o escopo aprovado foi alterado;
3. crie um único commit dedicado a esta fase, sem incluir mudanças não relacionadas;
4. apresente arquivos alterados, resumo técnico em linguagem clara, testes/resultados, divergências encontradas, passos manuais, riscos remanescentes e rollback;
5. pare e aguarde minha validação explícita. Não inicie a próxima fase.

A fase autorizada agora é: [PREENCHER COM O NÚMERO E O NOME DA FASE APROVADA].
```

## 11. Checklist de conclusão geral

O projeto somente poderá ser considerado concluído quando:

- a planilha pública não participar mais do funcionamento do aplicativo;
- Supabase for a fonte de verdade operacional;
- login, sessão, APIs autenticadas e RLS estiverem testados;
- nenhum secret privilegiado estiver no cliente ou no repositório;
- pacientes tiverem IDs permanentes;
- pacientes, sessões, pacotes e convênios estiverem reconciliados;
- KPIs, alertas e fluxos atuais mantiverem paridade;
- houver backup e rollback documentados;
- prontuários/anamneses tiverem proteção adequada antes de receber dados clínicos;
- formulários externos usarem tokens seguros e revisão humana antes da incorporação;
- cada fase estiver registrada em commit próprio e validada antes da seguinte.

## 12. Fora de escopo até aprovação específica

- usar Google Sheets API como banco permanente;
- automação direta de envio pelo WhatsApp;
- múltiplos perfis administrativos ou auditoria individual dos dois usuários;
- redesenho visual amplo;
- exclusão definitiva da planilha ou dos dados legados;
- migração destrutiva de produção;
- incorporação automática de respostas externas ao prontuário.

Este roadmap deve ser atualizado quando a auditoria revelar fatos que contrariem as hipóteses iniciais, sempre mantendo o histórico das decisões e exigindo aprovação antes de ampliar o escopo.

