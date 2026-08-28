# Carrossel Variável + Upload de Foto de Fundo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o Carrossel ter entre 4 e 8 slides (em vez de sempre 7) e permitir que a psicóloga use uma foto própria como fundo das artes (Story/Post/Carrossel), com duas variantes de paleta para escolher, sem chamar a IA de imagem para os slides com foto enviada.

**Architecture:** o número de slides já passa a variar a partir do prompt de conteúdo (`api/post-content.js`, ver pré-requisito abaixo) — este plano ajusta a validação e a UI que ainda assumem 7 fixo. Para o upload, um novo seletor de "fonte do fundo" decide, por slide, se `gerarArtePost` chama `gerarImagem` (fluxo atual) ou uma nova função `compositarFundoProprio` que desenha texto sobre a foto enviada, via `<canvas>`, em duas paletas (fixa da marca / extraída da foto com `extrairCorAcento`). As duas variantes ficam disponíveis lado a lado na prévia para escolha manual.

**Tech Stack:** HTML/JS puro (sem framework), `<canvas>` 2D já usado por `aplicarLogoPost`/`extrairCorAcento`, `FileReader` para ler o upload como base64 (sem Supabase Storage, sem endpoint novo).

**Spec:** `docs/superpowers/specs/2026-08-28-chat-refinamento-upload-foto-design.md` (Partes 2 e 3)

## Pré-requisito

Este plano assume que `docs/superpowers/plans/2026-08-28-chat-refinamento.md` (Task 2) já rodou — é lá que o prompt de `api/post-content.js` passa a pedir 4-8 slides em vez de 7 fixo. Se este plano for executado sozinho, aplique primeiro aquela Task 2 (ou confirme com `grep "entre 4 e 8" api/post-content.js` que já está feita) antes de iniciar a Task 1 abaixo.

## Global Constraints

- Gerar arte **sem** foto própria (100% IA, como hoje) deve continuar idêntico em todos os formatos — nenhum slide sem foto associada passa a chamar `compositarFundoProprio`.
- Nenhum upload de arquivo vai para o Supabase Storage ou para um endpoint novo — tudo em base64, no navegador, como as imagens geradas já funcionam hoje (`imagens_b64`).
- A logo (`aplicarLogoPost`) e seu espaçamento continuam sendo aplicados por cima de qualquer fundo, gerado ou enviado.

---

## Task 1: Carrossel de tamanho variável — validação e mensagens

**Files:**
- Modify: `index.html:2448-2449` (dentro de `gerarArtePost`)
- Modify: `index.html:2440` (dentro de `renderArtesPost`)

**Interfaces:**
- Consumes: `_postAtual.slides` já vem do backend com 4 a 8 itens (pré-requisito).
- Produces: nenhuma interface nova — só corrige suposições de "sempre 7" que quebrariam com o tamanho variável das próximas tasks.

- [ ] **Step 1: Atualizar a validação em `gerarArtePost`**

Troque:

```javascript
  const slides=isCarousel?(_postAtual.slides||[]).slice(0,7):[(_postAtual.slides?.[0]||_postAtual.gancho||_postAtual.titulo||'')];
  if(isCarousel && slides.length!==7){toast('O carrossel precisa ter exatamente 7 slides. Gere o conteúdo novamente.');return;}
```

por:

```javascript
  const slides=isCarousel?(_postAtual.slides||[]).slice(0,8):[(_postAtual.slides?.[0]||_postAtual.gancho||_postAtual.titulo||'')];
  if(isCarousel && (slides.length<4 || slides.length>8)){toast('O carrossel precisa ter entre 4 e 8 slides. Gere o conteúdo novamente.');return;}
```

- [ ] **Step 2: Atualizar a mensagem de progresso em `renderArtesPost`**

Troque:

```javascript
<div class="post-art-progress">${imgs.length===7?'Carrossel completo: 7 artes geradas.':'Arte gerada: '+imgs.length}</div>
```

por:

```javascript
<div class="post-art-progress">${_postAtual.formato==='Carrossel'&&imgs.length===(_postAtual.slides||[]).length?`Carrossel completo: ${imgs.length} artes geradas.`:'Arte gerada: '+imgs.length}</div>
```

- [ ] **Step 3: Verificar manualmente**

1. Gere um Carrossel de teste sobre um tema raso (ex.: "respiração 4-7-8") e confirme que sai com menos de 8 slides (provavelmente 4-5).
2. Gere um Carrossel sobre um tema denso (ex.: "sinais de burnout no trabalho") e confirme que sai com mais slides (6-8).
3. Gere a arte de cada um e confirme que a mensagem final mostra o número real de artes, não sempre "7".

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: carrossel aceita entre 4 e 8 slides em vez de sempre 7"
```

---

## Task 2: `extrairCorAcento` — expor como utilitário reaproveitável

**Files:**
- Modify: `index.html` (função `extrairCorAcento`, linha ~2337 — já existe, sem mudança de comportamento)

**Interfaces:**
- Consumes: nada.
- Produces: confirma o contrato que a Task 5 vai consumir: `extrairCorAcento(b64) => Promise<string>` (uma cor hex, ex. `'#9b5b46'`), já usado hoje por outro trecho do código.

- [ ] **Step 1: Ler a função atual e confirmar o contrato**

Rode:

```bash
grep -n "function extrairCorAcento" -A 15 index.html
```

Confirme que a assinatura é `function extrairCorAcento(b64)` e que ela resolve com uma string hex (`'#'+rgb...`) tanto no caminho de sucesso quanto no `onerror` (`resolve('#9b5b46')`). Nenhuma mudança de código é necessária nesta task — ela existe só para o próximo executor confirmar o contrato antes de escrever a Task 5, evitando reimplementar extração de cor do zero.

- [ ] **Step 2: Commit**

Nenhum arquivo muda; pule o commit desta task (ela é só uma checagem de contrato documentada para rastreabilidade do plano).

---

## Task 3: Seletor "Fundo das artes" no formulário de Posts

**Files:**
- Modify: `index.html:889-892` (dentro de `.post-editor`, dentro do card "Criar post")

**Interfaces:**
- Consumes: nada.
- Produces: `document.getElementById('post-fundo').value` — `'ia'` (padrão) ou `'upload'`. Consumido pela Task 4/5/8.

- [ ] **Step 1: Adicionar o campo no HTML**

Depois do bloco `Contexto` (linha ~889-892), adicione:

```html
<div class="gen-field">
  <label>Fundo das artes</label>
  <select id="post-fundo" class="filter-select" style="width:100%;" onchange="atualizarUploadFundoPost()">
    <option value="ia">Gerado por IA</option>
    <option value="upload">Minhas fotos</option>
  </select>
</div>
```

- [ ] **Step 2: Adicionar um container vazio para os campos de upload**

Logo depois de `<div class="post-brand-note">...</div>` (linha ~895), adicione:

```html
<div id="post-upload-fundo" style="display:none;margin-top:10px;"></div>
```

- [ ] **Step 3: Implementar `atualizarUploadFundoPost` (esqueleto — preenchido na Task 4/5)**

Perto de `gerarPost` (antes dela, ~linha 2281), adicione:

```javascript
function atualizarUploadFundoPost(){
  const usaUpload=document.getElementById('post-fundo').value==='upload';
  const container=document.getElementById('post-upload-fundo');
  container.style.display=usaUpload?'block':'none';
  if(!usaUpload){container.innerHTML='';return;}
  montarCamposUploadFundo();
}
function montarCamposUploadFundo(){
  // Implementado na Task 4 (Story/Post) e Task 5 (Carrossel).
  container_placeholder_removido_nas_proximas_tasks();
}
```

Nota para quem executar: a função `montarCamposUploadFundo` acima é um placeholder proposital — a Task 4 a substitui por uma implementação real antes de qualquer commit chegar a rodar em produção. **Não faça commit deste Step 3 isolado** — ele existe só para deixar a Task 4 com menos código para escrever de uma vez. Continue direto para a Task 4 antes de rodar `git add`.

- [ ] **Step 4: Verificar que o seletor aparece e alterna o container**

1. Recarregue a página, abra "Criar post".
2. Confirme que o campo "Fundo das artes" aparece com as duas opções.
3. Alterne para "Minhas fotos" — confirme que `#post-upload-fundo` fica visível (mesmo vazio/quebrado, já que `montarCamposUploadFundo` ainda é um placeholder — será corrigido antes do commit, na Task 4).

(Sem commit nesta task — ver nota do Step 3.)

---

## Task 4: Upload de 1 foto — Story e Post

**Files:**
- Modify: `index.html` (substitui o placeholder `montarCamposUploadFundo` da Task 3; JS novo perto dele)

**Interfaces:**
- Consumes: `document.getElementById('post-formato').value` (já existe).
- Produces: variável `_fotosFundo` — objeto `{unica: string|null, porSlide: (string|null)[]}` guardando base64 (sem prefixo `data:...`) das fotos enviadas. Consumido pela Task 5 (Carrossel) e Task 8 (loop de geração).

- [ ] **Step 1: Substituir o placeholder por uma implementação real que cobre Story/Post**

Troque o corpo de `montarCamposUploadFundo` (criado na Task 3, Step 3) por:

```javascript
let _fotosFundo={unica:null,porSlide:[]};
function lerFotoComoB64(input,onDone){
  const arquivo=input.files?.[0];if(!arquivo)return;
  if(!arquivo.type.startsWith('image/'))return toast('Envie um arquivo de imagem.');
  if(arquivo.size>10*1024*1024)return toast('Imagem muito grande (máximo 10MB).');
  const reader=new FileReader();
  reader.onload=()=>onDone(reader.result.split(',')[1]);
  reader.readAsDataURL(arquivo);
}
function montarCamposUploadFundo(){
  const formato=(document.getElementById('post-formato').value||'').toLowerCase();
  const container=document.getElementById('post-upload-fundo');
  _fotosFundo={unica:null,porSlide:[]};
  if(formato!=='carrossel'){
    container.innerHTML=`<label class="pront-label">Foto de fundo</label><input type="file" accept="image/*" id="post-foto-unica" onchange="lerFotoComoB64(this,b=>{_fotosFundo.unica=b;toast('Foto carregada.');})"/>`;
    return;
  }
  // Carrossel: implementado na Task 5.
  montarCamposUploadCarrossel(container);
}
```

- [ ] **Step 2: Verificar manualmente (Story e Post)**

1. Recarregue a página, abra "Criar post", escolha Formato = Post, gere o conteúdo.
2. Mude "Fundo das artes" para "Minhas fotos" — confirme que aparece 1 campo de upload.
3. Selecione uma foto (jpg/png) — confirme o toast "Foto carregada." e que `_fotosFundo.unica` (via console do navegador) tem uma string base64 longa.
4. Tente selecionar um arquivo não-imagem (ex. `.txt` renomeado) — confirme o toast de erro e que `_fotosFundo.unica` continua `null`.
5. Repita com Formato = Story.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: upload de foto de fundo para Story e Post"
```

---

## Task 5: Upload de foto — Carrossel (1 para todas / 1 por tela)

**Files:**
- Modify: `index.html` (nova função `montarCamposUploadCarrossel`, chamada pela Task 4)

**Interfaces:**
- Consumes: `_fotosFundo` (Task 4), `_postAtual.slides` (já existe).
- Produces: preenche `_fotosFundo.unica` (modo "1 para todas") ou `_fotosFundo.porSlide[i]` (modo "1 por tela"), consumido pela Task 8.

- [ ] **Step 1: Implementar `montarCamposUploadCarrossel`**

Adicione, antes de `montarCamposUploadFundo` (Task 4, Step 1):

```javascript
function montarCamposUploadCarrossel(container){
  if(!_postAtual?.slides?.length){container.innerHTML='<p style="font-size:.8rem;color:var(--muted)">Gere o conteúdo do carrossel primeiro para escolher como enviar as fotos.</p>';return;}
  container.innerHTML=`<label class="pront-label">Como usar suas fotos no carrossel?</label>
    <select id="post-modo-foto-carrossel" class="filter-select" style="width:100%;margin-bottom:8px" onchange="atualizarCamposFotoCarrossel()">
      <option value="unica">1 foto para todas as telas</option>
      <option value="porSlide">1 foto por tela</option>
    </select>
    <div id="post-campos-foto-carrossel"></div>`;
  atualizarCamposFotoCarrossel();
}
function atualizarCamposFotoCarrossel(){
  const modo=document.getElementById('post-modo-foto-carrossel').value;
  const wrap=document.getElementById('post-campos-foto-carrossel');
  const n=_postAtual.slides.length;
  _fotosFundo.porSlide=new Array(n).fill(null);
  _fotosFundo.unica=null;
  if(modo==='unica'){
    wrap.innerHTML=`<input type="file" accept="image/*" onchange="lerFotoComoB64(this,b=>{_fotosFundo.unica=b;toast('Foto carregada.');})"/>`;
    return;
  }
  wrap.innerHTML=Array.from({length:n},(_,i)=>`<div style="margin-bottom:6px"><label class="pront-label">Slide ${i+1}</label><input type="file" accept="image/*" onchange="lerFotoComoB64(this,b=>{_fotosFundo.porSlide[${i}]=b;toast('Foto do slide ${i+1} carregada.');})"/></div>`).join('');
}
```

- [ ] **Step 2: Verificar manualmente**

1. Gere um Carrossel de teste (N slides, 4-8 conforme a Task 1).
2. Mude "Fundo das artes" para "Minhas fotos" — confirme que aparece o seletor "1 foto para todas" / "1 foto por tela".
3. No modo "1 foto para todas", confirme que só 1 campo de upload aparece.
4. Troque para "1 foto por tela" — confirme que aparecem exatamente N campos, um por slide, numerados.
5. Envie fotos em 2 dos N campos e deixe o resto vazio — confirme (via console) que `_fotosFundo.porSlide` tem as 2 posições preenchidas e o resto `null`.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: upload de 1 foto por slide ou foto unica para o carrossel"
```

---

## Task 6: `compositarFundoProprio` — desenhar texto sobre a foto enviada

**Files:**
- Modify: `index.html` (nova função, perto de `aplicarLogoPost`, linha ~2352)

**Interfaces:**
- Consumes: `extrairCorAcento(b64) => Promise<string>` (Task 2), `POST_BRAND` (já existe, linha ~2318).
- Produces: `compositarFundoProprio(fotoB64, textoSlide, {largura,altura}) => Promise<{marca:string, adaptada:string}>` — duas imagens base64 (PNG, sem prefixo `data:...`, mesmo formato que `gerarImagem` retorna), cada uma pronta para passar por `aplicarLogoPost` como se fosse a saída da IA. Consumido pela Task 8.

- [ ] **Step 1: Implementar a função**

Adicione logo antes de `async function aplicarLogoPost` (linha ~2352):

```javascript
function quebrarEmFrases(texto,maxFrases=4){
  return texto.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0,maxFrases);
}
async function desenharFundoComTexto(fotoB64,textoSlide,largura,altura,corTexto,corDestaque){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{
      const canvas=document.createElement('canvas');canvas.width=largura;canvas.height=altura;
      const ctx=canvas.getContext('2d');
      // Foto preenchendo o canvas inteiro (cover), sem distorcer proporção.
      const escala=Math.max(largura/img.naturalWidth,altura/img.naturalHeight);
      const w=img.naturalWidth*escala,h=img.naturalHeight*escala;
      ctx.drawImage(img,(largura-w)/2,(altura-h)/2,w,h);
      const frases=quebrarEmFrases(textoSlide);
      const tamanhoFonte=Math.round(largura*.052);
      let y=altura*.42;
      ctx.textAlign='left';ctx.textBaseline='top';ctx.font=`600 ${tamanhoFonte}px "DM Sans", sans-serif`;
      frases.forEach(frase=>{
        const largTexto=ctx.measureText(frase).width;
        const padX=tamanhoFonte*.5,padY=tamanhoFonte*.35;
        const boxX=largura*.08,boxW=Math.min(largTexto+padX*2,largura*.84);
        ctx.fillStyle=corDestaque;
        ctx.beginPath();ctx.roundRect(boxX,y,boxW,tamanhoFonte+padY*2,10);ctx.fill();
        ctx.fillStyle=corTexto;
        ctx.fillText(frase,boxX+padX,y+padY,boxW-padX*2);
        y+=tamanhoFonte+padY*2+tamanhoFonte*.3;
      });
      resolve(canvas.toDataURL('image/png').split(',')[1]);
    };
    img.onerror=reject;img.src='data:image/png;base64,'+fotoB64;
  });
}
async function compositarFundoProprio(fotoB64,textoSlide,largura,altura){
  const corAcento=await extrairCorAcento(fotoB64);
  const marca=await desenharFundoComTexto(fotoB64,textoSlide,largura,altura,'#FFFFFF',POST_BRAND.olive+'CC');
  const adaptada=await desenharFundoComTexto(fotoB64,textoSlide,largura,altura,'#FFFFFF',corAcento+'CC');
  return {marca,adaptada};
}
```

Nota: `POST_BRAND.olive+'CC'`/`corAcento+'CC'` adicionam um canal alfa hex (`CC` ≈ 80% de opacidade) para a faixa de destaque atrás do texto, replicando o efeito "highlighter" da referência — funciona porque `fillStyle` do canvas aceita hex de 8 dígitos (`#RRGGBBAA`).

- [ ] **Step 2: Verificar manualmente**

No console do navegador, com uma imagem de teste em base64 (`btoa` de um `<img>` da própria página, ou cole uma string de uma imagem pequena):

```javascript
const testeB64 = /* base64 de uma foto qualquer, sem prefixo data: */;
compositarFundoProprio(testeB64, 'Ser psicóloga é muito mais do que uma profissão.', 1024, 1024).then(r => {
  document.body.innerHTML += `<img src="data:image/png;base64,${r.marca}" style="width:300px"><img src="data:image/png;base64,${r.adaptada}" style="width:300px">`;
});
```

Confirme visualmente: as duas imagens mostram a foto de fundo preenchendo o quadro inteiro, com o texto quebrado em frases curtas, cada uma com uma faixa de destaque atrás — a primeira na cor oliva da marca, a segunda numa cor extraída da própria foto (devem ser visivelmente diferentes uma da outra se a foto tiver uma cor dominante distinta do oliva).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: compositarFundoProprio desenha texto sobre foto enviada em duas paletas"
```

---

## Task 7: Escolha de variante na prévia (`renderArtesPost`)

**Files:**
- Modify: `index.html:2438-2441` (`renderArtesPost`)

**Interfaces:**
- Consumes: `_postAtual.variantesFoto` — novo campo, objeto `{[indiceSlide]: {marca, adaptada}}` (produzido pela Task 8).
- Produces: função global `escolherVarianteFoto(indice, qual)` que troca `_postAtual.imagens_b64[indice]` pela variante escolhida e re-renderiza.

- [ ] **Step 1: Adicionar o seletor de variante no card de cada slide**

Troque a linha do `wrap.innerHTML=...` dentro de `renderArtesPost` por:

```javascript
  const imgs=_postAtual.imagens_b64,storyClass=(_postAtual.formato||'').toLowerCase()==='story'?' story':'';
  wrap.innerHTML=`<div class="post-art-grid">${imgs.map((b,i)=>{
    const variantes=_postAtual.variantesFoto?.[i];
    const seletorVariante=variantes?`<div class="post-art-variantes"><button class="btn-secondary" onclick="escolherVarianteFoto(${i},'marca')">Paleta da marca</button><button class="btn-secondary" onclick="escolherVarianteFoto(${i},'adaptada')">Paleta da foto</button></div>`:'';
    return `<div class="post-art-card${storyClass}"><img src="data:image/png;base64,${b}" alt="Slide ${i+1} do carrossel"/>${seletorVariante}<div class="post-art-caption"><span>Slide ${i+1} de ${imgs.length}</span><a class="post-art-download" download="jaqueline-post-slide-${i+1}.png" href="data:image/png;base64,${b}">Baixar</a></div></div>`;
  }).join('')}</div><div class="post-art-progress">${_postAtual.formato==='Carrossel'&&imgs.length===(_postAtual.slides||[]).length?`Carrossel completo: ${imgs.length} artes geradas.`:'Arte gerada: '+imgs.length}</div><div class="post-export-bar"><button class="btn-primary" onclick="exportarArtesPost()">📤 Exportar arte</button><span>Abre o compartilhamento do celular para escolher WhatsApp ou outro aplicativo.</span></div>`;
```

- [ ] **Step 2: Implementar `escolherVarianteFoto`**

Logo depois de `renderArtesPost` (fecha a função), adicione:

```javascript
async function escolherVarianteFoto(indice,qual){
  const variantes=_postAtual.variantesFoto?.[indice];if(!variantes)return;
  const semLogo=variantes[qual];
  const comLogo=await aplicarLogoPost(semLogo,_postAtual.formato==='Carrossel'?{current:indice+1,total:_postAtual.imagens_b64.length}:null);
  _postAtual.imagens_b64[indice]=comLogo;
  renderArtesPost();
}
```

- [ ] **Step 3: Adicionar CSS para o seletor de variantes**

Perto de `.post-art-grid`/`.post-art-card` (procure com `grep -n "post-art-grid" index.html` para achar o bloco de CSS existente), adicione:

```css
.post-art-variantes{display:flex;gap:6px;padding:6px 10px;}
.post-art-variantes button{flex:1;font-size:.72rem;padding:5px 6px;}
```

- [ ] **Step 4: Verificar manualmente**

(Depende da Task 8 estar pronta para popular `_postAtual.variantesFoto` de verdade — se a Task 8 ainda não rodou, simule manualmente no console: `_postAtual.variantesFoto={0:{marca:'<base64 de teste>',adaptada:'<outro base64>'}}` seguido de `renderArtesPost()`.)

1. Confirme que o slide com `variantesFoto` mostra os dois botões "Paleta da marca" / "Paleta da foto" e os demais slides não mostram nada.
2. Clique em cada botão e confirme que a imagem do card troca.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: seletor de variante de paleta na previa das artes com foto propria"
```

---

## Task 8: Ligar tudo em `gerarArtePost`

**Files:**
- Modify: `index.html:2464-2491` (loop principal de `gerarArtePost`)

**Interfaces:**
- Consumes: `_fotosFundo` (Task 4/5), `compositarFundoProprio` (Task 6), `_postAtual.variantesFoto` (Task 7).
- Produces: comportamento final da feature — nenhuma interface nova.

- [ ] **Step 1: Ajustar as dimensões usadas por `compositarFundoProprio` para bater com `imgSize`**

Antes do loop `for(let i=0;i<slides.length;i++){`, adicione (logo depois da linha que define `const identidade=...`):

```javascript
    const [largura,altura]=imgSize.split('x').map(Number);
    const fonteFundo=document.getElementById('post-fundo')?.value||'ia';
    _postAtual.variantesFoto={};
```

- [ ] **Step 2: Desviar para `compositarFundoProprio` quando há foto para o slide**

Dentro do loop, troque:

```javascript
      const raw=await gerarImagem(prompt,imgSize);
      const finalB64=await aplicarLogoPost(raw,isCarousel?{current:i+1,total}:null);
      _postAtual.imagens_b64.push(finalB64);
```

por:

```javascript
      const fotoDoSlide=fonteFundo==='upload'?(_fotosFundo.porSlide?.[i]||_fotosFundo.unica):null;
      let finalB64;
      if(fotoDoSlide){
        const {marca,adaptada}=await compositarFundoProprio(fotoDoSlide,slides[i],largura,altura);
        finalB64=await aplicarLogoPost(marca,isCarousel?{current:i+1,total}:null);
        _postAtual.variantesFoto[i]={marca,adaptada};
      }else{
        const raw=await gerarImagem(prompt,imgSize);
        finalB64=await aplicarLogoPost(raw,isCarousel?{current:i+1,total}:null);
      }
      _postAtual.imagens_b64.push(finalB64);
```

Note que quando há foto, `gerarImagem` (e portanto a chamada à IA de imagem) simplesmente não é chamada para aquele slide — cumprindo o guard-rail de custo/velocidade da spec.

- [ ] **Step 3: Verificar manualmente — fluxo completo com foto**

1. Gere um Post de teste, mude "Fundo das artes" para "Minhas fotos", envie 1 foto.
2. Clique "Gerar arte" — confirme (pela Network do navegador) que **nenhuma** chamada a `/api/gemini` acontece, e que a arte final aparece com a foto de fundo + texto + logo por cima.
3. Confirme que os dois botões de variante aparecem e que trocar entre eles troca a imagem mantendo a logo.
4. Repita para Carrossel no modo "1 foto para todas" e no modo "1 foto por tela".

- [ ] **Step 4: Verificar manualmente — guard-rail do fluxo 100% IA**

1. Deixe "Fundo das artes" em "Gerado por IA" (padrão) e gere um Post, um Story e um Carrossel.
2. Confirme que o comportamento é idêntico ao que já existia antes deste plano (chamada a `/api/gemini` acontece normalmente, sem seletor de variantes aparecendo).

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: gerarArtePost usa foto propria quando fonte de fundo = upload"
```

---

## Self-Review Notes

- **Cobertura da spec:** Parte 2 (carrossel variável) → Task 1. Parte 3 (upload + duas variantes) → Tasks 2-8. O item "sem chamar a IA de imagem para slides com foto" está explicitamente verificado no Step 3 da Task 8 (checagem de rede).
- **Fallback de slide sem foto no modo "1 por tela":** coberto na Task 8, Step 2 — `_fotosFundo.porSlide?.[i]||_fotosFundo.unica` cai para `_fotosFundo.unica` (que é `null` nesse modo) e, sendo falsy, `fotoDoSlide` fica `null`/`undefined`, então o `else` (geração por IA) roda normalmente para aquele slide — exatamente o comportamento descrito na spec ("Erros" da Parte 3).
- **Tipos consistentes:** `compositarFundoProprio` (Task 6) retorna `{marca,adaptada}`; `_postAtual.variantesFoto[i]` (Task 7 e 8) usa as mesmas duas chaves; `escolherVarianteFoto` (Task 7) usa `qual` para indexar nelas — mesmo vocabulário em todo o plano.
- **Sem placeholders remanescentes:** o placeholder da Task 3 (`montarCamposUploadFundo`/`container_placeholder_removido_nas_proximas_tasks`) é explicitamente substituído antes de qualquer commit, com uma nota clara para quem executar não parar ali.
