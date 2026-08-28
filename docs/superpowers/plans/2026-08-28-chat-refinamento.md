# Chat de Refinamento (Documentos + Posts) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar a psicóloga pedir ajustes, em formato de chat, sobre o texto que a IA já gerou em Documentos e em Posts — sem tirar a edição manual que já existe hoje.

**Architecture:** os dois endpoints existentes (`lib/documents.js` ação `generate`, `api/post-content.js`) passam a aceitar um campo opcional `historico` (array de turnos `{papel,texto}`). Sem `historico`, o comportamento é idêntico ao de hoje. Com `historico`, a chamada à IA inclui os turnos anteriores antes do novo pedido, e a resposta sobrescreve o mesmo campo/estado que a geração inicial já sobrescreve. O histórico vive só em memória no navegador (variável JS local à sessão de geração atual) — nada novo é salvo no Supabase.

**Tech Stack:** Node.js (Vercel serverless functions), `node:test` para os testes de backend, HTML/JS puro no front-end (sem framework), OpenAI Responses API (Documentos) e Chat Completions API (Posts) — ambas já em uso.

**Spec:** `docs/superpowers/specs/2026-08-28-chat-refinamento-upload-foto-design.md` (Parte 1)

## Global Constraints

- Sem `historico` enviado, o comportamento de `generate` (Documentos) e de `/api/post-content` (Posts) deve continuar byte-a-byte idêntico ao atual — nenhum teste existente pode quebrar.
- Nenhuma tabela nova no Supabase; o histórico do chat nunca é persistido.
- O painel de chat aparece **abaixo** do campo/preview já existente e nunca desabilita a edição manual desse campo.

---

## Task 1: Backend — `historico` em Documentos (`generate`)

**Files:**
- Modify: `lib/documents.js:620-635` (bloco `if(req.method==='POST'&&req.body?.action==='generate')`)
- Test: `tests/documents-chat.test.js` (novo)

**Interfaces:**
- Consumes: nada de tarefas anteriores.
- Produces: `handleDocuments` aceita `req.body.historico` opcional — array de `{papel:'usuario'|'assistente', texto:string}`. Usado pela Task 3 (frontend).

- [ ] **Step 1: Escrever o teste que falha**

Crie `tests/documents-chat.test.js`:

```javascript
import assert from 'node:assert/strict';
import test from 'node:test';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.CLINICAL_DATA_KEY = Buffer.alloc(32,7).toString('base64');
process.env.OPENAI_KEY = 'test-openai-key';

const {handleDocuments} = await import('../lib/documents.js');

function response() {
  return {
    code: 200,
    body: undefined,
    status(code) { this.code = code; return this; },
    setHeader() {},
    json(body) { this.body = body; return this; },
  };
}

function openaiResponsesReply(text) {
  return {ok: true, status: 200, json: async () => ({output: [{content: [{type: 'output_text', text}]}]})};
}

test('generate sem historico manda "input" como string simples (comportamento atual preservado)', async () => {
  let capturedBody;
  global.fetch = async (url, options) => { capturedBody = JSON.parse(options.body); return openaiResponsesReply('Texto gerado.'); };
  const res = response();
  await handleDocuments({method: 'POST', body: {action: 'generate', tipo: 'solicitacao_escolar', descricao: 'A criança tem dificuldade de concentração em sala.'}}, res, {id: 'admin-1'});
  assert.equal(res.code, 200);
  assert.equal(res.body.texto, 'Texto gerado.');
  assert.equal(typeof capturedBody.input, 'string');
  assert.equal(capturedBody.input, 'A criança tem dificuldade de concentração em sala.');
});

test('generate com historico manda "input" como array de turnos + o novo pedido', async () => {
  let capturedBody;
  global.fetch = async (url, options) => { capturedBody = JSON.parse(options.body); return openaiResponsesReply('Texto ajustado, mais curto.'); };
  const res = response();
  const historico = [
    {papel: 'usuario', texto: 'A criança tem dificuldade de concentração em sala.'},
    {papel: 'assistente', texto: 'Texto gerado.'},
  ];
  await handleDocuments({method: 'POST', body: {action: 'generate', tipo: 'solicitacao_escolar', descricao: 'Deixa mais curto', historico}}, res, {id: 'admin-1'});
  assert.equal(res.code, 200);
  assert.equal(res.body.texto, 'Texto ajustado, mais curto.');
  assert.ok(Array.isArray(capturedBody.input));
  assert.deepEqual(capturedBody.input, [
    {role: 'user', content: 'A criança tem dificuldade de concentração em sala.'},
    {role: 'assistant', content: 'Texto gerado.'},
    {role: 'user', content: 'Deixa mais curto'},
  ]);
});

test('generate valida historico malformado', async () => {
  global.fetch = async () => { throw new Error('não deveria chamar a OpenAI'); };
  const res = response();
  await handleDocuments({method: 'POST', body: {action: 'generate', tipo: 'solicitacao_escolar', descricao: 'Deixa mais curto', historico: 'não é array'}}, res, {id: 'admin-1'});
  assert.equal(res.code, 400);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test tests/documents-chat.test.js`
Expected: FAIL (o código atual sempre manda `input` como a string de `descricao`, nunca como array; não há validação de `historico`).

- [ ] **Step 3: Implementar**

Em `lib/documents.js`, substitua o bloco do `generate` (linhas 620-635) por:

```javascript
    if(req.method==='POST'&&req.body?.action==='generate'){
      const tipo=clean(req.body.tipo),descricao=clean(req.body.descricao);if(!TYPES.has(tipo)||descricao.length<10||descricao.length>12000)return res.status(400).json({error:'Descreva melhor o conteúdo desejado'});
      const historicoBruto=req.body.historico;
      if(historicoBruto!==undefined&&!Array.isArray(historicoBruto))return res.status(400).json({error:'Histórico inválido'});
      const historico=(historicoBruto||[]).map(h=>({papel:h?.papel==='assistente'?'assistente':'usuario',texto:clean(h?.texto)})).filter(h=>h.texto);
      const key=process.env.OPENAI_KEY;if(!key)return res.status(500).json({error:'Assistente de texto não configurado'});
      const instructions=tipo==='relatorio_psicologico'
        ? 'Redija um relatório psicológico profissional em português do Brasil, organizado em Descrição, Análise, Conclusão e Orientações. Não invente diagnósticos, fatos ou dados. Use somente o relato fornecido. Transforme falas coloquiais, ofensivas ou citadas entre aspas em discurso indireto, técnico, respeitoso e adequado ao documento. Não reproduza insultos, palavrões ou falas literais entre aspas; descreva objetivamente o conteúdo e o contexto informado.'
        : 'Redija uma solicitação formal de relatório escolar em português do Brasil. Explique o objetivo do acompanhamento e os aspectos que a escola deve descrever. Não invente fatos ou dados.';
      const input=historico.length
        ? [...historico.map(h=>({role:h.papel==='assistente'?'assistant':'user',content:h.texto})),{role:'user',content:descricao}]
        : descricao;
      const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-5-mini',instructions,input,max_output_tokens:3000,reasoning:{effort:'low'}})});
      const data=await json(r);if(!r.ok){console.error('openai generate error:',r.status,data);return res.status(r.status).json({error:'Não foi possível elaborar o texto agora'});}
      const text=clean((data.output||[]).flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text);
      if(!text){console.error('openai generate: empty output',JSON.stringify(data).slice(0,2000));return res.status(502).json({error:'A IA não retornou texto. Tente novamente.'});}
      return res.status(200).json({texto:text});
    }
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test tests/documents-chat.test.js`
Expected: PASS (3 testes)

- [ ] **Step 5: Rodar a suíte inteira para garantir que nada quebrou**

Run: `node --test`
Expected: todos os testes existentes continuam passando (em especial `tests/auth.test.js`, que também exercita `handleDocuments`).

- [ ] **Step 6: Commit**

```bash
git add lib/documents.js tests/documents-chat.test.js
git commit -m "feat: aceita historico de chat na geracao de texto de documentos"
```

---

## Task 2: Backend — `historico` em Posts (`api/post-content.js`)

**Files:**
- Modify: `api/post-content.js` (arquivo inteiro — hoje 42 linhas)
- Test: `tests/post-content-chat.test.js` (novo)

**Interfaces:**
- Consumes: nada de tarefas anteriores.
- Produces: `POST /api/post-content` aceita `historico` opcional no mesmo formato `{papel,texto}[]` da Task 1. Usado pela Task 4 (frontend).

- [ ] **Step 1: Escrever o teste que falha**

Crie `tests/post-content-chat.test.js`:

```javascript
import assert from 'node:assert/strict';
import test from 'node:test';

process.env.OPENAI_KEY = 'test-openai-key';
const {default: postContent} = await import('../api/post-content.js');

function response() {
  return {
    code: 200,
    body: undefined,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function chatReply(obj) {
  return {ok: true, status: 200, json: async () => ({choices: [{message: {content: JSON.stringify(obj)}}]})};
}

test('sem historico, messages tem só system+user (comportamento atual)', async () => {
  let capturedBody;
  global.fetch = async (url, options) => { capturedBody = JSON.parse(options.body); return chatReply({titulo: 'x', gancho: 'x', slides: ['x'], legenda: 'x', hashtags: [], cta: 'x'}); };
  const res = response();
  await postContent({method: 'POST', body: {tema: 'Ansiedade'}}, res);
  assert.equal(res.code, 200);
  assert.equal(capturedBody.messages.length, 2);
  assert.equal(capturedBody.messages[0].role, 'system');
  assert.equal(capturedBody.messages[1].role, 'user');
});

test('com historico, messages inclui os turnos anteriores antes do novo pedido', async () => {
  let capturedBody;
  global.fetch = async (url, options) => { capturedBody = JSON.parse(options.body); return chatReply({titulo: 'x', gancho: 'x', slides: ['x'], legenda: 'x', hashtags: [], cta: 'x'}); };
  const res = response();
  const historico = [
    {papel: 'usuario', texto: 'Tema: Ansiedade\nFormato: Post'},
    {papel: 'assistente', texto: '{"titulo":"Ansiedade"}'},
  ];
  await postContent({method: 'POST', body: {tema: 'Ansiedade', formato: 'Post', historico, ajuste: 'Deixa o título mais curto'}}, res);
  assert.equal(res.code, 200);
  assert.equal(capturedBody.messages.length, 4);
  assert.equal(capturedBody.messages[0].role, 'system');
  assert.equal(capturedBody.messages[1].content, 'Tema: Ansiedade\nFormato: Post');
  assert.equal(capturedBody.messages[2].role, 'assistant');
  assert.equal(capturedBody.messages[3].content, 'Deixa o título mais curto');
});

test('historico malformado retorna 400', async () => {
  global.fetch = async () => { throw new Error('não deveria chamar a OpenAI'); };
  const res = response();
  await postContent({method: 'POST', body: {tema: 'Ansiedade', historico: 'não é array'}}, res);
  assert.equal(res.code, 400);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test tests/post-content-chat.test.js`
Expected: FAIL (`historico`/`ajuste` são ignorados hoje; sempre 2 mensagens).

- [ ] **Step 3: Implementar**

Substitua o conteúdo de `api/post-content.js` por:

```javascript
// Gera conteúdo educativo para posts. A publicação no Instagram não é feita.
import { requireAuth } from './_auth.js';

export default async function handler(req,res){
  if (!await requireAuth(req, res)) return;
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  const apiKey=process.env.OPENAI_KEY;
  if(!apiKey) return res.status(500).json({error:'OPENAI_KEY não configurada no Vercel'});
  const {tema,formato,publico,contexto,faixa,historico:historicoBruto,ajuste}=req.body||{};
  if(!tema) return res.status(400).json({error:'Tema obrigatório'});
  if(historicoBruto!==undefined&&!Array.isArray(historicoBruto))return res.status(400).json({error:'Histórico inválido'});
  const historico=(historicoBruto||[]).map(h=>({papel:h?.papel==='assistente'?'assistente':'usuario',texto:String(h?.texto||'').trim()})).filter(h=>h.texto);
  const system=`Você cria conteúdo para o Instagram de uma psicóloga brasileira que atende todo o ciclo vital: crianças, adolescentes, adultos e idosos.
Regras gerais: informar e gerar identificação sem diagnóstico individual, prescrição, promessa de resultado, alarmismo ou exposição de pacientes. Linguagem profissional, acolhedora e acessível. Não invente estudos, números ou citações. Quando o tema vier de uma notícia, trate-a como contexto, não como prova clínica.

O FORMATO muda completamente COMO o conteúdo deve ser escrito — não é só uma questão de tamanho, é o tom e a função de cada peça que mudam:

CARROSSEL (feed, várias imagens deslizáveis, fica salvo no perfil): conteúdo educativo com um arco narrativo do slide 1 (gancho/capa) ao slide final (fechamento/CTA), como um mini-artigo fatiado em partes com continuidade conceitual entre si. Legenda mais longa e com valor agregado, hashtags de descoberta (tema, público, nicho).

POST (feed, imagem única, fica salvo no perfil): UMA única mensagem editorial, mais atemporal e reflexiva — como uma afirmação ou citação forte que resume um conceito, pensada para ser bonita, compartilhável e ainda fazer sentido daqui a meses. Legenda de apoio com profundidade, hashtags de descoberta.

STORY (some em 24h, tela cheia vertical, consumida em poucos segundos por toque): NÃO é uma dica educativa para o seguidor — é um relato PESSOAL, em primeira pessoa, como se a própria psicóloga estivesse compartilhando um pensamento, sentimento ou bastidor genuíno do seu dia/trabalho naquele instante (ex.: "Ser psicóloga é muito mais do que uma profissão. É sobre escuta, acolhimento, conexão e transformação." / "Hoje percebi como cada sessão me ensina algo novo sobre paciência."). Fala NA VOZ DELA sobre o tema, não SOBRE o tema em terceira pessoa nem dando conselho direto ao seguidor. Tom caloroso, reflexivo, humano — nunca uma citação genérica de painel motivacional nem uma dica clínica. A frase principal deve ter começo, meio e fim (aproximadamente 15 a 25 palavras). A legenda de apoio complementa com 1 a 2 frases curtas no mesmo tom pessoal — pode incluir um agradecimento, uma reflexão sobre a profissão ou um convite caloroso, nunca uma explicação técnica. Hashtags não fazem sentido em Stories (não são pesquisáveis nesse formato). O CTA deve ser uma ação típica de Story ("manda uma mensagem", "responde na enquete", "arrasta pra cima"), nunca "salve o post" ou "compartilhe no feed".

Se a mensagem do usuário pedir um AJUSTE sobre um conteúdo já gerado (você verá o conteúdo anterior no histórico da conversa), reescreva o objeto JSON inteiro aplicando o que foi pedido e mantendo tudo o que não foi pedido para mudar.

Retorne APENAS JSON válido:
{
  "titulo":"...",
  "gancho":"...",
  "slides":["..."],
  "legenda":"...",
  "hashtags":["#..."],
  "cta":"..."
}
Para CARROSSEL, gere entre 4 e 8 itens em "slides" (um por imagem) — o quanto o tema realmente sustentar de conteúdo com continuidade conceitual; nunca complete até um número maior só para preencher, e nunca corte um arco pela metade. Para POST, "slides" tem exatamente 1 item: a mensagem central da imagem. Para STORY, "slides" tem exatamente 1 item: a frase principal da tela, completa e com profundidade (aproximadamente 15 a 25 palavras, nunca um fragmento genérico); "legenda" traz um complemento curto de apoio (1 a 2 frases); "hashtags" deve ser uma lista vazia.`;
  const primeiroPedido=`Tema: ${tema}\nFaixa do ciclo vital: ${faixa||'Ciclo vital'}\nFormato: ${formato||'Carrossel'}\nPúblico: ${publico||'público geral'}\nContexto/tendência: ${contexto||'nenhum'}`;
  const messages=[{role:'system',content:system}];
  if(historico.length){
    for(const h of historico)messages.push({role:h.papel==='assistente'?'assistant':'user',content:h.texto});
    messages.push({role:'user',content:String(ajuste||'').trim()||primeiroPedido});
  }else{
    messages.push({role:'user',content:primeiroPedido});
  }
  try{
    const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_TEXT_MODEL||'gpt-4.1-mini',temperature:.65,messages,response_format:{type:'json_object'}})});
    const data=await r.json();
    if(!r.ok) return res.status(r.status).json({error:data?.error?.message||'Erro ao gerar post'});
    const content=data.choices?.[0]?.message?.content;
    if(!content) return res.status(500).json({error:'Nenhum conteúdo retornado'});
    return res.status(200).json(JSON.parse(content));
  }catch(e){return res.status(500).json({error:e.message});}
}
```

Nota: este passo também já aplica a Parte 2 da spec (4-8 slides em vez de 7 fixo) porque o texto do prompt é o mesmo arquivo — evita editar este bloco duas vezes em dois planos diferentes.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test tests/post-content-chat.test.js`
Expected: PASS (3 testes)

- [ ] **Step 5: Rodar a suíte inteira**

Run: `node --test`
Expected: todos os testes passam.

- [ ] **Step 6: Commit**

```bash
git add api/post-content.js tests/post-content-chat.test.js
git commit -m "feat: aceita historico de chat e ajuste na geracao de posts; carrossel 4-8 slides"
```

---

## Task 3: Frontend — painel de chat em Documentos

**Files:**
- Modify: `index.html` (CSS perto de `.pront-field`/`.prompt-area`; HTML em torno da linha 3201-3202, onde ficam `areaDoc('doc-descricao-ia', ...)` e o botão "Elaborar texto com IA"; JS perto de `gerarTextoDocumento`, linha ~3244)

**Interfaces:**
- Consumes: `POST /api/forms` com `{resource:'documents',action:'generate',tipo,descricao,historico}` (Task 1).
- Produces: nenhuma interface nova para outras tasks — este é o consumidor final da Task 1 para Documentos.

- [ ] **Step 1: Adicionar CSS do painel de chat**

Logo após a regra `.prompt-area:focus{...}` (linha 177), adicione:

```css
.chat-refinamento{margin-top:10px;border:1px solid var(--border);border-radius:8px;padding:10px;background:#fff;}
.chat-refinamento .chat-msgs{display:flex;flex-direction:column;gap:6px;max-height:180px;overflow-y:auto;margin-bottom:8px;}
.chat-refinamento .chat-msg{padding:6px 10px;border-radius:7px;font-size:.82rem;line-height:1.4;max-width:88%;}
.chat-refinamento .chat-msg.usuario{align-self:flex-end;background:var(--accent);color:#fff;}
.chat-refinamento .chat-msg.assistente{align-self:flex-start;background:var(--light);}
.chat-refinamento .chat-row{display:flex;gap:8px;}
.chat-refinamento .chat-row input{flex:1;border:1px solid var(--border);border-radius:7px;padding:7px 10px;font:inherit;}
.chat-refinamento .chat-row button{white-space:nowrap;}
.chat-refinamento .chat-reset{margin-top:6px;background:none;border:none;color:var(--muted);font-size:.75rem;cursor:pointer;text-decoration:underline;padding:0;}
```

- [ ] **Step 2: Inserir o painel no HTML, logo após o textarea de texto final**

No trecho que monta o formulário de `relatorio_psicologico`/`solicitacao_escolar` (linhas 3201-3202), depois de `areaDoc('doc-texto-final','Texto do relatório')` (e da versão "Texto da solicitação"), adicione o container do chat. Ambas as linhas ganham o mesmo sufixo:

```javascript
+`<div class="chat-refinamento full" id="doc-chat" style="display:none"><div class="chat-msgs" id="doc-chat-msgs"></div><div class="chat-row"><input id="doc-chat-input" placeholder="Ex.: deixa mais formal, resuma em um parágrafo..." onkeydown="if(event.key==='Enter')ajustarTextoDocumento()"/><button class="btn-secondary" onclick="ajustarTextoDocumento()">Ajustar</button></div><button class="chat-reset" onclick="reiniciarChatDocumento()">Nova conversa</button></div>`
```

(cole essa string concatenada ao final de cada uma das duas linhas 3201 e 3202, do mesmo jeito que `areaDoc(...)` já é concatenado com `+`).

- [ ] **Step 3: Implementar o estado e as funções do chat**

Logo depois de `gerarTextoDocumento` (após a linha que fecha a função, ~3248), adicione:

```javascript
let _docChatHistorico=[];
function mostrarChatDocumento(){
  document.getElementById('doc-chat').style.display='block';
  renderChatDocumento();
}
function renderChatDocumento(){
  const wrap=document.getElementById('doc-chat-msgs');if(!wrap)return;
  wrap.innerHTML=_docChatHistorico.map(h=>`<div class="chat-msg ${h.papel}">${escHtml(h.texto)}</div>`).join('');
  wrap.scrollTop=wrap.scrollHeight;
}
function reiniciarChatDocumento(){_docChatHistorico=[];renderChatDocumento();}
async function ajustarTextoDocumento(){
  const input=document.getElementById('doc-chat-input'),pedido=input.value.trim();if(!pedido)return;
  const tipo=document.getElementById('doc-tipo').value,descricaoOriginal=campo('doc-descricao-ia');
  if(!_docChatHistorico.length)_docChatHistorico.push({papel:'usuario',texto:descricaoOriginal},{papel:'assistente',texto:campo('doc-texto-final')});
  input.disabled=true;
  try{
    const r=await fetch('/api/forms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({resource:'documents',action:'generate',tipo,descricao:pedido,historico:_docChatHistorico})}),d=await r.json();
    if(!r.ok)throw new Error(d.error);
    _docChatHistorico.push({papel:'usuario',texto:pedido},{papel:'assistente',texto:d.texto});
    document.getElementById('doc-texto-final').value=d.texto;
    atualizarPreviaDocumento();
    input.value='';
    renderChatDocumento();
  }catch(e){toast(e.message||'Não foi possível ajustar o texto.');}
  finally{input.disabled=false;}
}
```

- [ ] **Step 4: Chamar `mostrarChatDocumento()` ao final de uma geração bem-sucedida**

Em `gerarTextoDocumento` (linha 3247), depois de `document.getElementById('doc-texto-final').value=d.texto;`, adicione `mostrarChatDocumento();` e `reiniciarChatDocumento();` (nessa ordem, para garantir que o painel apareça vazio a cada nova geração do zero).

- [ ] **Step 5: Verificar manualmente**

Não há teste automatizado de DOM neste projeto (ver `tests/`, só há testes de backend). Verificação manual:
1. Rode o app localmente (dev server já configurado no projeto).
2. Abra Documentos → escolha um tipo → preencha a descrição → clique "Elaborar texto com IA".
3. Confirme que o painel de chat aparece abaixo do texto, vazio.
4. Digite "deixa mais curto" e clique Ajustar; confirme que o texto do campo muda e que a bolha do pedido + da resposta aparecem no chat.
5. Edite o texto manualmente no campo — confirme que a edição funciona normalmente (o chat não interfere).
6. Clique "Nova conversa" — confirme que as bolhas somem mas o texto do campo permanece.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: painel de chat para ajustar texto de documentos gerado por IA"
```

---

## Task 4: Frontend — painel de chat em Posts

**Files:**
- Modify: `index.html` (HTML em `#post-preview-card`, linha ~902-924; JS perto de `gerarPost`/`renderPostPreview`, linha ~2281-2316)

**Interfaces:**
- Consumes: `POST /api/post-content` com `{tema,formato,publico,contexto,faixa,historico,ajuste}` (Task 2).
- Produces: nenhuma interface nova para outras tasks.

- [ ] **Step 1: Inserir o painel no HTML**

Em `#post-preview-card` (linha ~902-924), logo antes de `<div class="preview-actions">`, adicione:

```html
<div class="chat-refinamento" id="post-chat" style="display:none"><div class="chat-msgs" id="post-chat-msgs"></div><div class="chat-row"><input id="post-chat-input" placeholder="Ex.: deixa o gancho mais curto, troca o CTA..." onkeydown="if(event.key==='Enter')ajustarPost()"/><button class="btn-secondary" onclick="ajustarPost()">Ajustar</button></div><button class="chat-reset" onclick="reiniciarChatPost()">Nova conversa</button></div>
```

(reaproveita o CSS `.chat-refinamento` já criado na Task 3, Step 1 — se a Task 3 ainda não rodou neste checkout, repita aquele bloco de CSS aqui também antes de prosseguir.)

- [ ] **Step 2: Implementar o estado e as funções do chat**

Logo depois de `renderPostPreview` (após a linha que fecha a função, ~2316), adicione:

```javascript
let _postChatHistorico=[];
function mostrarChatPost(){document.getElementById('post-chat').style.display='block';renderChatPost();}
function renderChatPost(){
  const wrap=document.getElementById('post-chat-msgs');if(!wrap)return;
  wrap.innerHTML=_postChatHistorico.map(h=>`<div class="chat-msg ${h.papel}">${escHtml(h.texto)}</div>`).join('');
  wrap.scrollTop=wrap.scrollHeight;
}
function reiniciarChatPost(){_postChatHistorico=[];renderChatPost();}
async function ajustarPost(){
  if(!_postAtual)return;
  const input=document.getElementById('post-chat-input'),pedido=input.value.trim();if(!pedido)return;
  if(!_postChatHistorico.length){
    const primeiroPedido=`Tema: ${_postAtual.tema}\nFaixa do ciclo vital: ${_postAtual.faixa||'Ciclo vital'}\nFormato: ${_postAtual.formato}\nPúblico: ${_postAtual.publico}\nContexto/tendência: nenhum`;
    _postChatHistorico.push({papel:'usuario',texto:primeiroPedido},{papel:'assistente',texto:JSON.stringify({titulo:_postAtual.titulo,gancho:_postAtual.gancho,slides:_postAtual.slides,legenda:_postAtual.legenda,hashtags:_postAtual.hashtags,cta:_postAtual.cta})});
  }
  input.disabled=true;
  try{
    const r=await fetch('/api/post-content',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tema:_postAtual.tema,formato:_postAtual.formato,publico:_postAtual.publico,faixa:_postAtual.faixa,historico:_postChatHistorico,ajuste:pedido})}),d=await r.json();
    if(!r.ok)throw new Error(d.error);
    _postChatHistorico.push({papel:'usuario',texto:pedido},{papel:'assistente',texto:JSON.stringify(d)});
    _postAtual={..._postAtual,...d};
    renderPostPreview();
    input.value='';
    renderChatPost();
  }catch(e){toast(e.message||'Não foi possível ajustar o post.');}
  finally{input.disabled=false;}
}
```

- [ ] **Step 3: Chamar `mostrarChatPost()`/`reiniciarChatPost()` ao final de `gerarPost`**

Em `gerarPost` (linha ~2301), logo depois de `renderPostPreview();`, adicione `reiniciarChatPost();mostrarChatPost();`.

- [ ] **Step 4: Verificar manualmente**

1. Gere um post de teste (Post ou Carrossel).
2. Confirme que o painel de chat aparece abaixo da prévia, vazio.
3. Peça um ajuste ("deixa a legenda mais curta") — confirme que a prévia (título/slides/legenda/hashtags/cta) atualiza e as bolhas aparecem.
4. Gere a arte (`gerarArtePost`) depois do ajuste — confirme que usa o conteúdo já ajustado (`_postAtual` atualizado).
5. Gere um post novo do zero — confirme que o chat reinicia vazio.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: painel de chat para ajustar conteudo de posts gerado por IA"
```

---

## Self-Review Notes

- **Cobertura da spec (Parte 1):** Task 1 e 3 cobrem Documentos; Task 2 e 4 cobrem Posts. O comportamento "sem historico = idêntico a hoje" é testado explicitamente nas Tasks 1 e 2. A Parte 2 da spec (carrossel 4-8 slides) é coberta de brinde na Task 2, Step 3, já que está no mesmo arquivo/prompt — ver nota nessa task; **o plano de Upload de Foto (Parte 3) não deve reverter esse prompt**, só estendê-lo com a lógica de foto própria.
- **Sem histórico persistido:** confirmado — `_docChatHistorico`/`_postChatHistorico` são variáveis JS locais, nunca enviadas para `salvarDocumento`/`salvarPost`.
- **Tipos consistentes:** `historico` é sempre `{papel:'usuario'|'assistente', texto}` nos dois endpoints e nos dois painéis de chat — mesmo formato em toda a feature.
