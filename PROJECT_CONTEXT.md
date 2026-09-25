# Contexto técnico — Dashboard Psi

Documento vivo para continuidade técnica. Leia também `ROADMAP_MIGRACAO_SUPABASE.md` antes de alterar autenticação, banco, APIs ou regras de negócio.

## Fase de documentos clínicos (20/08/2026)

- A aba administrativa `Documentos` foi validada localmente em desktop e celular e autorizada para implantação em produção.
- Os documentos são vinculados ao ID permanente do paciente e o conteúdo é criptografado no servidor com a mesma chave e o mesmo envelope AES-256-GCM usados por anamneses e formulários.
- A migration aditiva `20260820090000_clinical_documents.sql` cria `documentos_clinicos`, com RLS, acesso exclusivo da service role e arquivamento lógico em vez de exclusão física.
- Os tipos previstos são: termos infantil e adulto, orçamento, recibo, relatório psicológico, solicitação escolar e declaração de comparecimento.
- Relatório e solicitação escolar podem usar IA somente para organizar o texto fornecido pela profissional; a resposta permanece editável e precisa ser revisada antes de salvar.
- A exportação principal é `.docx`; a impressão do navegador permite salvar em PDF. Ambos seguem a identidade visual da profissional.
- A mesma fase troca o cabeçalho pela logo oficial, aplica a marca às atividades geradas e generaliza o ditado por voz para campos textuais administrativos.
- Para respeitar o limite de 12 funções do plano Hobby da Vercel, Documentos reutiliza a rota autenticada `/api/forms?resource=documents`; a lógica interna fica isolada em `lib/documents.js`.
- Rollback funcional: retirar a nova aba e o recurso `documents` de `/api/forms`; a tabela aditiva pode permanecer inacessível e sem uso, preservando os dados já salvos.

## Setup do repositório

- Repositório GitHub: `vitorh-costa93/dashboard-psi`.
- Aplicação estática com funções serverless em `api/`, publicada pela Vercel.
- Projeto Supabase: `dashboard-psi` (`tanluftwqzckzqiwqkhw`), região `us-west-2`, PostgreSQL 17.
- O Supabase CLI está fixado como dependência de desenvolvimento na versão `2.115.0`.
- O Vercel CLI está fixado como dependência de desenvolvimento na versão `59.5.0`
  e é acionado por `npm run vercel -- ...`; em 10/09/2026 o checkout foi
  confirmado como vinculado ao projeto `consultorio-jaqueline`.
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
- o backend aceita a chave moderna `sb_secret_...` apenas no cabeçalho `apikey`; `Authorization: Bearer` fica reservado aos tokens de usuário e à compatibilidade temporária com chaves legadas.

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

Na estabilização, respostas administrativas passaram a usar `Cache-Control: private, no-store`; se uma sessão expirar, o frontend retorna ao fluxo de autenticação. O corte somente deve ser promovido à produção com `CRON_SECRET` configurado e após a criação imediata do primeiro administrador.

## Dados clínicos e formulários externos

As Fases 6 e 7 são aditivas e não substituem `prontuarios`. `registros_clinicos` e `anamneses_versoes` permitem evolução clínica versionada. Modelos, convites e respostas externas ficam separados; o banco armazena somente o hash do token, o link expira e aceita um único envio.

Toda resposta entra como `pending_review`. Aprovar cria uma nova versão de anamnese em transação; rejeitar preserva a resposta e registra a decisão. O formulário público não revela o paciente e informa que a incorporação não é automática.

Os controles administrativos ficam ao final da página de Prontuários, sem alterar o formulário de registro de sessões nem a biblioteca existente.

## Regras de continuidade

- Preserve a identidade visual e as regras comprovadas no código.
- Não exponha `SUPABASE_SERVICE_KEY`, tokens ou dados clínicos.
- Não altere o banco diretamente sem migration, revisão de impacto e rollback.
- Não trate nome, telefone, horário ou convênio como identidade permanente do paciente.
- Migrações e importadores devem ser repetíveis e não destrutivos.
- Atualize este documento quando houver mudança arquitetural, nova integração, alteração de schema ou avanço de fase do roadmap.

## Geração de imagens — GPT Image 2.5 (15/09/2026)

- A rota autenticada `/api/gemini` usa a Image API da OpenAI com o modelo `gpt-image-2.5-flare` tanto para geração quanto para edição de fotos próprias. A escolha prioriza velocidade e qualidade para o fluxo recorrente de posts; a qualidade permanece `medium`, preservando a decisão de custo anterior.
- A paginação do carrossel é uma camada transparente aplicada pelo aplicativo: ela não apaga nem cria um bloco de fundo sobre a arte.
- Os prompts de geração e edição passaram a tratar legibilidade como requisito não negociável: contraste por bloco, sombra/glow visível e destaque localizado somente quando necessário.
- Carrosséis usam de 4 a 10 páginas conforme a profundidade do assunto; sete não é uma quantidade padrão. A imagem reserva, sem tarja ou painel, uma zona contínua e calma no canto superior esquerdo para o contador aplicado pelo aplicativo. Como salvaguarda, o contador adapta sua cor e recebe contorno tipográfico ao contraste real da arte.
- Quando o fundo é uma foto enviada, a IA recebe a foto e o tema para criar uma direção visual editorial, preservando pessoas e objetos reais. A cópia do post não é enviada ao modelo: o aplicativo desenha o texto final em uma superfície editorial de leitura, com fonte real, quebra calculada e a área central/direita livre para o sujeito da imagem. Isso mantém a experiência criativa sem permitir vazamento de prompts ou texto ilegível.

## Padronização dos documentos clínicos

Na correção visual de 20/08/2026, os documentos passaram a exibir datas no padrão brasileiro, inclusive ao abrir registros antigos que ainda contenham datas ISO. O seletor de paciente define somente a pasta de armazenamento; o nome completo que aparece no documento é informado em campo próprio e obrigatório.

Todos os modelos oferecem versões colorida e em preto e branco. A escolha é gravada junto ao conteúdo criptografado e respeitada na prévia e nas exportações. Depois de salvar, o formulário é totalmente reiniciado; documentos armazenados continuam acessíveis e podem ser arquivados pela pasta do paciente.

O assistente de relatório foi orientado a converter falas coloquiais, ofensivas ou literais em discurso indireto, técnico e respeitoso, sem inventar fatos. Os arquivos `assets/logo-jaqueline.svg` e `assets/logo-jaqueline-hires.png` pertencem à tentativa anterior de vetorização integral e ficam apenas como histórico; a composição ativa da marca é descrita abaixo.

## Marca tipográfica e biblioteca de PSM

Em 20/08/2026, a marca deixou de usar o nome rasterizado. O símbolo floral fica isolado em SVG e o lettering é composto no aplicativo com a Agrandir Tight incorporada nos PDFs originais da profissional: peso bold em “Jaqueline” e “PSICÓLOGA”, regular em “Vieira” e no CRP. Artes geradas repetem essa composição diretamente no canvas, sem ampliar uma captura do logotipo.

O cabeçalho dos documentos segue o modelo do relatório fornecido, com círculo em verde oliva, e a assinatura padronizada informa: Jaqueline Cristina Vieira, CRP 06/191478, Psicóloga Clínica e Pós-graduada em Terapia Cognitivo-Comportamental.

Após validação visual em produção, o cabeçalho foi refinado para reproduzir a geometria do modelo: círculo oliva pastel menor, símbolo e lettering concentrados à esquerda, linha curta apenas sob o bloco da marca, fundo quente muito claro e assinatura em cinza suave. O quadro de valores das PSMs usa colunas fixas e tipografia reduzida para manter rótulos e valores integralmente dentro da caixa tanto na prévia quanto no PDF.

A aba Documentos contém duas sub-abas: `Documentos` e `PSM`. A PSM preserva as dez páginas originais das versões adulta e infantil e altera somente os valores da sessão individual e do pacote de quatro sessões. A migration aditiva `20260820130000_psm_library.sql` cria `psm_modelos`, uma biblioteca administrativa reutilizável sem vínculo com paciente. Os registros guardam público, título e valores; RLS bloqueia clientes e o acesso ocorre apenas pela API administrativa autenticada.

Na rodada final de refinamento visual, o cabeçalho dos documentos foi ajustado novamente para aproximar a geometria do PDF de referência: círculo oliva pastel circular, menor, atravessando a linha inferior, com a marca deslocada para a esquerda. Ao salvar um documento, o editor é limpo, mas a pasta do paciente permanece selecionada e a lista é recarregada para exibir o novo registro imediatamente. PSMs salvas também podem ser arquivadas pela interface; o arquivamento é lógico, usando `arquivado_em` e `arquivado_por`.


## PSM infantil — identidade visual Emoções (24/08/2026)

Na nova UI, somente a PSM infantil passou a usar a identidade visual lúdica “Emoções”: dez páginas em tons pastel, ilustração da Jaqueline e mascotes originais que representam estados emocionais. A PSM adulta e o modo legado permanecem inalterados. Os novos fundos ficam em `assets/psm/infantil-emocoes/` e a prévia aplica sobreposições HTML nas páginas cujo conteúdo infantil difere do mockup visual (abordagem TCC, endereço, regras de agendamento e valores), preservando os textos e parâmetros já existentes no sistema. A página de valores continua dinâmica e respeita os campos de sessão individual e pacote de quatro sessões. A exportação PDF da nova UI usa a mesma identidade e as mesmas sobreposições; o modo legado continua exportando os PNGs históricos.


## Agenda interna e gestão de pacientes (07/09/2026)

- Nova fase aditiva: a Agenda administra pacientes, recorrências e linhas mensais sem alterar o histórico em `sessoes`.
- Pacientes têm status ativo, pausado ou inativo; a inativação é lógica e preserva prontuários e sessões.
- Recorrências semanais/quinzenais possuem vigência. Uma mudança fecha a regra anterior sem reescrever o passado.
- Linhas planejadas ficam em `agenda_atendimentos`, separadas dos KPIs até serem efetivamente integradas ao registro operacional.
- A API reutiliza `/api/operational?resource=agenda`, preservando o limite de funções da Vercel.
- A geração é idempotente por paciente + data + horário. A sugestão usa 180 dias e não substitui regras já existentes.
- Rollback funcional: remover a aba e o recurso da API; as tabelas aditivas podem permanecer sem uso.


## Agenda — espelhamento histórico (07/09/2026)

- A agenda pode importar sessões já existentes como linhas históricas, sem modificar `sessoes` nem os KPIs atuais.
- Cada linha histórica mantém vínculo único com `sessoes.id`, o que torna a importação idempotente e impede duplicidade.
- O status é mapeado a partir de comparecimento (realizado, falta ou cancelado); registros sem data/horário válido são relatados como ignorados.
- Recorrências continuam sendo somente projeções e não são usadas para fabricar o passado.

- Na importação inicial foram espelhadas 2.415 linhas históricas. Horários textuais foram normalizados; horários ausentes ficam como `00:00` internamente e aparecem como “Não informado” na Agenda. Duplicatas do mesmo paciente/data/horário são consolidadas apenas na Agenda; `sessoes` permanece integral e é a fonte dos painéis.

- Regra de status da Agenda: a partir da data corrente no fuso `America/Sao_Paulo`, linhas históricas são `agendado`; antes dessa data, o status vem de `comparecimento` da sessão de origem.


## Agenda — liquidação operacional (07/09/2026)

- A Agenda passou a separar confirmação do atendimento, consumo de sessão, cobrança de pacote e valor recebido.
- Ao confirmar uma projeção, uma função transacional cria a sessão operacional e, quando aplicável, o pacote; só então ela passa a alimentar os KPIs existentes.
- Uma linha já ligada a uma sessão histórica fica somente para leitura, evitando recontagem ou reescrita da base legado.
- Faltas e cancelamentos não aceitam consumo, cobrança ou valor recebido.


## Agenda — edição estilo planilha (07/09/2026)

- A geração automática do mês pela recorrência continua igual; o que mudou foi a edição das linhas geradas.
- A coluna "Status" virou "Comparecimento" (Sim/Não/Cancelado/Agendado), igual ao vocabulário da planilha original.
- O consumo de sessão deixou de ser um campo manual: é derivado do comparecimento (Sim = consome 1, Não/Cancelado = 0).
- Cada campo (Comparecimento, Cobrou, Recebido) salva sozinho ao ser alterado — não existe mais botão "Confirmar". A liquidação (criação da sessão/pacote) acontece automaticamente assim que o comparecimento sai de "Agendado".


## Agenda — atendimento avulso (08/09/2026)

- As únicas linhas editáveis da Agenda eram as geradas por recorrência (`generate_month`); sem recorrência configurada, todas as linhas visíveis vinham do espelhamento histórico e ficavam travadas (somente leitura), impedindo marcar comparecimento.
- Nova ação `add_appointment`: cria uma linha avulsa (paciente + data + horário, origem `manual`) sem depender de recorrência, já nascendo destravada para marcar comparecimento.
- A UI ganhou um mini-formulário "Novo atendimento" no topo da tabela do mês.


## Agenda — gestão de pacientes e visão semanal (08/09/2026)

- Migration `20260908000000_agenda_patient_registry.sql` (precisa ser aplicada no Supabase antes destas mudanças funcionarem): cria `planos_pacote` (catálogo "Pacote Pn" por valor de sessão, criado/associado automaticamente ao salvar uma recorrência) e a função `excluir_paciente_definitivo`, que apaga um paciente e todo o histórico vinculado (sessões, pacotes, prontuários, agenda, documentos clínicos, anamneses/formulários) em uma única transação, na ordem exigida pelas foreign keys.
- Topo da Agenda ganhou um dropdown com todos os pacientes (ativos e inativos); selecionar um carrega o formulário completo para editar status, recorrência etc.
- Botão "Excluir paciente" no formulário chama a exclusão definitiva acima — irreversível, com confirmação por digitação do nome. Diferente de inativar (`status_operacional='inativo'`, reversível e preserva histórico), aqui não sobra nada.
- A tabela de atendimentos por padrão mostra só a semana atual + pendências sem registro da semana passada (checkbox para voltar à visão do mês completo).

### Observação sobre retenção de prontuários

A exclusão definitiva remove também `prontuarios`, `registros_clinicos` e `anamneses_versoes` do paciente. O Conselho Federal de Psicologia recomenda guarda de prontuários por período mínimo (a psicóloga deve confirmar o prazo aplicável ao seu caso). Esta função existe porque foi pedida explicitamente, mas vale considerar usar a inativação (reversível) como padrão e reservar a exclusão definitiva para casos excepcionais (ex.: cadastro duplicado, pedido do próprio paciente).

## Agenda — saldos, cadastro e Anamnese online (16/09/2026)

- A migration `20260916110000_patient_profile_fields.sql` acrescenta data de nascimento e responsável ao cadastro, sem alterar o identificador permanente nem o histórico clínico.
- A migration `20260916120000_patient_session_movements.sql` registra ajustes administrativos de saldo de forma auditável. Ao inativar um paciente, uma movimentação compensatória zera tanto crédito quanto débito sem apagar sessões. Transferências entre pacientes geram duas movimentações correlatas e preservam o histórico de ambas as partes.
- A tela de edição do paciente só oferece “Compartilhar sessão restante” quando o saldo derivado é positivo; o servidor calcula e valida o saldo novamente dentro da função transacional.
- A Agenda oferece um salvamento único para todas as linhas preenchidas da tabela, preservando a liquidação transacional já existente por atendimento.
- A sub-aba Anamnese agora pode criar modelo e link externo próprios. O convite continua de uso único, expira em 72 horas e a resposta permanece pendente de revisão antes de gerar uma versão da anamnese.

## Cadastro clínico único e Anamnese (17/09/2026)

- A migration aditiva `20260917090000_patient_single_profile_from_anamnesis.sql` torna o cadastro administrativo de `pacientes` a fonte única de nome completo, CPFs opcionais, nascimento, responsável, início dos atendimentos e data da Anamnese. A complementar `20260917100000_patient_profile_sync_safety.sql` foi aplicada no Supabase para tolerar datas livres vindas de formulários e uniformizar rótulos já existentes.
- A primeira Anamnese concluída — interna ou recebida pelo link seguro e aprovada — pode completar esses campos apenas uma vez, registrada por `cadastro_sincronizado_anamnese_em`. Revisões posteriores nunca sobrescrevem alterações manuais feitas na Agenda.
- O perfil da Agenda divide os dados em paciente, responsável e vínculo clínico. Adultos podem permanecer sem responsável. CPF é normalizado para 11 dígitos quando informado; a chave permanente do paciente continua sendo o UUID, não o nome.
- Documentos preenchem, de forma segura e somente nos campos existentes em cada modelo, os dados já presentes no cadastro. A data da Anamnese é somente leitura na Agenda e alimenta termos e declaração de frequência.
- Rótulos de interface usam primeiro e último nome; quando existe recorrência, incluem dia e horário. O texto é derivado e não participa de relações ou filtros de dados.

## Agenda — salvamento em lote atômico (17/09/2026)

- A migration `20260917110000_agenda_batch_settlement.sql` substitui o salvamento sequencial do botão “Salvar alterações da tabela” por uma única função transacional no banco.
- O lote valida cada linha antes de gravar. Se qualquer atendimento tiver status, cobrança, valor ou comentário inválido — ou se a liquidação de uma linha falhar — nenhuma linha do lote é persistida.
- A mensagem devolvida identifica a posição da linha com problema, sem expor dados clínicos. O salvamento individual existente permanece inalterado.

## Dashboard — tabela consolidada de atendimentos (17/09/2026)

- Lançamentos técnicos de saldo criados com `source_key` iniciada por `movimento-saldo:` (inativação e transferência de sessões) permanecem preservados para auditoria e cálculo de saldo, mas não são atendimentos clínicos.
- A tabela consolidada “Atendimentos — detalhado” e seu filtro de pacientes os excluem no frontend; sessões clínicas com comparecimento continuam aparecendo normalmente.

## Cadastro de pacientes — proteção contra sincronização legada (17/09/2026)

- O carregamento do Dashboard não pode escrever em `pacientes`: os dados de sessões históricas servem somente para relatórios e podem conter rótulos abreviados ou antigos.
- O cadastro administrativo em `pacientes` é a fonte de verdade para nome completo e demais dados do perfil. Qualquer importação legada precisa ser uma ação explícita, revisável e idempotente — nunca uma consequência de abrir ou atualizar o Dashboard.

## Cadastro é a única verdade — importação da planilha (18/09/2026)

- `lib/sheet-import.js` (job horário, `api/trends.js?job=import-sheet`, disparado por gatilho externo às :07) **não escreve em pacientes existentes**: nem nome/rótulos, nem `ativo`/status. Só cria pacientes realmente novos (inativos) e vincula linhas por `pacientes_origem`. Sobrescrever nome completo com o nome abreviado da planilha causou perda de edições do cadastro.
- `pacientes.nome` é NOT NULL: um upsert parcial (só `id`/`ativo`) falha inteiro e derruba a importação (aconteceu: 9 execuções falhas em 18/09). Se precisar atualizar um paciente, use PATCH por id, nunca upsert parcial.
- Para conferir a saúde: `select status,count(*) from importacoes where iniciado_em>now()-interval '3 hours' group by 1` (esperado: `completed`).

## Ajustes de 25/09/2026 — nomes, prontuários, documentos, posts

- **Nome curto (dois primeiros nomes):** `nome_exibicao_paciente()` (SQL), `iniciais()` (index.html) e `nomeExibicao()` (api/operational.js) passaram de "primeiro + último" para "dois primeiros nomes" ("Vitor Hugo da Costa" → "Vitor Hugo"; da/de/do/das/dos/e na 2ª posição levam o nome seguinte junto). A migration `20260925140000` reescreve `ultimo_label` preservando o sufixo " | Dia Hora" e cria o trigger `trg_pacientes_rotulo`, que refaz o rótulo sempre que `pacientes.nome` muda (ex.: primeira anamnese que completa o nome).
- **Dropdowns só com ativos:** filtro de paciente do histórico de sessões, busca da Agenda (segue o filtro "Lista de pacientes"), novo atendimento e destino de transferência.
- **Prontuários:** a biblioteca tem pílulas Ativos/Inativos (inativos = `status_operacional='inativo'` ou sem cadastro); prontuários de inativos seguem acessíveis (guarda mínima de 5 anos). Cada sessão aceita anexos (atividade utilizada): tabela `prontuario_anexos` (migration `20260925150000`), conteúdo cifrado com a mesma chave clínica, servida por `/api/data?table=prontuario_anexos` (limite ~3 MB; fotos são reduzidas no navegador).
- **Documentos:** mais espaço para assinar (margem 130px / 1300 twips antes da linha) e campo "Valor do pacote com 4 sessões" nos termos (mostra "R$ X (R$ Y por sessão)").
- **Máscaras:** CPF e telefone são formatados ao digitar e ao preencher por código (script no `<head>` de index.html e form.html).
- **Posts do feed em 3:4 (1080×1440):** a grade do perfil do Instagram corta artes quadradas. A arte é gerada em 1024×1536 e `recortar34()` apara a base (o topo, com logo/paginação, fica intacto); miniaturas no app usam `object-fit:contain`. Story continua 9:16.
- **`ativo` segue `status_operacional` (25/09/2026):** a migration `20260925160000` corrigiu cadastros com `ativo=true` e status inativo (Laura J, Lavínia) e criou o trigger `trg_pacientes_ativo_status`. No frontend, `pacienteAtivo(p)` (flag + status "ativo") filtra todos os dropdowns; rótulos da biblioteca de prontuários vêm do cadastro atual, não do `paciente_label` gravado na sessão.
