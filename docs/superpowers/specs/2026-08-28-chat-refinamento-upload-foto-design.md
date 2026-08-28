# Chat de refinamento + upload de foto de fundo — design

Data: 2026-08-28
Status: aguardando revisão do usuário

## Contexto

O app (`dashboard-psi`) tem hoje quatro lugares onde a psicóloga digita um
contexto e a IA gera conteúdo de uma vez só, sem possibilidade de pedir
ajustes: Documentos (`gerarTextoDocumento`, `lib/documents.js` ação
`generate`), Atividades (`gerarAtividade`), Apresentações (`gerarPPT`) e
Posts do Instagram (`gerarPost`, `api/post-content.js`). Esta rodada cobre
**Documentos** e **Posts** apenas; Atividades e Apresentações ficam para uma
etapa futura.

Também hoje as artes de Instagram (`gerarArtePost`, `index.html`) sempre têm
o fundo gerado por IA (`gerarImagem` → `api/gemini.js` → `gpt-image-1`), e o
Carrossel sempre tem exatamente 7 slides.

## Objetivo

1. Permitir que a psicóloga refine o texto gerado (Documentos e Posts) por
   chat, complementando — não substituindo — a edição manual já existente.
2. Permitir que ela envie uma foto própria para usar como fundo das artes
   (Story, Post e Carrossel), com duas variantes de paleta para escolher.
3. Deixar o Carrossel com número de slides variável (4 a 8), decidido pela
   IA conforme o conteúdo do tema, em vez de sempre 7.

## Fora de escopo

- Atividades e Apresentações (chat de refinamento) — próxima etapa.
- Persistir o histórico do chat (é uma conversa de trabalho; só o resultado
  final salvo no campo/post conta).
- Upload de foto para Documentos/Atividades — não fazem sentido para esses
  formatos.

## Parte 1 — Chat de refinamento

### Backend

Os dois endpoints existentes passam a aceitar um campo opcional
`historico: [{papel:'usuario'|'assistente', texto}]`.

- **Documentos** (`lib/documents.js`, ação `generate`): quando `historico`
  vier preenchido, as mensagens anteriores entram como turnos de chat antes
  da última instrução do usuário, mantendo o mesmo `instructions` de sistema
  já usado por tipo de documento (`relatorio_psicologico` /
  `solicitacao_escolar`). Sem `historico`, comportamento idêntico ao atual
  (chamada única).
- **Posts** (`api/post-content.js`): mesma ideia — quando há `historico`, o
  `system` prompt ganha uma instrução extra explicando que se trata de um
  ajuste sobre um conteúdo já gerado (não uma geração do zero), e o array de
  mensagens inclui os turnos anteriores. O retorno continua sendo o mesmo
  JSON estruturado (`titulo/gancho/slides/legenda/hashtags/cta`) — a IA
  reescreve o objeto inteiro aplicando o pedido, mantendo o que não foi
  pedido para mudar.

Nenhuma tabela nova no Supabase: o histórico não é persistido (decisão do
usuário), então não há migration.

### Frontend

Componente reutilizável `montarChatRefinamento(container, {onEnviar})`:
- Lista de bolhas (usuário/IA) — só em memória (`let` local ao fluxo atual,
  não em `_postAtual` nem salvo).
- Campo de texto + botão "Ajustar" (desabilitado enquanto aguarda resposta).
- Botão "Nova conversa" (limpa o histórico local; não desfaz o texto já
  gerado).

Aparece **abaixo** do campo/preview existente (`#doc-texto-final` em
Documentos; a prévia de post em Posts) — nunca o substitui. Ao receber
resposta, atualiza o mesmo campo/estado que a geração inicial já atualiza
hoje (`document.getElementById('doc-texto-final').value=...` /
`_postAtual={...}`), então a edição manual continua funcionando exatamente
como antes, a qualquer momento.

### Erros

Mesmo padrão de erro já usado (`toast(...)`); se a chamada falhar, o
histórico local mantém a pergunta dela para ela tentar de novo sem perder o
que digitou.

## Parte 2 — Carrossel de tamanho variável

`api/post-content.js`: a instrução "Para CARROSSEL, gere EXATAMENTE 7 itens
em slides" muda para "gere entre 4 e 8 itens em slides, o quanto o tema
realmente sustentar de conteúdo com continuidade conceitual — nunca
complete até 7 só para preencher, e nunca corte um arco pela metade".

`index.html` (`gerarPost`/`gerarArtePost`): a validação
`if(isCarousel && slides.length!==7)` muda para
`if(isCarousel && (slides.length<4 || slides.length>8))`. O restante do
fluxo (paginação `${i+1} / ${total}`, loop de geração de arte) já usa
`slides.length`/`total` dinamicamente, então não precisa de mais mudanças
além da validação.

## Parte 3 — Upload de foto de fundo

### Seletor inicial

Novo campo no formulário de Posts, junto de tema/formato/público: **"Fundo
das artes"** — `Gerado por IA` (padrão) ou `Minhas fotos`. Guardado em
`_postAtual.fonteFundo` (ou variável irmã), preenchido no momento da geração
do texto (não muda o texto em si, só fica disponível para a etapa de arte).

### Upload por formato

Ao clicar em "Gerar arte" (`gerarArtePost`), se `fonteFundo==='minhas
fotos'`:
- **Story / Post** (1 imagem): mostra 1 campo de upload antes de liberar o
  botão de gerar.
- **Carrossel** (N imagens, N = `slides.length`): mostra o segundo seletor
  pedido — **"1 foto para todas as telas"** ou **"1 foto por tela"**. No
  primeiro caso, 1 campo de upload (a mesma foto entra em todas as N
  telas); no segundo, N campos de upload, um por slide.

Fotos entram como base64 via `FileReader`, do mesmo jeito que as imagens
geradas já circulam pelo app (`imagens_b64`) — sem upload para o Supabase
Storage, sem endpoint novo de upload.

### Composição (sem chamar a IA de imagem)

Para cada slide com foto associada, `gerarArtePost` pula a chamada a
`gerarImagem`/`api/gemini.js` e chama uma nova função
`compositarFundoProprio(fotoB64, slideTexto, pageInfo)` que:

1. Desenha a foto enviada como fundo, ocupando o canvas inteiro (mesma
   lógica de canvas já usada em `aplicarLogoPost`).
2. Desenha o texto do slide em cima, em 2-4 frases curtas empilhadas, cada
   uma com uma faixa de destaque suave atrás (retângulo arredondado
   semi-opaco), replicando o padrão de referência.
3. Roda duas vezes — uma com a paleta fixa da marca (cream/oliva/terracota,
   igual ao resto do app) e outra com a cor extraída da própria foto via
   `extrairCorAcento` (função já existente, hoje usada para acento de
   post) — produzindo duas imagens finais.
4. A logo continua sendo aplicada por cima via `aplicarLogoPost`, igual a
   hoje (guard-rail de espaçamento já corrigido vale aqui também).

### Escolha da variante

A prévia (`renderArtesPost`) passa a mostrar, para cada slide com foto
própria, as duas variantes lado a lado com um clique para escolher — a
escolhida substitui a posição desse slide em `_postAtual.imagens_b64`;
slides sem foto (gerados por IA) continuam mostrando 1 resultado só, como
hoje.

### Erros

- Foto muito grande / formato inválido: validação no `<input type=file>`
  (aceitar apenas image/*, limite de tamanho razoável, ex. 10MB) com
  `toast` de erro antes de tentar compor.
- Falha ao extrair cor de acento: `extrairCorAcento` já tem fallback
  (`resolve('#9b5b46')` no `onerror`), então a variante "adaptada à foto"
  sempre produz algo, mesmo que a extração falhe.
- "1 foto por tela" com upload incompleto: slide sem foto associada cai de
  volta para geração 100% por IA (fluxo atual) nesse slide específico, sem
  bloquear os demais — um aviso discreto na prévia indica quais slides
  ficaram sem foto própria.

## Testes

- Documentos: gerar um relatório de teste, pedir 2-3 ajustes pelo chat,
  confirmar que o campo atualiza e que editar manualmente depois continua
  funcionando.
- Posts: gerar um Carrossel de teste, confirmar que o número de slides cai
  dentro de 4-8 e varia conforme a densidade do tema (testar um tema raso e
  um tema denso).
- Upload: gerar um Story com foto própria, conferir as duas variantes de
  paleta lado a lado e que a logo mantém o espaçamento correto por cima da
  foto.
- Guard-rail: confirmar que gerar arte **sem** foto própria (fluxo atual,
  100% IA) continua idêntico ao comportamento de hoje em todos os formatos.
