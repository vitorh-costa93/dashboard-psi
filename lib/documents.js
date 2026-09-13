import {readFileSync} from 'node:fs';
import sharp from 'sharp';
import {PDFDocument, StandardFonts, rgb} from 'pdf-lib';
import {Document,Packer,Paragraph,TextRun,ImageRun,HeadingLevel,AlignmentType,Footer,Table,TableRow,TableCell,WidthType,VerticalAlign,BorderStyle} from 'docx';
import {extrairTextoAnexo, AnexoError} from './anexo.js';
import {supabase} from '../api/_auth.js';
import {decryptClinicalData,encryptClinicalData} from '../api/_clinical-crypto.js';
import {fetchComRetentativa} from '../api/_openai-retry.js';
import {PERFIL_JAQUELINE} from './perfil-jaqueline.js';

const TYPES=new Set(['termo_infantil','termo_adulto','orcamento','recibo','relatorio_psicologico','encaminhamento','solicitacao_escolar','declaracao_comparecimento','declaracao_frequencia']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json=async r=>r.json().catch(()=>null);
// AI-generated text sometimes contains a soft hyphen (U+00AD -- a hyphenation
// hint that's supposed to be invisible except at a line break) or one of a
// handful of unicode dash lookalikes instead of a plain "-". DM Sans (and its
// fallbacks) don't have a glyph for those, so Chromium renders a visible
// tofu box right in the middle of words like "recomenda-se" -- exactly the
// "special character" artifact reported in exported PDFs. These represent an
// intended hyphen, so they're normalized to a real "-", not deleted (deleting
// them was tried first and just fused the words into "recomendase").
// Zero-width joiners/spaces carry no visual meaning of their own, so those
// alone are stripped outright.
const STRIP_INVISIBLE=new RegExp(`[${String.fromCharCode(0x200b,0x200c,0x200d,0xfeff)}]`,'g');
const DASH_LIKE=new RegExp(`[${String.fromCharCode(0x00ad,0x2010,0x2011,0x2012,0x2013)}]`,'g');
const clean=value=>String(value??'')
  .replace(STRIP_INVISIBLE,'')
  .replace(DASH_LIKE,'-')
  .trim();
// Pedido do usuário (14/09/2026): a IA não deve usar sempre as mesmas
// instruções estáticas -- ela precisa "aprender" com o que a psicóloga pede
// de ajuste no chat, e aplicar isso automaticamente nas próximas gerações
// (não só dentro da conversa atual). `ia_preferencias_texto` guarda, por
// contexto (ex.: 'documentos'), uma lista curta e cumulativa de preferências
// de estilo -- lida no início de toda geração e atualizada (via uma chamada
// separada e barata à IA) sempre que um pedido de ajuste dentro de uma
// conversa em andamento revelar uma preferência reutilizável, não um
// detalhe específico daquele caso. Pra resetar o aprendizado de um
// contexto, apague a linha ou zere `notas` direto no banco.
async function buscarPreferenciaTexto(contexto){
  try{
    const r=await supabase(`/rest/v1/ia_preferencias_texto?select=notas&contexto=eq.${encodeURIComponent(contexto)}&limit=1`);
    const data=await json(r);
    return r.ok&&Array.isArray(data)&&data[0]?.notas?clean(data[0].notas):'';
  }catch(e){console.error('buscarPreferenciaTexto:',e);return '';}
}
async function salvarPreferenciaTexto(contexto,notas,autorId){
  try{
    await supabase(`/rest/v1/ia_preferencias_texto?on_conflict=contexto`,{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({contexto,notas,atualizado_em:new Date().toISOString(),atualizado_por:autorId})});
  }catch(e){console.error('salvarPreferenciaTexto:',e);}
}
// Chamada de aprendizado: roda só quando o pedido é um AJUSTE dentro de uma
// conversa em andamento (não a descrição inicial de um caso, que é sempre
// específica de um paciente e nunca uma preferência de estilo geral).
// Deliberadamente síncrona (aguardada antes de responder) em vez de
// "fire-and-forget", porque a função serverless pode ser congelada assim
// que a resposta é enviada -- um disparo sem aguardar arriscaria nunca
// completar. É uma chamada rápida e barata (gpt-5-mini, esforço baixo,
// poucos tokens), então o custo em latência é pequeno.
async function aprenderComAjusteChat({contexto,pedido,atual,key,autorId}){
  if(!pedido||pedido.length<3)return;
  const instructions='Você mantém uma lista curta e objetiva de preferências de ESTILO, TOM e FORMATO de escrita de uma psicóloga brasileira, para orientar textos futuros gerados por IA no aplicativo dela. Preferências já registradas (pode estar vazia):\n"""\n'+(atual||'(nenhuma ainda)')+'\n"""\nA psicóloga acabou de pedir este ajuste em um texto gerado por IA:\n"""\n'+pedido.slice(0,2000)+'\n"""\nSe esse pedido revelar uma preferência de ESTILO/TOM/FORMATO geral e reutilizável em textos futuros (não um detalhe específico deste paciente ou caso), incorpore essa preferência à lista, reescrevendo-a de forma concisa e sem duplicar o que já existe. Se o pedido for apenas um detalhe específico do caso (algo que não se repete em outros textos), responda com a lista atual sem nenhuma mudança. Responda APENAS com a lista final atualizada, em português, uma preferência por linha, sem numeração e sem comentários, no máximo 12 linhas e 2000 caracteres no total.';
  try{
    const r=await fetchComRetentativa('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-5-mini',instructions,input:'Atualize a lista conforme as instruções.',max_output_tokens:600,reasoning:{effort:'low'}})},{tentativas:1,timeoutMs:12000});
    const data=await json(r);if(!r.ok)return;
    const texto=clean((data.output||[]).flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text).slice(0,4000);
    if(!texto||texto===atual)return;
    await salvarPreferenciaTexto(contexto,texto,autorId);
  }catch(e){console.error('aprenderComAjusteChat:',e);}
}
const brandSymbol=readFileSync(new URL('../assets/logo-symbol-hires.png',import.meta.url));
const brandSymbolWhite=readFileSync(new URL('../assets/logo-symbol-white-hires.png',import.meta.url));
const brainDiagram={
  adulto:readFileSync(new URL('../assets/psm/shared/brain-diagram-adulto.png',import.meta.url)),
  infantil:readFileSync(new URL('../assets/psm/shared/brain-diagram-infantil.png',import.meta.url)),
};
const leafTopRight=readFileSync(new URL('../assets/psm/shared/leaf-top-right.png',import.meta.url));
const leafBottomLeft=readFileSync(new URL('../assets/psm/shared/leaf-bottom-left.png',import.meta.url));
const wifePhoto=readFileSync(new URL('../assets/psm/shared/wife-photo.jpg',import.meta.url));
const kidsIllus=['illus-blocos','illus-cartas','illus-giz','illus-fantoche','illus-ursinho'].map(n=>readFileSync(new URL(`../assets/psm/shared/${n}.jpg`,import.meta.url)));
export const formatDates=value=>clean(value).replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g,'$3/$2/$1');

// --- HTML/PDF export (server-rendered, no browser print dialog involved) ---
const dataUri=(buf,mime)=>`data:${mime};base64,${buf.toString('base64')}`;
const brandSymbolUri=dataUri(brandSymbol,'image/png');
const brandSymbolWhiteUri=dataUri(brandSymbolWhite,'image/png');
const brainDiagramUri={adulto:dataUri(brainDiagram.adulto,'image/png'),infantil:dataUri(brainDiagram.infantil,'image/png')};
const leafTopRightUri=dataUri(leafTopRight,'image/png');
const leafBottomLeftUri=dataUri(leafBottomLeft,'image/png');
const wifePhotoUri=dataUri(wifePhoto,'image/jpeg');
const kidsIllusUri=kidsIllus.map(b=>dataUri(b,'image/jpeg'));
const fontUri=name=>dataUri(readFileSync(new URL(`../assets/fonts/${name}`,import.meta.url)),'font/ttf');
const escHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dataBR=value=>formatDates(value);
const longDate=iso=>new Date(iso+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'});

// Mirrors the on-screen .doc-preview rules in index.html 1:1 (same px
// values, same DM Sans/Agrandir Tight fonts) so the exported PDF matches
// what's shown in the app rather than approximating it.
//
// The brand strip repeats on every page by living in a <thead>: Chromium
// repaints a table header group at the top of every page the table breaks
// across. Because it's an ordinary in-flow element it uses the exact same
// stylesheet as page 1, so every page is identical by construction.
//
// Two alternatives were tried against a real Chromium render and rejected:
//   - Puppeteer's headerTemplate does repeat, but renders in an isolated
//     context inheriting none of the page's stylesheet (no webfonts, no
//     flexbox, its own white backdrop), so it could never match the design.
//   - position:fixed also repeats, but Chromium anchors it to the top of
//     the *content box*, where it covers the first lines of text; nudging
//     it up into the margin band (negative top, transform, negative margin)
//     either misplaces it or gets clipped away at the page boundary.
//
// Consequently the page carries NO page.pdf() margin at all, on any side --
// not even the bottom. A real margin is space Chromium reserves and leaves
// as blank page canvas; nothing in CSS (background on <html> included) can
// paint into it, so a non-zero bottom margin always shows as a stray white
// band at the foot of every page. Every side's spacing instead comes from
// ordinary padding on rendered content, which the page background covers.
const BRAND_STRIP_HEIGHT=108;
const BRAND_GAP=30;
const SIDE_PADDING=42;
const BOTTOM_PADDING=30;
export const PAGE_MARGIN={top:0,right:0,bottom:0,left:0};

function pageStyles(colorido){
  return `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;1,400&family=Playfair+Display:wght@400;700&display=swap">
<style>
@font-face{font-family:'Agrandir Tight';src:url('${fontUri('agrandir-tight.ttf')}')}
@font-face{font-family:'Agrandir Tight';src:url('${fontUri('agrandir-tight-bold.ttf')}');font-weight:700}
@page{size:A4}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}
html,body{margin:0}
/* The page background must be set on <html>, not only on <body>: the root
   element's background propagates to the page canvas and so paints the
   bottom margin band too. On <body> alone it stops at the content box,
   leaving the bottom margin white -- a visible seam at the end of a page. */
html{background:#fbfaf9}
body{font-family:'DM Sans',Arial,sans-serif;font-size:13px;line-height:1.65;color:#333;background:#fbfaf9}
${colorido===false?'body{filter:grayscale(1)}':''}
table.doc-page{width:100%;border-collapse:collapse}
table.doc-page>thead{display:table-header-group}
table.doc-page>thead>tr>th.doc-head-cell{padding:0;font-weight:inherit;text-align:left}
table.doc-page>tbody>tr>td.doc-body-cell{padding:0 ${SIDE_PADDING}px ${BOTTOM_PADDING}px;text-align:left}
/* Fixed-height clipping box around the brand strip. The circle is absolutely
   positioned and deliberately overflows the strip, and without this clip it
   escapes the repeating header: Chromium paints the next page's header group
   early, so the top of the circle bleeds through at the bottom of the
   preceding page. The box is tall enough (strip + gap) to still show the
   circle in full, and also supplies the gap before the body text. */
.doc-head-inner{height:${BRAND_STRIP_HEIGHT+BRAND_GAP}px;overflow:hidden;position:relative}
.doc-preview-brand{height:${BRAND_STRIP_HEIGHT}px;position:relative}
.doc-preview-brand:before{content:'';position:absolute;left:-18px;top:-32px;width:156px;height:156px;border-radius:50%;background:${colorido===false?'#b8b8b8':'#899776'};z-index:0}
.doc-preview-brand:after{content:'';position:absolute;left:0;bottom:0;width:180px;border-bottom:2px solid #9aa7aa;z-index:1}
.doc-preview-brand .brand-lockup{position:absolute;left:7px;top:7px;display:flex;align-items:center;color:#4e553e;line-height:.82;z-index:2}
.doc-preview-brand .brand-symbol{width:100px;height:88px;object-fit:contain;filter:brightness(0) invert(1)}
.doc-preview-brand .brand-copy{font-family:'Playfair Display',serif;margin-left:37px}
.doc-preview-brand .brand-name{font-size:23px;font-weight:400}
.doc-preview-brand .brand-name strong{font-weight:700}
.doc-preview-brand .brand-role{display:flex;align-items:baseline;gap:10px;margin-top:6px;font-size:6.5px;white-space:nowrap;font-family:'DM Sans',Arial,sans-serif;color:#b86a49}
.doc-preview-brand .brand-role strong{font-weight:700}
h2{text-align:center;color:#4e553e;font:700 17.28px 'Agrandir Tight','Arial Narrow',sans-serif;margin:26px 0 46px}
h3{font-size:13.76px;color:#4e553e;margin:20px 0 7px;break-after:avoid}
p{margin:0 0 12px;white-space:pre-wrap;text-align:justify;orphans:2;widows:2}
/* 15/09/2026: "break-before:avoid" aqui foi orientação anterior do usuário
   pra nunca deixar a assinatura sozinha numa página -- mas combinado com
   "break-inside:avoid" (que já garante isso sozinho, impedindo o bloco de
   ser cortado ao meio) ele também arrastava o parágrafo anterior inteiro
   para a página seguinte sempre que o fechamento não coubesse exatamente
   onde estava, mesmo sobrando bastante espaço em branco na página anterior
   -- foi o caso relatado (relatório da Nathalya, 13/09/2026). Mantendo só
   break-inside:avoid: a assinatura nunca é cortada ao meio, mas passa a
   começar onde realmente couber, sem puxar conteúdo pra baixo à toa. */
.doc-closing{break-inside:avoid}
.doc-signature{position:relative;text-align:right;margin-top:36px;padding-top:14px;padding-right:92px;min-height:112px}
.doc-signature:before{content:'';position:absolute;right:0;top:0;width:330px;border-top:2px solid #9aa7aa}
.doc-signature img{position:absolute;right:0;bottom:0;width:88px;height:98px;object-fit:contain;opacity:.28}
.doc-signature p{margin:0 0 2px;text-align:right;color:#3f3f44}
.doc-signature strong{color:#69696e}
</style>`;
}

const brandStripMarkup=()=>`<div class="doc-preview-brand"><div class="brand-lockup"><img class="brand-symbol" src="${brandSymbolWhiteUri}" alt=""><div class="brand-copy"><div class="brand-name"><strong>Jaqueline</strong><br>Vieira</div><div class="brand-role"><strong>PSICÓLOGA</strong><span>CRP 06/191478</span></div></div></div></div>`;

// Wraps the document in the repeating-header table described above: the
// brand strip goes in <thead> (repeated on every page), everything else --
// starting with the title -- in a single body cell that paginates normally.
const pageTable=bodyHtml=>`<table class="doc-page"><thead><tr><th class="doc-head-cell"><div class="doc-head-inner">${brandStripMarkup()}</div></th></tr></thead><tbody><tr><td class="doc-body-cell">${bodyHtml}</td></tr></tbody></table>`;

function documentPdfHtml(item){
  const c=item.conteudo||{},fields=c.campos||{},sections=Array.isArray(c.secoes)?c.secoes:[];
  const colorido=(c.estilo||'colorido')==='colorido';
  const campos=Object.entries(fields).filter(([,v])=>clean(v)).map(([k,v])=>`<p><strong>${escHtml(k)}:</strong> ${escHtml(dataBR(v))}</p>`).join('');
  const secoes=sections.map(s=>`${s.titulo?`<h3>${escHtml(s.titulo)}</h3>`:''}${s.texto?`<p>${escHtml(dataBR(s.texto))}</p>`:''}`).join('');
  const closing=`<div class="doc-closing"><p style="text-align:right;margin-top:24px">Araraquara, ${longDate(item.emitido_em)}.</p><p style="text-align:right">À disposição para esclarecimentos de quaisquer dúvidas.</p><div class="doc-signature"><img src="${brandSymbolUri}" alt=""><p><strong>Jaqueline Cristina Vieira</strong></p><p>CRP 06/191478</p><p>Psicóloga Clínica</p><p>Pós-graduada em Terapia Cognitivo-Comportamental</p></div></div>`;
  const body=pageTable(`<h2>${escHtml(item.titulo)}</h2>${campos}${secoes}${closing}`);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escHtml(item.titulo)}</title>${pageStyles(colorido)}</head><body>${body}</body></html>`;
}

function prontuarioPdfHtml(nome,sessoes){
  const linhas=sessoes.map(s=>{
    const [y,m,d]=clean(s.data).split('-');
    return `<tr><td class="pront-data">${escHtml(`${d}/${m}/${y}`)}</td><td class="pront-relato">${escHtml(clean(s.relato)).replace(/\n/g,'<br>')}</td></tr>`;
  }).join('');
  const body=pageTable(`<h2>Prontuário — ${escHtml(nome)}</h2><table class="pront-table"><thead><tr><th class="pront-data">Data</th><th class="pront-relato">Relato da sessão</th></tr></thead><tbody>${linhas}</tbody></table>`);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Prontuário - ${escHtml(nome)}</title>${pageStyles(true)}<style>
.pront-table{width:100%;border-collapse:collapse;break-inside:auto}
.pront-table thead{display:table-header-group}
.pront-table th{background:#b7c3a5;color:#fff;text-align:left;padding:6px 10px;font-size:12.5px}
.pront-table td{border:1px solid #ddd;padding:6px 10px;vertical-align:top;font-size:12.5px}
.pront-data{white-space:nowrap;width:90px;color:#555}
.pront-table tbody tr{break-inside:avoid}
</style></head><body>${body}</body></html>`;
}

export async function renderDocumentoPdf(item){
  const {renderPdf}=await import('./pdf.js');
  return renderPdf(documentPdfHtml(item),{format:'A4',margin:PAGE_MARGIN});
}

export async function renderProntuarioPdf(nome,sessoes){
  const {renderPdf}=await import('./pdf.js');
  return renderPdf(prontuarioPdfHtml(nome,sessoes),{format:'A4',margin:PAGE_MARGIN});
}

function atividadePdfHtml(titulo,imgB64){
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escHtml(titulo||'Atividade')}</title><style>
@page{size:A4;margin:0}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}
html,body{margin:0;height:100%}
body{display:flex;align-items:center;justify-content:center;background:#fff}
img{max-width:100%;max-height:100%;object-fit:contain;display:block}
</style></head><body><img src="data:image/png;base64,${imgB64}"></body></html>`;
}

// Same reasoning as renderProntuarioPdf: this used to be a client-side
// window.print() of the activity image, which hit the same two problems as
// the prontuario export did -- a browser-injected header/footer (date/URL/
// page count) and a silent failure whenever the print popup got blocked.
export async function renderAtividadePdf(titulo,imgB64){
  const {renderPdf}=await import('./pdf.js');
  return renderPdf(atividadePdfHtml(titulo,imgB64),{format:'A4',margin:{top:0,right:0,bottom:0,left:0}});
}

const ICON_WIFI='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M4 8.5a13 13 0 0 1 16 0"/><path d="M7 12.2a8.4 8.4 0 0 1 10 0"/><path d="M10 15.8a3.8 3.8 0 0 1 4 0"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/></svg>';
const ICON_HOME='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9h12v-9"/></svg>';
const ICON_CALENDAR='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5.5" width="16" height="14" rx="2.2"/><path d="M4 10h16M8 3.5v3.5M16 3.5v3.5"/><path d="m9 14.3 2 2 4-4.2"/></svg>';

// Slides 2-8 (indexes 1-7) now share the same brand system as the cover and
// closing slides -- Playfair Display headings in olive, terracotta as a
// restrained accent (thin rules, small caps labels), DM Sans body copy,
// cream background. Only the TCC brain-diagram graphic is kept as a cropped
// image (generic clip-art, no brand elements of its own to clash).
const PSM_TEXT={
  adulto:{
    abordagem:['Através da TCC será possível identificar as crenças disfuncionais que levam aos pensamentos mal adaptativos, influenciando as emoções e o comportamento do paciente.','Ao longo das sessões, o objetivo é auxiliar o paciente a avaliar esses pensamentos de forma adapativa, trazendo uma mudança das reações - comportamental, emocional e fisiológica.'],
    endereco:{nome:'Espaço Humaniza',linhas:['Av. Armando Corrêa de Siqueira, 1104','Bairro: Vila Harmonia']},
    agendamento:['Tolerância de atraso é de 15 minutos','Cancelamento deve ser feito 24 horas antes','Mudanças de horário devem ser comunicados em até 72 horas antes da terapia, sendo possível de acordo com a disponibilidade do psicólogo','A partir de duas faltas consecutivas, sem aviso durante o tratamento, o atendimento será considerado interrompido e o cliente poderá perder sua vaga preferencial de horário'],
  },
  infantil:{
    abordagem:['Durante os atendimentos, será possível auxiliar as crianças a desenvolverem habilidades de enfrentamento e modificar padrões de pensamentos disfuncionais. A TCC ensina as crianças a reconhecer e gerenciar suas emoções de forma mais eficaz; buscando aprimoramento de habilidades para resolução de problemas; mudanças de comportamentos e desenvolvimento de habilidades sociais. Essas abordagens são adaptas de acordo com a idade e nível de desenvolvimento da criança, sendo utilizado métodos lúdicos e atividades interativas.'],
    endereco:{nome:'Clínica Integrale',linhas:['Rua Napoleão Selmidei, 478','Bairro: Vila Harmonia']},
    agendamento:['Tolerância de atraso é de 15 minutos;','Cancelamento deve ser feito 8 horas antes;','Mudanças de horário devem ser comunicados em até 24 horas antes da terapia, sendo possível de acordo com a disponibilidade do psicólogo;','A partir de duas faltas consecutivas, sem aviso durante o tratamento, o atendimento será considerado interrompido e o cliente poderá perder sua vaga preferencial de horário.'],
  },
};
const PSM_PAGAMENTO=['Qualquer alteração do valor somente poderá acontecer com o conhecimento e acordo entre as partes','Sessões em que o cliente não comparece, sem aviso antecipado, serão cobradas normalmente, salvo, motivos de extrema urgência','O valor dos honorários pode ser revisto a cada 6 meses','O contrato poderá ser reincidindo por qualquer uma das partes a qualquer momento e não será cobrado nenhuma multa ou qualquer outro tipo de ônus.'];

const PSM_SPRIG='<svg class="psm-sprig" viewBox="0 0 20 20"><path d="M10 18 C10 12 10 6 10 2 M10 8 C7 6 5 6 3 8 M10 6 C13 4 15 4 17 6 M10 12 C7 10 5 10 3 12" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
// Kids variant: same slide skeleton, copy, and order as the adult PSM (per
// the client's constraint -- one deck, two skins). No licensed characters
// anywhere -- five original toy line-marks (same stroke style as the
// brand's flower logo), one per slide, each carrying its own pastel that
// drives that whole slide's accent via --emo/--emo-bg. The cover shows the
// full toy box at once.
const PSM_TOYS=[
  {name:'Blocos',bg:'#fbf0c8',fg:'#c99a2e',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><rect x="4" y="12.5" width="7" height="7" rx="1" fill="currentColor" fill-opacity=".12"/><rect x="13" y="12.5" width="7" height="7" rx="1" fill="currentColor" fill-opacity=".12"/><rect x="8.5" y="4" width="7" height="7" rx="1" fill="currentColor" fill-opacity=".12"/></svg>'},
  {name:'Cartas de emoção',bg:'#e4eef7',fg:'#6e9dc4',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><rect x="3.5" y="6" width="12" height="15" rx="1.6" transform="rotate(-8 3.5 6)" fill="currentColor" fill-opacity=".1"/><rect x="8" y="4" width="12" height="15" rx="1.6" fill="currentColor" fill-opacity=".14"/><circle cx="14" cy="9.3" r=".5" fill="currentColor" stroke="none"/><circle cx="17.2" cy="9.3" r=".5" fill="currentColor" stroke="none"/><path d="M13.3 13c1 1 2.6 1 3.6 0" stroke-linecap="round"/></svg>'},
  {name:'Giz de cera',bg:'#fbe4e1',fg:'#d97066',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21 4 9.5c-.1-1 .5-2 1.6-2.2L8 6.8c1-.2 2 .4 2.2 1.4L11 20" fill="currentColor" fill-opacity=".12"/><path d="M8 6.8 6.6 3" /><path d="M13.5 21 12.6 11c-.1-1 .5-2 1.5-2.2l2-.4c1-.2 2 .4 2.2 1.5L19 20.5" fill="currentColor" fill-opacity=".12"/><path d="M14.1 8.4 13 5" /></svg>'},
  {name:'Fantoche',bg:'#eee6f7',fg:'#a784cc',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21v-6.5C8 10 9.8 6 12 6s4 4 4 8.5V21" fill="currentColor" fill-opacity=".12"/><path d="M9.5 6.2C9 4.4 10.1 3 12 3s3 1.4 2.5 3.2" /><circle cx="10.4" cy="11" r=".5" fill="currentColor" stroke="none"/><circle cx="13.6" cy="11" r=".5" fill="currentColor" stroke="none"/><path d="M10.6 13.6c.9.7 2 .7 2.8 0" /></svg>'},
  {name:'Ursinho',bg:'#e7f2e0',fg:'#7fa968',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.3" cy="6.3" r="2" fill="currentColor" fill-opacity=".12"/><circle cx="16.7" cy="6.3" r="2" fill="currentColor" fill-opacity=".12"/><circle cx="12" cy="13.5" r="7" fill="currentColor" fill-opacity=".12"/><circle cx="9.3" cy="12.5" r=".4" fill="currentColor" stroke="none"/><circle cx="14.7" cy="12.5" r=".4" fill="currentColor" stroke="none"/><path d="M10 16.3c1.2 1 2.8 1 4 0"/></svg>'},
];
function psmHeader(titulo,publico,emoIdx){
  if(publico==='infantil'){
    const e=PSM_TOYS[emoIdx%PSM_TOYS.length];
    return `<div class="psm-content-head"><span class="psm-icon-badge psm-emo-badge">${e.icon}</span><h2>${escHtml(titulo)}</h2></div>`;
  }
  return `<div class="psm-content-head"><span class="psm-mark">${PSM_SPRIG}</span><h2>${escHtml(titulo)}</h2></div>`;
}
function psmWrap(publico,emoIdx){
  if(publico!=='infantil')return {cls:'psm-content',style:''};
  const e=PSM_TOYS[emoIdx%PSM_TOYS.length];
  return {cls:'psm-content psm-kids',style:` style="--emo:${e.fg};--emo-bg:${e.bg}"`};
}
function psmKidsIllus(publico,emoIdx){
  if(publico!=='infantil')return '';
  const uri=kidsIllusUri[emoIdx%kidsIllusUri.length];
  return `<img class="psm-kids-illus" src="${uri}" alt="">`;
}
function psmAbordagemHtml(publico){
  const t=PSM_TEXT[publico]||PSM_TEXT.adulto,w=psmWrap(publico,0);
  return `<div class="${w.cls}"${w.style}><img class="psm-leaf psm-leaf-tr" src="${leafTopRightUri}" alt="">${psmHeader('Abordagem utilizada',publico,0)}
<div class="psm-abordagem-grid">
<div class="psm-abordagem-text"><p class="psm-kicker">Terapia Cognitivo-Comportamental</p>${t.abordagem.map(p=>`<p>${escHtml(p)}</p>`).join('')}</div>
${publico==='infantil'?`<img class="psm-abordagem-brain psm-kids-inline-illus" src="${kidsIllusUri[0]}" alt="">`:`<img class="psm-abordagem-brain" src="${brainDiagramUri[publico]||brainDiagramUri.adulto}" alt="Como a TCC pode ajudar">`}
</div></div>`;
}
function psmOnlineHtml(publico){
  const w=psmWrap(publico,1);
  return `<div class="${w.cls}"${w.style}><img class="psm-leaf psm-leaf-bl" src="${leafBottomLeftUri}" alt="">${psmHeader('Terapia online',publico,1)}
<p class="psm-content-lead">As sessões duram <strong>50 min</strong> e são realizadas pelo Google Meet, através de um link criado por mim e enviado na hora agendada, pelo Whatsapp.</p>
<p class="psm-kicker psm-kicker-center">Pré-requisitos</p>
<div class="psm-req-row">
<div class="psm-req-item"><span class="psm-icon-badge">${ICON_WIFI}</span><span>Internet com<br>boa conexão</span></div>
<div class="psm-req-item"><span class="psm-icon-badge">${ICON_HOME}</span><span>Lugar confortável<br>e reservado</span></div>
</div></div>`;
}
function psmPresencialHtml(publico){
  const t=PSM_TEXT[publico]||PSM_TEXT.adulto,w=psmWrap(publico,2);
  return `<div class="${w.cls}"${w.style}><img class="psm-leaf psm-leaf-tr" src="${leafTopRightUri}" alt="">${psmHeader('Terapia presencial',publico,2)}
<p class="psm-content-lead">As sessões duram <strong>50 min</strong> e são realizadas no seguinte endereço:</p>
<div class="psm-address-block"><span class="psm-icon-badge">${ICON_HOME}</span><div class="psm-address-text"><strong>${escHtml(t.endereco.nome)}</strong>${t.endereco.linhas.map(l=>`<span>${escHtml(l)}</span>`).join('')}</div></div>
</div>`;
}
function psmListHtml(titulo,items,leaf,publico,emoIdx){
  const img=leaf==='bl'?`<img class="psm-leaf psm-leaf-bl" src="${leafBottomLeftUri}" alt="">`:`<img class="psm-leaf psm-leaf-tr" src="${leafTopRightUri}" alt="">`;
  const rot=[-6,4,-3,7,-5],w=psmWrap(publico,emoIdx);
  return `<div class="${w.cls}"${w.style}>${img}${psmHeader(titulo,publico,emoIdx)}
<ul class="psm-list">${items.map((i,n)=>`<li><span class="psm-bullet" style="transform:rotate(${rot[n%rot.length]}deg)">${PSM_SPRIG}</span><span>${escHtml(i)}</span></li>`).join('')}</ul>
</div>`;
}
function psmValoresHtml(individual,pacote,publico){
  const valorBR=v=>{const n=Number(String(v||'').replace(',','.'));return Number.isFinite(n)?n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'R$ 0,00';},w=psmWrap(publico,0);
  return `<div class="${w.cls}"${w.style}><img class="psm-leaf psm-leaf-bl" src="${leafBottomLeftUri}" alt="">${psmHeader('Valores',publico,0)}
<div class="psm-price-row">
<div class="psm-price-item"><span class="psm-kicker">1 sessão</span><span class="psm-price-num">${escHtml(valorBR(individual))}</span></div>
<div class="psm-price-div"></div>
<div class="psm-price-item"><span class="psm-kicker">Pacote com 4 sessões</span><span class="psm-price-num psm-price-num-lg">${escHtml(valorBR(pacote))}</span></div>
</div>
<div class="psm-pay"><p class="psm-kicker">Pagamento</p><p>Pix: <strong>57.062.579/0001-34</strong></p><p class="psm-pay-note">Gentileza enviar o comprovante de pagamento até o dia da sessão a ser realizada.</p></div>
</div>`;
}
function psmAcompanheHtml(publico){
  const w=psmWrap(publico,1);
  return `<div class="${w.cls}"${w.style}><img class="psm-leaf psm-leaf-tr" src="${leafTopRightUri}" alt="">${psmHeader('Me acompanhe',publico,1)}
<div class="psm-photo-wrap"><img class="psm-photo" src="${wifePhotoUri}" alt="Jaqueline Vieira"></div>
<div class="psm-insta"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1"/></svg><span>@psi_jaquelinevieira</span></div>
</div>`;
}
function psmAgendamentoHtml(publico){
  const w=psmWrap(publico,1);
  return `<div class="${w.cls}"${w.style}><img class="psm-leaf psm-leaf-bl" src="${leafBottomLeftUri}" alt="">${psmHeader('Agendamento',publico,1)}
<div class="psm-contact-block">
<span class="psm-icon-badge">${ICON_CALENDAR}</span>
<p class="psm-kicker">Agendamento e dúvidas</p>
<div class="psm-contact-lines"><span>(16) 99746-7348</span><span>Jaqueline Vieira</span><span>psi.jaquelinev@gmail.com</span></div>
</div></div>`;
}
function psmInnerSlideHtml(index,publico,individual,pacote){
  const t=PSM_TEXT[publico]||PSM_TEXT.adulto;
  if(index===1)return psmAbordagemHtml(publico);
  if(index===2)return psmOnlineHtml(publico);
  if(index===3)return psmPresencialHtml(publico);
  if(index===4)return psmListHtml('Observações de agendamento',t.agendamento,'tr',publico,3);
  if(index===5)return psmListHtml('Observações de pagamento',PSM_PAGAMENTO,'bl',publico,4);
  if(index===6)return psmValoresHtml(individual,pacote,publico);
  if(index===7)return psmAgendamentoHtml(publico);
  return '';
}
function psmCoverHtml(publico){
  const subtitle=publico==='infantil'?'<div class="psm-cover-sub">Psicoterapia Infantil</div>':'';
  const cast=publico==='infantil'?`<div class="psm-cover-cast">${PSM_TOYS.map(e=>`<span class="psm-icon-badge psm-emo-badge" style="--emo:${e.fg};--emo-bg:${e.bg}">${e.icon}</span>`).join('')}</div>`:'';
  return `<div class="psm-cover-wrap${publico==='infantil'?' psm-kids':''}">
<div class="psm-cover">
<div class="psm-cover-logo"><img src="${brandSymbolUri}" alt=""></div>
<div class="psm-cover-copy">
<div class="psm-cover-name"><strong>Jaqueline</strong><br>Vieira</div>
<div class="psm-cover-role"><span></span><strong>PSICÓLOGA</strong><span></span></div>
${subtitle}
</div>
</div>
${cast}
</div>`;
}
function psmClosingHtml(){
  return `<div class="psm-closing">
<div class="psm-closing-thanks">Obrigada!</div>
<div class="psm-closing-lockup">
<img class="psm-closing-logo" src="${brandSymbolWhiteUri}" alt="">
<div class="psm-closing-copy">
<div class="psm-closing-name"><strong>Jaqueline</strong><br>Vieira</div>
<div class="psm-closing-role"><strong>PSICÓLOGA</strong><span>CRP 06/191478</span></div>
</div>
</div>
</div>`;
}
function psmPdfHtmlNew(publico,individual,pacote){
  const valorBR=v=>{const n=Number(String(v||'').replace(',','.'));return Number.isFinite(n)?n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'';};
  const slides=Array.from({length:10},(_,i)=>{
    if(i===0)return `<section class="psm-slide psm-slide-html">${psmCoverHtml(publico)}</section>`;
    if(i===9)return `<section class="psm-slide psm-slide-html">${psmClosingHtml()}</section>`;
    if(i===8)return `<section class="psm-slide psm-slide-html">${psmAcompanheHtml(publico)}</section>`;
    return `<section class="psm-slide psm-slide-html">${psmInnerSlideHtml(i,publico,individual,pacote)}</section>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>PSM ${publico==='infantil'?'Infantil':'Adulto'} - Pacote ${escHtml(valorBR(pacote))}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,300;1,9..144,400&family=Newsreader:ital,wght@0,400;0,500;1,400&family=DM+Sans:wght@400;500;700&family=Baloo+2:wght@600;700&family=Nunito:wght@600;700&display=swap">
<style>
@page{size:12in 8in;margin:0}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}
body{margin:0}
.psm-slide{width:12in;height:8in;position:relative;overflow:hidden;break-after:page}
.psm-slide:last-child{break-after:auto}
.psm-slide>img{width:100%;height:100%;object-fit:cover}
.psm-price-overlay{position:absolute;left:8.4%;top:27.5%;width:47.3%;height:28.2%;border-radius:8%/20%;background:#b86a49;color:#fff;padding:4.7% 2.15%;display:grid;grid-template-columns:minmax(0,1fr) minmax(84px,.48fr);column-gap:2%;row-gap:14%;align-items:center;font:700 17pt 'Playfair Display',serif}
.psm-price-overlay span{white-space:nowrap;min-width:0}
.psm-price-overlay span:nth-child(even){text-align:right}
.psm-slide-html{background:#f5f1e8;display:flex;align-items:center;justify-content:center}
.psm-cover-wrap{position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center}
.psm-cover{display:flex;align-items:center;gap:.6in}
.psm-cover-cast{position:absolute;right:.7in;bottom:.7in;display:flex;align-items:flex-end;gap:.3in}
.psm-cover-cast .psm-icon-badge{width:1in;height:1in;color:var(--emo)}
.psm-cover-cast .psm-icon-badge svg{width:1in;height:1in}
.psm-cover-cast .psm-icon-badge:nth-child(2){transform:translateY(-.12in) rotate(-6deg)}
.psm-cover-cast .psm-icon-badge:nth-child(4){transform:translateY(-.08in) rotate(5deg)}
.psm-cover-logo img{width:2.6in;height:auto;display:block}
.psm-cover-name{font:400 60pt 'Playfair Display',serif;color:#4e553e;line-height:1.05}
.psm-cover-name strong{font-weight:700}
.psm-cover-role{display:flex;align-items:center;gap:14px;margin-top:.22in;font:700 13pt 'DM Sans',sans-serif;color:#b86a49;letter-spacing:.12em}
.psm-cover-role span{width:.7in;height:1px;background:#b86a49;display:inline-block}
.psm-cover-sub{margin-top:.3in;font:400 17pt 'Playfair Display',serif;color:#899776}
.psm-closing{width:100%;height:100%;background:#899776;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff}
.psm-closing-thanks{font:700 54pt 'Playfair Display',serif;margin-bottom:.55in}
.psm-closing-lockup{display:flex;align-items:center;gap:.35in}
.psm-closing-logo{width:1.3in;height:auto;display:block;filter:brightness(0) invert(1)}
.psm-closing-name{font:400 26pt 'Playfair Display',serif;line-height:1.05}
.psm-closing-name strong{font-weight:700}
.psm-closing-role{display:flex;align-items:baseline;gap:12px;margin-top:.15in;font:700 10pt 'DM Sans',sans-serif;letter-spacing:.08em}
.psm-closing-role span{font-weight:400}
.psm-content{width:100%;height:100%;padding:.9in 1.2in;display:flex;flex-direction:column;justify-content:center;position:relative;background:#f5f1e8;overflow:hidden}
.psm-leaf{position:absolute;pointer-events:none;opacity:.92}
.psm-leaf-tr{top:-.3in;right:-.3in;width:2.3in;height:auto}
.psm-leaf-bl{bottom:-.35in;left:-.35in;width:3in;height:auto}
.psm-content-head{margin-bottom:.6in;flex-shrink:0;display:flex;align-items:baseline;gap:.16in}
.psm-kids .psm-content-head{align-items:center;gap:.3in}
.psm-content-head h2{font:300 36pt/1.15 'Fraunces',serif;font-style:italic;color:#4e553e;margin:0;letter-spacing:.002em;text-wrap:balance}
.psm-mark{display:inline-flex;color:#899776;transform:rotate(-12deg) translateY(.03in);flex-shrink:0}
.psm-mark svg{width:.3in;height:.3in}
.psm-kids .psm-content-head h2{font-family:'Baloo 2',cursive;font-style:normal;font-weight:700;letter-spacing:0}
.psm-kids .psm-kicker{font-family:'Nunito',sans-serif;font-style:normal;font-weight:700;color:var(--emo);text-transform:uppercase;letter-spacing:.04em;font-size:11pt}
.psm-kids .psm-address-text strong{font-family:'Baloo 2',cursive;font-style:normal;font-weight:700}
.psm-kids .psm-contact-lines{font-family:'Baloo 2',cursive;font-style:normal;font-weight:600}
.psm-kids .psm-insta span{font-family:'Baloo 2',cursive;font-style:normal;font-weight:600}
.psm-icon-badge{display:inline-flex;align-items:center;justify-content:center;color:#4e553e}
.psm-kids .psm-icon-badge{color:var(--emo)}
.psm-kids .psm-icon-badge svg{color:var(--emo)}
.psm-kids .psm-req-item .psm-icon-badge,.psm-kids .psm-address-block>.psm-icon-badge,.psm-kids .psm-contact-block>.psm-icon-badge{width:1in;height:1in}
.psm-kids .psm-req-item .psm-icon-badge svg,.psm-kids .psm-address-block>.psm-icon-badge svg,.psm-kids .psm-contact-block>.psm-icon-badge svg{width:1in;height:1in}
.psm-emo-badge{width:1.1in;height:1.1in;flex-shrink:0}
.psm-emo-badge svg{width:1.1in;height:1.1in;display:block}
.psm-kicker{font:italic 400 14pt 'Newsreader',serif;color:#899776;margin:0 0 .2in;letter-spacing:.01em}
.psm-kicker-center{text-align:center;margin:0 0 .35in}
.psm-content p{font:400 15pt/1.7 'Newsreader',serif;color:#4a4234;margin:0 0 .2in}
.psm-content-lead{font:400 18pt/1.75 'Newsreader',serif;font-style:italic;color:#4a4234;text-align:center;max-width:9.6in;margin:0 auto .75in}
.psm-content-lead strong{font-weight:500;font-style:normal;color:#4e553e}
.psm-abordagem-grid{display:flex;gap:.7in;align-items:center}
.psm-abordagem-text{flex:1.3}
.psm-abordagem-brain{width:3.9in;height:auto;border-radius:6px}
.psm-kids-inline-illus{border-radius:14px;box-shadow:0 4px 14px rgba(0,0,0,.08),inset 0 0 0 1px oklch(0 0 0/.1)}
.psm-kids-illus{position:absolute;right:.6in;bottom:.6in;width:2.5in;height:auto;border-radius:14px;box-shadow:0 4px 14px rgba(0,0,0,.08),inset 0 0 0 1px oklch(0 0 0/.1)}
.psm-req-row{display:flex;justify-content:center;gap:1.3in;margin-top:.15in}
.psm-req-item{display:flex;flex-direction:column;align-items:center;gap:.2in;color:#4e553e}
.psm-req-item svg{width:.7in;height:.7in;color:#899776}
.psm-req-item span{font:400 14pt/1.4 'Newsreader',serif;color:#4a4234;text-align:center}
.psm-address-block{display:flex;align-items:center;gap:.4in;justify-content:center;margin-top:.15in}
.psm-address-block svg{width:.7in;height:.7in;color:#899776;flex-shrink:0}
.psm-address-text{display:flex;flex-direction:column;gap:.1in;font:400 16pt/1.55 'Newsreader',serif;color:#4a4234}
.psm-address-text strong{font:italic 300 21pt 'Fraunces',serif;color:#4e553e;letter-spacing:.01em}
.psm-list{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:.3in}
.psm-list li{display:flex;align-items:flex-start;gap:.26in;font:400 15pt/1.6 'Newsreader',serif;color:#4a4234}
.psm-bullet{display:inline-flex;color:#899776;flex-shrink:0;margin-top:.07in}
.psm-bullet svg{width:.22in;height:.22in;display:block}
.psm-kids .psm-bullet{color:var(--emo)}
.psm-price-row{display:flex;align-items:center;justify-content:center;gap:.7in;margin-bottom:.6in}
.psm-price-item{display:flex;flex-direction:column;align-items:center;gap:.14in}
.psm-price-div{width:1px;height:.9in;background:#c9b79a}
.psm-price-num{font:300 28pt 'Fraunces',serif;color:#4e553e;font-variant-numeric:tabular-nums}
.psm-price-num-lg{font-weight:400;font-size:36pt;color:#b86a49}
.psm-kids .psm-price-num-lg{color:var(--emo)}
.psm-kids .psm-price-num{font-family:'Baloo 2',cursive;font-style:normal;font-weight:700}
.psm-kids .psm-price-div{background:var(--emo);opacity:.4}
.psm-pay{text-align:center}
.psm-pay p{font:400 14pt/1.6 'Newsreader',serif;color:#4a4234;margin:0 0 .08in}
.psm-pay strong{color:#4e553e;font-weight:500}
.psm-pay-note{max-width:6.5in;margin-left:auto!important;margin-right:auto!important}
.psm-contact-block{display:flex;flex-direction:column;align-items:center;gap:.22in}
.psm-contact-block svg{width:.55in;height:.55in;color:#899776}
.psm-contact-lines{display:flex;flex-direction:column;align-items:center;gap:.14in;font:italic 300 18pt 'Fraunces',serif;color:#3f3a2e;margin-top:.05in}
.psm-photo-wrap{display:flex;justify-content:center;margin:.2in 0 .5in;position:relative}
.psm-photo{width:2.6in;height:2.6in;border-radius:50%;object-fit:cover;border:1.5px solid #4e553e;box-shadow:inset 0 0 0 1px oklch(0 0 0/.1)}
.psm-insta{display:flex;align-items:center;justify-content:center;gap:.16in;color:#4e553e}
.psm-insta svg{width:.36in;height:.36in;color:#899776}
.psm-insta span{font:italic 300 17pt 'Fraunces',serif}
</style></head><body>${slides}</body></html>`;
}

// Original PSM PDF (pre-redesign): all 10 pages are the pre-made PNGs with
// just the dynamic price overlay on slide 7. Kept as the "current" side of
// the app-wide old/new UI toggle -- everything except documents/atividades
// switches, PSM included, so this needs to keep working exactly as it did
// before any of the redesign work.

async function psmInfantilWebpPdf(individual,pacote){
  const valorBR=v=>{
    const n=Number(String(v||'').replace(',','.'));
    return Number.isFinite(n)?n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):'0,00';
  };

  const pdf=await PDFDocument.create();
  // Standard PDF font: no font files, SVG/Pango or server glyph rendering involved.
  // This keeps the dynamic prices reliable in Vercel and affects only the
  // new infantil WebP export flow.
  const priceFont=await pdf.embedFont(StandardFonts.HelveticaBold);
  const priceSize=28;
  const priceColor=rgb(0,0.53,0.52);
  const priceCenters=[309,563];
  const priceBaselineY=310;
  const prices=[`R$ ${valorBR(individual)}`,`R$ ${valorBR(pacote)}`];

  for(let i=1;i<=10;i++){
    const n=String(i).padStart(2,'0');
    const webp=readFileSync(new URL(`../assets/psm/infantil/emocoes-page-${n}.webp`,import.meta.url));
    const jpg=await sharp(webp).jpeg({quality:98,chromaSubsampling:'4:4:4'}).toBuffer();
    const image=await pdf.embedJpg(jpg);
    const page=pdf.addPage([864,576]);
    page.drawImage(image,{x:0,y:0,width:864,height:576});

    if(i===7){
      prices.forEach((text,idx)=>{
        const width=priceFont.widthOfTextAtSize(text,priceSize);
        page.drawText(text,{
          x:priceCenters[idx]-(width/2),
          y:priceBaselineY,
          size:priceSize,
          font:priceFont,
          color:priceColor,
        });
      });
    }
  }

  return Buffer.from(await pdf.save({useObjectStreams:true}));
}

// A identidade visual antiga (e o toggle correspondente no front-end) foi
// removida -- psmPdfHtmlNew (renomeada aqui só de nome, nunca de
// comportamento) é a única versão que sobrou. publico==='infantil' nunca
// chega aqui de verdade: a rota abaixo já desvia pra psmInfantilWebpPdf
// antes de chamar psmPdfHtml.
export function psmPdfHtml(publico,individual,pacote){
  return psmPdfHtmlNew(publico,individual,pacote);
}

function paragraph(text,{bold=false,heading,align,spaceAfter=160,color='222222'}={}){
  return new Paragraph({heading,alignment:align,spacing:{after:spaceAfter,line:300},children:[new TextRun({text:formatDates(text),bold,font:'Arial',size:22,color})]});
}

function documentChildren(item){
  const c=item.conteudo||{}, fields=c.campos||{}, sections=Array.isArray(c.secoes)?c.secoes:[],accent=c.estilo==='preto-branco'?'222222':'596457';
  const noBorders={top:{style:BorderStyle.NIL},bottom:{style:BorderStyle.NIL},left:{style:BorderStyle.NIL},right:{style:BorderStyle.NIL},insideHorizontal:{style:BorderStyle.NIL},insideVertical:{style:BorderStyle.NIL}};
  const out=[
    new Table({width:{size:100,type:WidthType.PERCENTAGE},borders:noBorders,rows:[new TableRow({children:[
      new TableCell({width:{size:24,type:WidthType.PERCENTAGE},shading:{fill:c.estilo==='preto-branco'?'B8B8B8':'B7C3A5'},verticalAlign:VerticalAlign.CENTER,margins:{top:70,bottom:70,left:70,right:70},children:[new Paragraph({alignment:AlignmentType.CENTER,children:[new ImageRun({data:brandSymbolWhite,transformation:{width:67,height:75},type:'png',altText:{title:'Símbolo Jaqueline Vieira',description:'Flor da identidade visual',name:'Símbolo'}})]})]}),
      new TableCell({width:{size:76,type:WidthType.PERCENTAGE},verticalAlign:VerticalAlign.CENTER,margins:{top:60,bottom:50,left:130,right:80},children:[new Paragraph({spacing:{after:0},children:[new TextRun({text:'Jaqueline',bold:true,font:'Arial Narrow',size:30,color:'6B6B70'})]}),new Paragraph({spacing:{after:70},children:[new TextRun({text:'Vieira',font:'Arial Narrow',size:28,color:'6B6B70'})]}),new Paragraph({children:[new TextRun({text:'PSICÓLOGA   ',bold:true,font:'Arial Narrow',size:14,color:'6B6B70'}),new TextRun({text:'CRP 06/191478',font:'Arial Narrow',size:14,color:'6B6B70'})]})]})
    ]})]}),
    paragraph('____________________________________________________________',{color:'839297',spaceAfter:260}),
    paragraph(item.titulo.toUpperCase(),{bold:true,heading:HeadingLevel.TITLE,align:AlignmentType.CENTER,spaceAfter:320,color:accent}),
  ];
  Object.entries(fields).filter(([,v])=>clean(v)).forEach(([k,v])=>out.push(new Paragraph({spacing:{after:100},children:[new TextRun({text:`${k}: `,bold:true,font:'Arial',size:21}),new TextRun({text:formatDates(v),font:'Arial',size:21})]})));
  sections.forEach(section=>{
    if(section.titulo)out.push(paragraph(section.titulo,{bold:true,heading:HeadingLevel.HEADING_1,spaceAfter:120,color:accent}));
    if(section.texto)clean(section.texto).split(/\n+/).filter(Boolean).forEach(x=>out.push(paragraph(x,{spaceAfter:150})));
  });
  out.push(paragraph(`Araraquara, ${new Date(item.emitido_em+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'})}.`,{align:AlignmentType.RIGHT,spaceAfter:300}));
  out.push(paragraph('À disposição para esclarecimentos de quaisquer dúvidas.',{align:AlignmentType.RIGHT,spaceAfter:420}));
  out.push(paragraph('________________________________________',{align:AlignmentType.RIGHT,spaceAfter:60,color:'839297'}));
  out.push(new Table({width:{size:100,type:WidthType.PERCENTAGE},borders:noBorders,rows:[new TableRow({children:[
    new TableCell({width:{size:82,type:WidthType.PERCENTAGE},verticalAlign:VerticalAlign.CENTER,children:[paragraph('Jaqueline Cristina Vieira',{bold:true,align:AlignmentType.RIGHT,spaceAfter:20,color:'66666B'}),paragraph('CRP 06/191478',{align:AlignmentType.RIGHT,spaceAfter:20}),paragraph('Psicóloga Clínica',{align:AlignmentType.RIGHT,spaceAfter:20}),paragraph('Pós-graduada em Terapia Cognitivo-Comportamental',{align:AlignmentType.RIGHT,spaceAfter:0})]}),
    new TableCell({width:{size:18,type:WidthType.PERCENTAGE},verticalAlign:VerticalAlign.BOTTOM,children:[new Paragraph({alignment:AlignmentType.CENTER,children:[new ImageRun({data:brandSymbol,transformation:{width:67,height:75},type:'png',altText:{title:'Símbolo Jaqueline Vieira',description:'Flor da identidade visual',name:'Símbolo'}})]})]})
  ]})]}));
  return out;
}

async function loadOne(id){
  const r=await supabase(`/rest/v1/documentos_clinicos?select=id,paciente_id,tipo,titulo,conteudo,emitido_em,criado_em&id=eq.${encodeURIComponent(id)}&arquivado_em=is.null&limit=1`),data=await json(r);
  if(!r.ok||!data?.[0])return null;
  return {...data[0],conteudo:decryptClinicalData(data[0].conteudo)};
}

export async function handleDocuments(req,res,user){
  try{
    if(req.method==='GET'&&req.query?.action==='psm-list'){
      const r=await supabase('/rest/v1/psm_modelos?select=id,publico,titulo,valor_individual,valor_pacote,criado_em&arquivado_em=is.null&order=criado_em.desc'),data=await json(r);
      return res.status(r.ok?200:r.status).json(r.ok?data:{error:'Não foi possível carregar as PSMs'});
    }
    if(req.method==='GET'&&req.query?.action==='export'){
      const id=clean(req.query.id);if(!uuid.test(id))return res.status(400).json({error:'Documento inválido'});
      const item=await loadOne(id);if(!item)return res.status(404).json({error:'Documento não encontrado'});
      const doc=new Document({sections:[{properties:{page:{margin:{top:900,right:900,bottom:900,left:900}}},footers:{default:new Footer({children:[paragraph('Jaqueline Cristina Vieira · CRP 06/191478',{align:AlignmentType.CENTER,spaceAfter:0})]})},children:documentChildren(item)}]});
      const buffer=await Packer.toBuffer(doc);
      res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition',`attachment; filename="documento-${item.tipo}.docx"`);
      return res.status(200).send(buffer);
    }
    if(req.method==='GET'&&req.query?.action==='export-pdf'){
      const id=clean(req.query.id);if(!uuid.test(id))return res.status(400).json({error:'Documento inválido'});
      const item=await loadOne(id);if(!item)return res.status(404).json({error:'Documento não encontrado'});
      const buffer=await renderDocumentoPdf(item);
      res.setHeader('Content-Type','application/pdf');
      res.setHeader('Content-Disposition',`attachment; filename="documento-${item.tipo}.pdf"`);
      return res.status(200).send(buffer);
    }
    if(req.method==='GET'&&req.query?.action==='psm-pdf'){
      const publico=clean(req.query.publico),individual=Number(req.query.individual),pacote=Number(req.query.pacote);
      if(!['adulto','infantil'].includes(publico)||!(individual>0)||!(pacote>0))return res.status(400).json({error:'Informe os valores da PSM'});
      const {renderPdf}=await import('./pdf.js');
      const buffer=publico==='infantil'?await psmInfantilWebpPdf(individual,pacote):await renderPdf(psmPdfHtml(publico,individual,pacote),{width:'12in',height:'8in',margin:{top:0,right:0,bottom:0,left:0}});
      res.setHeader('Content-Type','application/pdf');
      res.setHeader('Content-Disposition',`attachment; filename="psm-${publico}.pdf"`);
      return res.status(200).send(buffer);
    }
    if(req.method==='GET'){
      const paciente=clean(req.query?.paciente_id),filter=paciente?`&paciente_id=eq.${encodeURIComponent(paciente)}`:'';
      if(paciente&&!uuid.test(paciente))return res.status(400).json({error:'Paciente inválido'});
      const r=await supabase(`/rest/v1/documentos_clinicos?select=id,paciente_id,tipo,titulo,conteudo,emitido_em,criado_em&arquivado_em=is.null${filter}&order=criado_em.desc`),data=await json(r);
      if(!r.ok)return res.status(r.status).json({error:'Não foi possível carregar os documentos'});
      return res.status(200).json(data.map(x=>({...x,conteudo:decryptClinicalData(x.conteudo)})));
    }
    if(req.method==='POST'&&req.body?.action==='psm-save'){
      const publico=clean(req.body.publico),titulo=clean(req.body.titulo),valor_individual=Number(req.body.valor_individual),valor_pacote=Number(req.body.valor_pacote);
      if(!['adulto','infantil'].includes(publico)||!titulo||titulo.length>120||!(valor_individual>0)||!(valor_pacote>0))return res.status(400).json({error:'Preencha os valores da PSM'});
      const r=await supabase('/rest/v1/psm_modelos',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({publico,titulo,valor_individual,valor_pacote,criado_por:user.id})}),data=await json(r);
      return res.status(r.ok?201:r.status).json(r.ok?data[0]:{error:'Não foi possível salvar a PSM'});
    }
    if(req.method==='PATCH'&&req.query?.action==='psm-update'){
      // Editar uma PSM já salva (abrirPSM) e salvar de novo tem que
      // ATUALIZAR o mesmo registro, não duplicar -- mesmo bug encontrado
      // e corrigido em documentos/posts/apresentações (15/09/2026).
      const id=clean(req.query?.id);if(!uuid.test(id))return res.status(400).json({error:'PSM inválida'});
      const publico=clean(req.body.publico),titulo=clean(req.body.titulo),valor_individual=Number(req.body.valor_individual),valor_pacote=Number(req.body.valor_pacote);
      if(!['adulto','infantil'].includes(publico)||!titulo||titulo.length>120||!(valor_individual>0)||!(valor_pacote>0))return res.status(400).json({error:'Preencha os valores da PSM'});
      const r=await supabase(`/rest/v1/psm_modelos?id=eq.${encodeURIComponent(id)}&arquivado_em=is.null`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({publico,titulo,valor_individual,valor_pacote})}),data=await json(r);
      return res.status(r.ok&&data?.length?200:404).json(r.ok&&data?.length?data[0]:{error:'PSM não encontrada'});
    }
    if(req.method==='DELETE'&&req.query?.action==='psm-delete'){
      const id=clean(req.query?.id);if(!uuid.test(id))return res.status(400).json({error:'PSM inválida'});
      const r=await supabase(`/rest/v1/psm_modelos?id=eq.${encodeURIComponent(id)}&arquivado_em=is.null`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({arquivado_em:new Date().toISOString(),arquivado_por:user.id})}),data=await json(r);
      return res.status(r.ok&&data?.length?200:404).json(r.ok&&data?.length?{ok:true}:{error:'PSM não encontrada'});
    }
    if(req.method==='POST'&&req.body?.action==='generate'){
      const tipo=clean(req.body.tipo);
      let descricao=clean(req.body.descricao),descricaoComAnexo=null;
      const pedidoOriginalUsuario=descricao;
      // Anexo (PDF/DOCX/TXT) que a psicóloga sobe no chat pra pedir que a IA
      // considere um documento externo (ex.: laudo de outro profissional).
      // O texto é extraído aqui no servidor e embutido na própria descrição
      // enviada à IA -- assim o histórico enviado em turnos seguintes já
      // carrega o conteúdo do arquivo como texto simples, sem precisar
      // reenviar o arquivo binário a cada mensagem.
      if(req.body.anexo!=null){
        let extraido;
        try{extraido=await extrairTextoAnexo(req.body.anexo);}
        catch(e){if(e instanceof AnexoError)return res.status(e.status).json({error:e.message});throw e;}
        descricaoComAnexo=`Conteúdo do arquivo enviado (${extraido.nome}):\n"""\n${extraido.texto}\n"""\n\n${descricao||'Considere o conteúdo do arquivo acima ao elaborar o texto.'}`.slice(0,12000);
        descricao=descricaoComAnexo;
      }
      const temHistorico=Array.isArray(req.body.historico)&&req.body.historico.length>0;
      const minDescricao=temHistorico?2:10;
      if(!TYPES.has(tipo)||descricao.length<minDescricao||descricao.length>12000)return res.status(400).json({error:temHistorico?'Descreva melhor o ajuste desejado':'Descreva melhor o conteúdo desejado'});
      const historicoBruto=req.body.historico;
      if(historicoBruto!==undefined&&!Array.isArray(historicoBruto))return res.status(400).json({error:'Histórico inválido'});
      const historico=(historicoBruto||[]).map(h=>({papel:h?.papel==='assistente'?'assistente':'usuario',texto:clean(h?.texto).slice(0,4000)})).filter(h=>h.texto).slice(-20);
      const key=process.env.OPENAI_KEY;if(!key)return res.status(500).json({error:'Assistente de texto não configurado'});
      const preferenciaAprendida=await buscarPreferenciaTexto('documentos');
      // relatorio_psicologico tem dois formatos possíveis (selecionados pela
      // psicóloga no formulário) -- "estruturado" é o padrão consolidado,
      // sempre nas 4 seções fixas (a psicóloga confirmou 12/09/2026 que essa
      // estrutura já é consolidada em vários relatórios reais dela -- o
      // problema nunca foi a estrutura, foi a linguagem); "orientacao" é um
      // texto corrido mais curto, sem essa estrutura, pra quando o caso pede
      // uma orientação direta em vez de um relatório completo. O parser
      // separarTextoIA no frontend só quebra em seções quando o formato é
      // estruturado.
      const formato=clean(req.body.formato)==='orientacao'?'orientacao':'estruturado';
      // Regras de linguagem calibradas em 12/09/2026 a partir de 5
      // relatórios reais dela e conversas em que ela ajustou rascunhos do
      // ChatGPT: sempre separar relato de terceiros / observação clínica /
      // hipótese; nunca linguagem absoluta ("perfeito", "resolvido"),
      // equilibrando avanços e dificuldades mesmo em alta; preservar fala
      // textual da criança entre aspas quando tem valor clínico (só
      // converter fala inadequada/coloquial em discurso indireto); nunca
      // emoji, exclamação ou comentário sobre o texto (o ChatGPT fazia isso
      // nas respostas de chat, mas nunca aparece nos documentos finais
      // dela).
      // 14/09/2026: a psicóloga reportou que o texto gerado continuava sem
      // soar humano/acolhedor mesmo depois da calibração de 12/09 -- a causa
      // mais provável é que as regras de rigor clínico abaixo (diferenciar
      // relato/observação/hipótese, nunca linguagem absoluta etc.) são bem
      // mais específicas e "acionáveis" que a única frase sobre acolhimento
      // no PERFIL_JAQUELINE, então dominam a atenção de um modelo pequeno em
      // baixo esforço de raciocínio. A frase de acolhimento abaixo entra
      // primeiro e no mesmo bloco de instrução específica do tipo de
      // documento (não só no perfil genérico) para competir de igual pra
      // igual com as regras de rigor, em vez de ficar diluída.
      const tomHumanizado='Escreva com o mesmo cuidado e acolhimento humano que a psicóloga tem com as famílias: tom natural, próximo e sensível, como quem está de fato contando a história do acompanhamento -- nunca burocrático, seco ou em formato de checklist/formulário preenchido. Nunca use jargão de autoajuda ou termos genéricos/traduzidos que soem gerados por IA (ex.: "scripts", "gatilhos" solto, "ressignificar" repetido, "jornada", "mindset") -- use o vocabulário real da psicologia clínica brasileira. Isso não abre mão da precisão técnica: ';
      const linguagemRelatorio=' '+tomHumanizado+'diferencie com clareza o que é relato da responsável/família, observação clínica direta em sessão e hipótese ou inferência da profissional -- nunca apresente um relato de terceiros como fato observado. Ao descrever evolução, equilibre avanços com dificuldades ainda presentes; nunca descreva o paciente como "perfeito", "resolvido" ou sem nenhuma dificuldade, mesmo em relatório de alta. Transforme falas coloquiais, ofensivas ou inadequadas em discurso indireto, técnico e respeitoso -- mas preserve entre aspas uma fala textual do próprio paciente quando ela tiver valor clínico direto (ex.: expressão de medo, sofrimento ou um pensamento relatado), em vez de sempre converter para discurso indireto. Nunca use emojis, pontos de exclamação, ou qualquer comentário sobre o texto (sugestões, perguntas, "se quiser posso..."); escreva apenas o relatório em si, sem nada antes ou depois.';
      // "encaminhamento" (tipo novo, pedido 12/09/2026) tem sua própria
      // estrutura fixa -- diferente da do relatorio_psicologico -- extraída
      // de 5 encaminhamentos reais dela: Desenvolvimento do acompanhamento
      // (resumo do processo até aqui), Justificativa do encaminhamento
      // (por que precisa encaminhar, sem culpabilizar ninguém -- ela pede
      // "mais delicado" quando o motivo é sensível, ex.: conflito de
      // vínculo, comportamento inadequado do paciente), Fundamentação
      // ética (cita o Código de Ética Profissional do Psicólogo, Resolução
      // CFP nº 010/2005) e Encaminhamento (a recomendação em si, sempre
      // fechando com a disposição para interlocução com o próximo
      // profissional, mediante autorização dos responsáveis).
      const instructionsEncaminhamento=' Organize o texto exatamente nestas 4 seções, nesta ordem: "Desenvolvimento do acompanhamento" (resumo do processo terapêutico até aqui), "Justificativa do encaminhamento" (motivo do encaminhamento, de forma cuidadosa e não acusatória -- se o motivo envolver comportamento do paciente, conflito de vínculo ou situação delicada, use linguagem particularmente suave e indireta, sem culpabilizar ninguém), "Fundamentação ética" (cite o Código de Ética Profissional do Psicólogo, Resolução CFP nº 010/2005, relacionando-o ao motivo do encaminhamento) e "Encaminhamento" (a recomendação em si, terminando sempre com a disposição para interlocução com o profissional que dará continuidade ao caso, mediante autorização dos responsáveis). Cada título fica sozinho em uma linha, sem dois pontos, seguido do parágrafo.'+linguagemRelatorio;
      const instructions=(tipo==='relatorio_psicologico'
        ? (formato==='orientacao'
          ? 'Redija uma orientação psicológica profissional em português do Brasil: um texto corrido, direto e curto (no máximo 3 a 4 parágrafos curtos), sem dividir em seções tituladas (nada de "Descrição/Análise/Conclusão/Orientações" como títulos). Traga o contexto essencial em uma ou duas frases e o restante deve ser a orientação prática em si. Não invente diagnósticos, fatos ou dados. Use somente o relato fornecido.'+linguagemRelatorio
          : 'Redija um relatório psicológico profissional em português do Brasil, organizado em Descrição, Análise, Conclusão e Orientações. Não invente diagnósticos, fatos ou dados. Use somente o relato fornecido.'+linguagemRelatorio)
        : tipo==='encaminhamento'
        ? 'Redija um relatório de encaminhamento psicológico profissional em português do Brasil. Não invente diagnósticos, fatos ou dados. Use somente o relato fornecido.'+instructionsEncaminhamento
        : 'Redija uma solicitação formal de relatório escolar em português do Brasil. Explique o objetivo do acompanhamento e os aspectos que a escola deve descrever. Não invente fatos ou dados. '+tomHumanizado+'seja objetiva no pedido, sem soar burocrática ou seca.'
      )+'\n\n'+PERFIL_JAQUELINE
      // Reforço colocado por último (mais perto da conversa em si) porque a
      // psicóloga também reportou 14/09/2026 que pedidos de ajuste feitos no
      // chat (ex.: "deixa mais acolhedor") não estavam sendo respeitados —
      // o pedido mais recente pode entrar em tensão com as regras fixas
      // acima, e sem essa instrução explícita o modelo tende a priorizar as
      // regras "de sistema" em vez do pedido pontual da conversa.
      +(temHistorico?' Este pedido é um ajuste dentro de uma conversa em andamento -- priorize atender exatamente o que a psicóloga pediu na mensagem mais recente (tom, tamanho, ênfase ou qualquer outra mudança), mesmo que isso signifique se afastar um pouco do texto anterior, mantendo apenas a estrutura obrigatória do documento.':'')
      // Preferências aprendidas ao longo do tempo com esta psicóloga (ver
      // aprenderComAjusteChat) -- vêm por último, mais perto da geração em
      // si, para pesar tanto quanto o reforço de ajuste acima.
      +(preferenciaAprendida?'\n\nObservações de estilo já aprendidas com esta psicóloga em conversas anteriores (aplique com prioridade alta, junto com as regras acima):\n'+preferenciaAprendida:'');
      // Esta rota é servida por api/forms.js, que tem maxDuration:60 no
      // vercel.json -- 2 tentativas de 27s (+ backoff) cabem em ~54.5s, com
      // folga. O antigo {tentativas:2, timeoutMs:30000} podia chegar a
      // ~91s de retentativa interna, passando do limite real da função
      // (achado numa varredura depois que a geração de imagem estourou o
      // limite dela em produção).
      const input=historico.length
        ? [...historico.map(h=>({role:h.papel==='assistente'?'assistant':'user',content:h.texto})),{role:'user',content:descricao}]
        : descricao;
      const r=await fetchComRetentativa('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-5-mini',instructions,input,max_output_tokens:3000,reasoning:{effort:'low'}})},{tentativas:1,timeoutMs:27000});
      const data=await json(r);if(!r.ok){console.error('openai generate error:',r.status,data);return res.status(r.status).json({error:'Não foi possível elaborar o texto agora'});}
      const text=clean((data.output||[]).flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text);
      // gpt-5-mini é um modelo de raciocínio: com max_output_tokens baixo ele já
      // aconteceu de gastar todo o orçamento em raciocínio oculto e devolver
      // sucesso HTTP com texto de saída vazio, o que era reportado como sucesso
      // antes desta checagem existir. Tratamos texto vazio como falha real (502).
      if(!text){console.error('openai generate: empty output',JSON.stringify(data).slice(0,2000));return res.status(502).json({error:'A IA não retornou texto. Tente novamente.'});}
      // Aprendizado: só quando este pedido é um AJUSTE dentro de uma
      // conversa (não a descrição inicial de um caso). Aguardado antes de
      // responder -- ver aprenderComAjusteChat -- então some da latência
      // percebida por ela, mas é uma chamada rápida e o texto já foi
      // gerado, então um erro aqui nunca derruba a resposta principal.
      if(temHistorico)await aprenderComAjusteChat({contexto:'documentos',pedido:pedidoOriginalUsuario,atual:preferenciaAprendida,key,autorId:user.id});
      return res.status(200).json(descricaoComAnexo?{texto:text,descricaoComAnexo}:{texto:text});
    }
    if(req.method==='POST'){
      const paciente_id=clean(req.body?.paciente_id),tipo=clean(req.body?.tipo),titulo=clean(req.body?.titulo),emitido_em=clean(req.body?.emitido_em),conteudo=req.body?.conteudo;
      if(!uuid.test(paciente_id)||!TYPES.has(tipo)||!titulo||!/^\d{4}-\d{2}-\d{2}$/.test(emitido_em)||!conteudo||typeof conteudo!=='object')return res.status(400).json({error:'Preencha os campos obrigatórios'});
      if(JSON.stringify(conteudo).length>131072)return res.status(413).json({error:'Documento muito extenso'});
      const r=await supabase('/rest/v1/documentos_clinicos',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({paciente_id,tipo,titulo,emitido_em,conteudo:encryptClinicalData(conteudo),criado_por:user.id})}),data=await json(r);
      return res.status(r.ok?201:r.status).json(r.ok?{...data[0],conteudo}:{error:'Não foi possível salvar o documento'});
    }
    if(req.method==='PATCH'){
      // Usado por "Editar prompt": reabre o chat com o histórico salvo,
      // gera um novo texto e regrava o MESMO documento (em vez de criar um
      // duplicado). paciente_id/tipo não mudam num edit -- só titulo,
      // emitido_em e conteudo (que já carrega o promptHistorico atualizado).
      const id=clean(req.query?.id),titulo=clean(req.body?.titulo),emitido_em=clean(req.body?.emitido_em),conteudo=req.body?.conteudo;
      if(!uuid.test(id)||!titulo||!/^\d{4}-\d{2}-\d{2}$/.test(emitido_em)||!conteudo||typeof conteudo!=='object')return res.status(400).json({error:'Preencha os campos obrigatórios'});
      if(JSON.stringify(conteudo).length>131072)return res.status(413).json({error:'Documento muito extenso'});
      const r=await supabase(`/rest/v1/documentos_clinicos?id=eq.${encodeURIComponent(id)}&arquivado_em=is.null`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({titulo,emitido_em,conteudo:encryptClinicalData(conteudo)})}),data=await json(r);
      return res.status(r.ok&&data?.length?200:404).json(r.ok&&data?.length?{...data[0],conteudo}:{error:'Documento não encontrado'});
    }
    if(req.method==='DELETE'){
      const id=clean(req.query?.id);if(!uuid.test(id))return res.status(400).json({error:'Documento inválido'});
      const r=await supabase(`/rest/v1/documentos_clinicos?id=eq.${encodeURIComponent(id)}&arquivado_em=is.null`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({arquivado_em:new Date().toISOString(),arquivado_por:user.id})}),data=await json(r);
      return res.status(r.ok&&data?.length?200:404).json(r.ok&&data?.length?{ok:true}:{error:'Documento não encontrado'});
    }
    return res.status(405).json({error:'Method not allowed'});
  }catch(error){console.error('documents handler error:',error);return res.status(500).json({error:'Não foi possível processar o documento'});}
}
