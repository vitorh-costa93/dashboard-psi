import {readFileSync} from 'node:fs';
import {Document,Packer,Paragraph,TextRun,ImageRun,HeadingLevel,AlignmentType,Footer,Table,TableRow,TableCell,WidthType,VerticalAlign,BorderStyle} from 'docx';
import {supabase} from '../api/_auth.js';
import {decryptClinicalData,encryptClinicalData} from '../api/_clinical-crypto.js';

const TYPES=new Set(['termo_infantil','termo_adulto','orcamento','recibo','relatorio_psicologico','solicitacao_escolar','declaracao_comparecimento']);
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
p{margin:0 0 12px;white-space:pre-wrap;text-align:justify;orphans:3;widows:3}
.doc-closing{break-inside:avoid;break-before:avoid}
.doc-signature{position:relative;text-align:right;margin-top:74px;padding-top:14px;padding-right:92px;min-height:112px}
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
  const closing=`<div class="doc-closing"><p style="text-align:right;margin-top:42px">Araraquara, ${longDate(item.emitido_em)}.</p><p style="text-align:right">À disposição para esclarecimentos de quaisquer dúvidas.</p><div class="doc-signature"><img src="${brandSymbolUri}" alt=""><p><strong>Jaqueline Cristina Vieira</strong></p><p>CRP 06/191478</p><p>Psicóloga Clínica</p><p>Pós-graduada em Terapia Cognitivo-Comportamental</p></div></div>`;
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
function psmEmotionDiagramHtml(){
  const nodes=[['Pensamentos','#6e9dc4','☁'],['Comportamento','#80aa6a','↗'],['Emoções','#e9b92f','♥'],['Situação','#a784cc','?']];
  return `<div class="psm-emotion-diagram"><div class="psm-brain-core"><span>🧠</span><strong>TCC</strong></div>${nodes.map((n,i)=>`<div class="psm-emotion-node n${i}" style="--node:${n[1]}"><span>${n[2]}</span><b>${n[0]}</b></div>`).join('')}<div class="psm-flow f1">→</div><div class="psm-flow f2">↓</div><div class="psm-flow f3">←</div><div class="psm-flow f4">↑</div></div>`;
}
function psmAbordagemHtml(publico){
  const t=PSM_TEXT[publico]||PSM_TEXT.adulto,w=psmWrap(publico,0);
  return `<div class="${w.cls}"${w.style}><img class="psm-leaf psm-leaf-tr" src="${leafTopRightUri}" alt="">${psmHeader('Abordagem utilizada',publico,0)}
<div class="psm-abordagem-grid">
<div class="psm-abordagem-text"><p class="psm-kicker">Terapia Cognitivo-Comportamental</p>${t.abordagem.map(p=>`<p>${escHtml(p)}</p>`).join('')}</div>
${publico==='infantil'?psmEmotionDiagramHtml():`<img class="psm-abordagem-brain" src="${brainDiagramUri[publico]||brainDiagramUri.adulto}" alt="Como a TCC pode ajudar">`}
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
function psmClosingHtml(publico='adulto'){
  const kids=publico==='infantil'?`<div class="psm-closing-cast">${PSM_TOYS.map(e=>`<span class="psm-icon-badge psm-emo-badge" style="--emo:${e.fg};--emo-bg:${e.bg}">${e.icon}</span>`).join('')}</div>`:'';
  return `<div class="psm-closing${publico==='infantil'?' psm-closing-kids':''}">${kids}
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

function psmPdfHtmlKidsEmotion(individual,pacote){
  const asset=name=>dataUri(readFileSync(new URL(`../assets/psm/infantil-emocoes/${name}`,import.meta.url)),'image/png');
  const A={coverMain:asset('cover-main.png'),coverBlue:asset('cover-blue.png'),yellow:asset('values-mascot.png'),tcc:asset('tcc-art.png'),online:asset('online-art.png'),presScene:asset('presencial-scene.png'),presCast:asset('presencial-cast.png'),agenda:asset('agenda-mascot.png'),payment:asset('payment-mascot.png'),contact:asset('contact-art.png'),socialMain:asset('social-main.png'),socialLeft:asset('social-left.png'),close:asset('closing-art.png')};
  const v1=valorBR(individual)||'R$ 0,00',v4=valorBR(pacote)||'R$ 0,00',t=PSM_TEXT.infantil,regras=t.agendamento,pag=PSM_PAGAMENTO;
  const ICON_WIFI='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 8.5a13 13 0 0 1 16 0"/><path d="M7 12.2a8.4 8.4 0 0 1 10 0"/><path d="M10 15.8a3.8 3.8 0 0 1 4 0"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/></svg>';
  const ICON_HOME='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9h12v-9"/></svg>';
  const ICON_CLOCK='<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></svg>';
  const ICON_CAL='<svg viewBox="0 0 24 24"><rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M4 10h16M8 3.5v4M16 3.5v4"/><path d="M8 14h2M12 14h2M16 14h1.5M8 17h2M12 17h2"/></svg>';
  const ICON_BELL='<svg viewBox="0 0 24 24"><path d="M7 10a5 5 0 0 1 10 0v4l2 2H5l2-2z"/><path d="M10 19h4"/></svg>';
  const ICON_ALERT='<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v6M12 17h.01"/></svg>';
  const ICON_HAND='<svg viewBox="0 0 24 24"><path d="m3 9 4-3 4 3-4 4zM21 9l-4-3-4 3 4 4z"/><path d="m8 13 3 3c1 1 2.5 1 3.5 0l2.5-3M6 15l3 3M18 15l-3 3"/></svg>';
  const ICON_COIN='<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M14.5 8.5c-.8-.7-1.6-1-2.5-1-1.4 0-2.5.8-2.5 2s1 1.8 2.8 2.3c1.6.4 2.7 1 2.7 2.3 0 1.4-1.2 2.4-2.9 2.4-1.1 0-2.2-.4-3-1.1M12 5.8v12.4"/></svg>';
  const ICON_DOC='<svg viewBox="0 0 24 24"><path d="M6 3.5h8l4 4V20H6z"/><path d="M14 3.5V8h4M9 12h6M9 15h6"/></svg>';
  const ICON_PHONE='<svg viewBox="0 0 24 24"><path d="M8.1 4.5 5.5 6.2c-.9.6-.8 2 .1 3.8 1.5 3.1 4 5.6 7.1 7.1 1.8.9 3.2 1 3.8.1l1.7-2.6-3.7-2.1-1.4 1.4c-1.8-.9-3.2-2.3-4.1-4.1l1.4-1.4z"/></svg>';
  const ICON_MAIL='<svg viewBox="0 0 24 24"><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4.5 7 7.5 6 7.5-6"/></svg>';
  const ICON_INST='<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.4" cy="6.8" r=".9" fill="currentColor" stroke="none"/></svg>';
  const icon=svg=>`<span class="em-icon">${svg}</span>`;
  const shell=(cls,n,inner)=>`<section class="slide"><div class="psm-emov2 ${cls}"><span class="em-num">${n}</span><i class="em-blob-bl"></i><i class="em-blob-br"></i>${inner}</div></section>`;
  const list=(ico,text)=>`<div class="item">${icon(ico)}<span>${escHtml(text)}</span></div>`;
  const slides=[
    shell('psm-emov2-cover',1,`<span class="em-star" style="left:31cqw;top:4.7cqw">★</span><span class="em-star" style="left:42cqw;top:3.7cqw">★</span><span class="em-heart" style="left:26cqw;top:7cqw">♥</span><div class="em-copy"><div class="em-name">Jaqueline<br>Vieira</div><div class="em-role">Psicóloga Clínica</div><div class="em-crp">CRP 06/191478</div></div><img class="em-art cover-main" src="${A.coverMain}"><img class="em-art cover-blue" src="${A.coverBlue}"><img class="em-art cover-yellow" src="${A.yellow}">`),
    shell('psm-emov2-tcc',2,`<div class="em-head"><h2 class="em-title">Abordagem Utilizada</h2></div><div class="em-copy"><div class="em-kicker">Terapia Cognitivo-Comportamental</div><div class="em-body">${t.abordagem.map(x=>`<p>${escHtml(x)}</p>`).join('')}</div></div><span class="em-star" style="right:24cqw;top:8.5cqw">★</span><img class="em-art" src="${A.tcc}"><span class="diagram-label dl1">Pensamentos</span><span class="diagram-label dl2">Comportamento</span><span class="diagram-label dl3">Emoções</span><span class="diagram-label dl4">Situação</span><div class="em-caption">Como a TCC<br>pode ajudar?</div>`),
    shell('psm-emov2-online',3,`<div class="em-head"><h2 class="em-title">Terapia Online</h2></div><div class="em-copy em-body">As sessões duram <strong>50 min</strong> e são realizadas pelo Google Meet, através de um link criado por mim e enviado na hora agendada, pelo Whatsapp.</div><div class="em-art-wrap"></div><img class="em-art" src="${A.online}"><div class="meet-bubble"><span class="meet-mark"><i class="m1"></i><i class="m2"></i><i class="m3"></i><i class="m4"></i></span></div><div class="req-title">Pré-Requisitos</div><div class="reqs"><div class="req">${icon(ICON_WIFI)}<span>Internet com<br>boa conexão</span></div><div class="req">${icon(ICON_HOME)}<span>Lugar confortável<br>e reservado</span></div></div>`),
    shell('psm-emov2-pres',4,`<div class="em-head"><h2 class="em-title">Terapia Presencial</h2></div><div class="em-copy em-body">As sessões duram <strong>50 min</strong> e são realizadas no seguinte endereço:<div class="address"><strong>${escHtml(t.endereco.nome)}</strong>${t.endereco.linhas.map(x=>`<div>${escHtml(x)}</div>`).join('')}</div></div><div class="scene-wash"></div><img class="scene-art" src="${A.presScene}"><img class="cast-art" src="${A.presCast}">`),
    shell('psm-emov2-list',5,`<div class="em-head"><h2 class="em-title">Observações agendamento</h2></div><span class="em-star spark-a">★</span><span class="em-star spark-b">★</span><div class="items">${list(ICON_CLOCK,regras[0])}${list(ICON_CAL,regras[1])}${list(ICON_BELL,regras[2])}${list(ICON_ALERT,regras[3])}</div><img class="em-art" src="${A.agenda}">`),
    shell('psm-emov2-list pay',6,`<div class="em-head"><h2 class="em-title">Observações pagamento</h2></div><span class="em-heart heart-a">♥</span><div class="items">${list(ICON_HAND,pag[0])}${list(ICON_COIN,pag[1])}${list(ICON_CAL,pag[2])}${list(ICON_DOC,pag[3])}</div><img class="em-art" src="${A.payment}">`),
    shell('psm-emov2-values',7,`<div class="em-head"><h2 class="em-title">Valores</h2></div><span class="em-star v1">★</span><span class="em-star v2">★</span><span class="em-heart v3">♥</span><div class="cards"><div class="price"><span>1 sessão</span><strong>${escHtml(v1)}</strong></div><div class="price"><span>Pacote com<br>4 sessões</span><strong>${escHtml(v4)}</strong></div></div><div class="pay"><h3>Pagamento</h3><div class="pix">Pix: 57.062.579/0001-34</div><p>Gentileza enviar o comprovante de pagamento até o dia da sessão a ser realizada.</p></div><img class="em-art" src="${A.yellow}">`),
    shell('psm-emov2-contact',8,`<div class="em-head"><h2 class="em-title">Agendamento</h2></div><span class="em-heart c1">♥</span><span class="em-star c2">★</span><div class="copy"><h3>Agendamento e dúvidas</h3><div class="line">${icon(ICON_PHONE)}<span>(16) 99746-7348</span></div><div class="line">${icon(ICON_MAIL)}<span>psi.jaquelinev@gmail.com</span></div></div><img class="em-art" src="${A.contact}">`),
    shell('psm-emov2-social',9,`<div class="em-head"><h2 class="em-title">Me Acompanhe</h2></div><div class="handle">${icon(ICON_INST)}<span>@psi_jaquelinevieira</span></div><span class="em-heart soc1">♥</span><span class="em-star soc2">★</span><img class="em-art social-main" src="${A.socialMain}"><img class="em-art social-left" src="${A.socialLeft}">`),
    shell('psm-emov2-close',10,`<div class="thanks">OBRIGADA!</div><div class="name">Jaqueline<br>Vieira</div><div class="badge">PSICÓLOGA</div><div class="crp">CRP 06/191478</div><span class="em-heart cl1">♥</span><span class="em-heart cl2">♥</span><span class="em-star cl3">★</span><img class="em-art" src="${A.close}">`)
  ].join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>PSM Infantil - Pacote ${escHtml(v4)}</title><style>
@font-face{font-family:'Agrandir Tight';src:url('${fontUri('agrandir-tight.ttf')}')}@font-face{font-family:'Agrandir Tight';src:url('${fontUri('agrandir-tight-bold.ttf')}');font-weight:700}@font-face{font-family:'Agrandir Values';src:url('${fontUri('agrandir-tight-values-bold.ttf')}');font-weight:700}@font-face{font-family:'Adlery Pro';src:url('${fontUri('adlery-pro-swash.ttf')}')}
@page{size:12in 8in;margin:0}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}html,body{margin:0;padding:0;background:#fff}.slide{width:12in;height:8in;position:relative;overflow:hidden;break-after:page}.slide:last-child{break-after:auto}.slide .psm-emov2{width:100%;height:100%}
/* PSM Infantil “Emoções” v4 — layout, tipografia, cards, ícones e textos nativos; imagens somente para as ilustrações. */
.psm-emov2{position:relative;width:100%;height:100%;overflow:hidden;background:#fef6ea;color:#262226;font-family:'Agrandir Tight','DM Sans',Arial,sans-serif;container-type:inline-size;isolation:isolate}
.psm-emov2 *{box-sizing:border-box}.psm-emov2:before,.psm-emov2:after{content:'';position:absolute;z-index:0;pointer-events:none}
.psm-emov2:before{width:21cqw;height:19cqw;left:-8cqw;top:-8cqw;border-radius:48% 52% 55% 45%;background:#eadff3}.psm-emov2:after{width:21cqw;height:19cqw;right:-7cqw;top:-8cqw;border-radius:48% 52% 55% 45%;background:#fbd8c8}
.psm-emov2 .em-blob-bl{position:absolute;z-index:0;left:-7cqw;bottom:-8cqw;width:22cqw;height:18cqw;border-radius:55% 45% 45% 55%;background:#dcefe6}.psm-emov2 .em-blob-br{position:absolute;z-index:0;right:-8cqw;bottom:-9cqw;width:23cqw;height:19cqw;border-radius:48% 52% 60% 40%;background:#f4dce9}
.psm-emov2 .em-num{position:absolute;z-index:10;left:2.2cqw;top:2.2cqw;width:4.2cqw;height:4.2cqw;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#73528e;color:#fff;font:700 1.65cqw 'Agrandir Tight',sans-serif;box-shadow:0 .3cqw .8cqw rgba(84,50,103,.15)}
.psm-emov2 .em-title{position:relative;z-index:3;margin:0;color:#70468d;font:400 5.15cqw/.95 'Adlery Pro','Playfair Display',serif;letter-spacing:.01em}.psm-emov2 .em-kicker{color:#0f8782;font:700 2.05cqw/1.2 'Agrandir Tight',sans-serif}.psm-emov2 .em-body{color:#272327;font:400 1.52cqw/1.48 'DM Sans',Arial,sans-serif}.psm-emov2 .em-body strong{font-weight:700}.psm-emov2 .em-head{position:absolute;z-index:5;left:6.2cqw;top:5.2cqw}.psm-emov2 .em-art{position:absolute;z-index:2;display:block;object-fit:contain}.psm-emov2 .em-star,.psm-emov2 .em-heart{position:absolute;z-index:1;line-height:1}.psm-emov2 .em-star{color:#edc14a;font-size:2.1cqw}.psm-emov2 .em-heart{color:#ed7896;font-size:2.4cqw}
.psm-emov2 .em-icon{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto}.psm-emov2 .em-icon svg{width:100%;height:100%;display:block;fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round}
/* capa */
.psm-emov2-cover .em-copy{position:absolute;z-index:6;left:5.3cqw;top:18.4cqw;width:39cqw}.psm-emov2-cover .em-name{color:#70468d;font:400 8cqw/.9 'Adlery Pro','Playfair Display',serif}.psm-emov2-cover .em-role{display:inline-block;margin-top:2.1cqw;padding:1.02cqw 2.35cqw;border-radius:999px;background:#ee7d9a;color:#fff;font:700 2.05cqw 'Agrandir Tight',sans-serif}.psm-emov2-cover .em-crp{margin-top:1.45cqw;width:19cqw;text-align:center;color:#0f8782;font:700 1.7cqw 'Agrandir Tight',sans-serif}.psm-emov2-cover .cover-main{right:-.4cqw;bottom:-.2cqw;width:55cqw;height:65cqw}.psm-emov2-cover .cover-blue{left:19.7cqw;bottom:8.2cqw;width:12.5cqw;height:18.5cqw;z-index:4;filter:drop-shadow(0 .4cqw .6cqw rgba(80,60,50,.08))}.psm-emov2-cover .cover-yellow{left:15.2cqw;bottom:-.3cqw;width:17.5cqw;height:22cqw;z-index:5;filter:drop-shadow(0 .4cqw .6cqw rgba(80,60,50,.08))}
/* tcc */
.psm-emov2-tcc .em-head{left:5.4cqw;top:4.8cqw;padding:.35cqw 1.5cqw .45cqw;border-radius:999px;background:#eadff3}.psm-emov2-tcc .em-title{font-size:4.2cqw}.psm-emov2-tcc .em-copy{position:absolute;z-index:4;left:5cqw;top:17.6cqw;width:49.5cqw}.psm-emov2-tcc .em-kicker{font-size:2cqw;margin-bottom:2cqw}.psm-emov2-tcc .em-body{font-size:1.37cqw;line-height:1.48}.psm-emov2-tcc .em-art{right:3.8cqw;top:17.3cqw;width:35cqw;height:35.5cqw}.psm-emov2-tcc .diagram-label{position:absolute;z-index:5;color:#201f20;font:700 1.12cqw 'Agrandir Tight',sans-serif}.psm-emov2-tcc .dl1{right:27.2cqw;top:13.5cqw}.psm-emov2-tcc .dl2{right:8.1cqw;top:13.5cqw}.psm-emov2-tcc .dl3{right:7.2cqw;top:51.9cqw}.psm-emov2-tcc .dl4{right:28.2cqw;top:51.9cqw}.psm-emov2-tcc .em-caption{position:absolute;z-index:5;right:5.8cqw;bottom:3.6cqw;color:#0f8782;font:400 3.1cqw/.96 'Adlery Pro',serif;text-align:center}
/* online */
.psm-emov2-online .em-copy{position:absolute;z-index:4;left:4.4cqw;top:18.6cqw;width:43cqw}.psm-emov2-online .em-body{font-size:1.53cqw;line-height:1.48}.psm-emov2-online .em-art-wrap:before{content:'';position:absolute;z-index:1;right:-5cqw;top:9cqw;width:57cqw;height:58cqw;border-radius:50% 0 0 50%;background:#eef6f2}.psm-emov2-online .em-art{right:0;bottom:-.2cqw;width:47.5cqw;height:63cqw}.psm-emov2-online .meet-bubble{position:absolute;z-index:6;left:47.4cqw;top:29cqw;width:7.3cqw;height:7.3cqw;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 .4cqw 1.2cqw rgba(72,66,60,.09)}.psm-emov2-online .meet-mark{position:relative;width:4.1cqw;height:3.2cqw}.psm-emov2-online .meet-mark i{position:absolute;display:block}.psm-emov2-online .meet-mark .m1{left:0;top:.45cqw;width:2.35cqw;height:2.3cqw;background:#2e72d2}.psm-emov2-online .meet-mark .m2{left:.55cqw;top:0;width:1.75cqw;height:1.2cqw;background:#f6b91b}.psm-emov2-online .meet-mark .m3{left:.55cqw;bottom:0;width:1.75cqw;height:1.1cqw;background:#e9564a}.psm-emov2-online .meet-mark .m4{right:0;top:.4cqw;border-top:1.2cqw solid transparent;border-bottom:1.2cqw solid transparent;border-right:0;border-left:1.45cqw solid #29a95f}.psm-emov2-online .req-title{position:absolute;z-index:5;left:7.2cqw;top:44.4cqw;color:#70468d;font:400 3.7cqw 'Adlery Pro',serif}.psm-emov2-online .reqs{position:absolute;z-index:5;left:4.5cqw;bottom:3.7cqw;display:flex;gap:2.5cqw}.psm-emov2-online .req{width:16.8cqw;height:14.6cqw;border-radius:2.4cqw;background:#fff0c4;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;font:700 1.12cqw/1.35 'DM Sans',Arial,sans-serif;box-shadow:0 .35cqw 1cqw rgba(90,70,25,.04)}.psm-emov2-online .req .em-icon{width:5cqw;height:5cqw;margin-bottom:.8cqw;color:#42a49f}.psm-emov2-online .req:nth-child(2) .em-icon{color:#d87947}
/* presencial */
.psm-emov2-pres .em-copy{position:absolute;z-index:6;left:4.6cqw;top:18.6cqw;width:45cqw}.psm-emov2-pres .em-body{font-size:1.5cqw}.psm-emov2-pres .address{margin-top:2.25cqw;padding:1.9cqw 2.25cqw;border-radius:2.2cqw;background:rgba(254,246,234,.96)}.psm-emov2-pres .address strong{display:block;color:#70468d;font:700 2.05cqw 'Agrandir Tight',sans-serif;margin-bottom:.55cqw}.psm-emov2-pres .scene-art{position:absolute;z-index:1;right:0;top:0;width:49cqw;height:49cqw;object-fit:cover;object-position:right top}.psm-emov2-pres .cast-art{position:absolute;z-index:5;right:1.1cqw;bottom:1.5cqw;width:50cqw;height:17.2cqw;object-fit:contain;filter:drop-shadow(0 .35cqw .7cqw rgba(80,60,45,.08))}.psm-emov2-pres .scene-wash{position:absolute;z-index:2;right:0;top:0;width:50cqw;height:100%;background:linear-gradient(90deg,rgba(254,246,234,.72) 0%,rgba(254,246,234,.10) 22%,rgba(255,229,184,.03) 100%)}
/* lists */
.psm-emov2-list .items{position:absolute;z-index:4;left:4.6cqw;top:16.8cqw;width:72cqw;display:flex;flex-direction:column;gap:1.65cqw}.psm-emov2-list .item{display:grid;grid-template-columns:3.1cqw 1fr;gap:1.25cqw;align-items:center;color:#262326;font:400 1.4cqw/1.4 'DM Sans',Arial,sans-serif}.psm-emov2-list .item .em-icon{width:3cqw;height:3cqw;color:#d47779}.psm-emov2-list .item .em-icon svg{stroke-width:1.8}.psm-emov2-list .em-art{right:3.3cqw;bottom:1.7cqw;width:20cqw;height:23cqw;filter:drop-shadow(0 .35cqw .7cqw rgba(80,60,45,.08))}.psm-emov2-list.pay .item .em-icon{color:#d09545}.psm-emov2-list.pay .em-art{right:3cqw;bottom:1.2cqw;width:17cqw;height:25cqw}.psm-emov2-list.pay .items{width:73cqw}.psm-emov2-list .spark-a{left:35cqw;top:5cqw}.psm-emov2-list .spark-b{right:7cqw;top:8cqw}.psm-emov2-list .heart-a{right:12cqw;top:4cqw}
/* valores */
.psm-emov2-values .em-head{left:31cqw;top:4.2cqw}.psm-emov2-values .cards{position:absolute;z-index:4;left:27cqw;top:18.5cqw;width:58cqw;display:grid;grid-template-columns:1fr 1.15fr;gap:2.6cqw}.psm-emov2-values .price{background:#ffedaa;border-radius:2.5cqw;padding:2cqw 1.5cqw;text-align:center;box-shadow:0 .35cqw 1.1cqw rgba(105,72,12,.05)}.psm-emov2-values .price span{display:block;color:#2d2927;font:700 1.4cqw/1.15 'Agrandir Tight',sans-serif}.psm-emov2-values .price strong{display:block;margin-top:.7cqw;color:#10857f;font:700 3.25cqw/1 'Agrandir Values','Agrandir Tight',sans-serif}.psm-emov2-values .pay{position:absolute;z-index:4;left:25cqw;top:43.3cqw;width:62cqw;border-radius:2.8cqw;background:#dfeee7;padding:1.55cqw 3cqw;text-align:center}.psm-emov2-values .pay h3{margin:0 0 .5cqw;color:#70468d;font:400 3.2cqw 'Adlery Pro',serif}.psm-emov2-values .pay .pix{color:#10857f;font:700 2.2cqw 'Agrandir Tight',sans-serif}.psm-emov2-values .pay p{margin:.5cqw 0 0;font:400 1.18cqw/1.3 'DM Sans',Arial,sans-serif}.psm-emov2-values .em-art{left:1cqw;bottom:-.2cqw;width:19.5cqw;height:30cqw;filter:drop-shadow(0 .35cqw .7cqw rgba(80,60,45,.08))}.psm-emov2-values .em-star.v1{left:6cqw;top:19cqw}.psm-emov2-values .em-star.v2{left:36cqw;top:5.5cqw}.psm-emov2-values .em-heart.v3{left:12cqw;top:12cqw}
/* contato */
.psm-emov2-contact .copy{position:absolute;z-index:5;left:4.6cqw;top:19cqw;width:44cqw}.psm-emov2-contact .copy h3{margin:0 0 3.3cqw;color:#10857f;font:700 2.2cqw 'Agrandir Tight',sans-serif}.psm-emov2-contact .line{display:flex;align-items:center;gap:1.2cqw;margin:2cqw 0;color:#252226;font:400 1.9cqw 'DM Sans',Arial,sans-serif}.psm-emov2-contact .line .em-icon{width:2.6cqw;height:2.6cqw;color:#4aa88c}.psm-emov2-contact .em-art{right:0;bottom:0;width:54cqw;height:60cqw}.psm-emov2-contact .em-heart.c1{right:29cqw;top:7cqw}.psm-emov2-contact .em-star.c2{right:20cqw;top:10cqw;color:#5abfc6}
/* social */
.psm-emov2-social .handle{position:absolute;z-index:6;left:6.7cqw;top:15.5cqw;display:flex;align-items:center;gap:1cqw;color:#e76386;font:700 2.5cqw 'Agrandir Tight',sans-serif}.psm-emov2-social .handle .em-icon{width:3.2cqw;height:3.2cqw}.psm-emov2-social .social-main{right:5cqw;bottom:-.1cqw;width:54cqw;height:57cqw}.psm-emov2-social .social-left{left:7cqw;bottom:1.5cqw;width:31cqw;height:28cqw;z-index:5;filter:drop-shadow(0 .35cqw .7cqw rgba(80,60,45,.08))}.psm-emov2-social .em-heart.soc1{right:18cqw;top:8cqw}.psm-emov2-social .em-star.soc2{right:12cqw;top:24cqw}
/* fechamento */
.psm-emov2-close .thanks{position:absolute;z-index:6;left:4.7cqw;top:11.5cqw;color:#70468d;font:700 6.7cqw/.95 'Agrandir Tight',sans-serif;letter-spacing:-.03em}.psm-emov2-close .name{position:absolute;z-index:6;left:7cqw;top:31cqw;color:#eb6f93;font:400 5.2cqw/.92 'Adlery Pro',serif}.psm-emov2-close .badge{position:absolute;z-index:6;left:7cqw;top:49cqw;padding:.9cqw 2.4cqw;border-radius:999px;background:#6db8b2;color:#fff;font:700 1.5cqw 'Agrandir Tight',sans-serif;letter-spacing:.08em}.psm-emov2-close .crp{position:absolute;z-index:6;left:9.3cqw;top:56cqw;color:#10857f;font:700 1.5cqw 'Agrandir Tight',sans-serif}.psm-emov2-close .em-art{right:0;bottom:-.1cqw;width:62cqw;height:48cqw;filter:drop-shadow(0 .45cqw .8cqw rgba(80,60,45,.07))}.psm-emov2-close .em-heart.cl1{right:19cqw;top:7cqw}.psm-emov2-close .em-heart.cl2{right:8cqw;top:14cqw}.psm-emov2-close .em-star.cl3{right:27cqw;top:21cqw}

</style></head><body>${slides}</body></html>`;
}
function psmPdfHtmlNew(publico,individual,pacote){
  if(publico==='infantil')return psmPdfHtmlKidsEmotion(individual,pacote);
  const valorBR=v=>{const n=Number(String(v||'').replace(',','.'));return Number.isFinite(n)?n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'';};
  const slides=Array.from({length:10},(_,i)=>{
    if(i===0)return `<section class="psm-slide psm-slide-html">${psmCoverHtml(publico)}</section>`;
    if(i===9)return `<section class="psm-slide psm-slide-html">${psmClosingHtml(publico)}</section>`;
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
.psm-kids{background:linear-gradient(135deg,#fffaf2 0%,#fffdf9 60%,#f7f2ff 100%)}
.psm-cover-wrap.psm-kids{background:radial-gradient(circle at 10% 12%,#ede3f7 0 12%,transparent 12.3%),radial-gradient(circle at 88% 9%,#ffdcd0 0 14%,transparent 14.3%),radial-gradient(circle at 8% 92%,#dff2e9 0 14%,transparent 14.3%),#fffaf2}
.psm-cover-wrap.psm-kids .psm-cover{justify-content:flex-start;padding:0 .9in;gap:.4in}.psm-cover-wrap.psm-kids .psm-cover-logo{display:none}.psm-cover-wrap.psm-kids .psm-cover-name{font-family:'Baloo 2',cursive;color:#67438b;font-size:58pt;line-height:.95}.psm-cover-wrap.psm-kids .psm-cover-role{color:#fff;background:#d86f8a;border-radius:999px;padding:.10in .23in;width:max-content;letter-spacing:.02em;font-family:'Nunito',sans-serif;font-size:12pt}.psm-cover-wrap.psm-kids .psm-cover-role span{display:none}.psm-cover-wrap.psm-kids .psm-cover-sub{font-family:'Nunito',sans-serif;font-weight:800;color:#14827c;font-size:17pt;margin-top:.15in}
.psm-cover-cast{z-index:2;right:.55in;bottom:.45in;gap:.12in}.psm-cover-cast .psm-emo-badge{background:var(--emo-bg);border-radius:45%;padding:.08in;filter:drop-shadow(0 4px 4px rgba(0,0,0,.08))}
.psm-kids .psm-content-head h2{color:#67438b}.psm-kids .psm-kicker{color:#14827c}.psm-kids .psm-content p,.psm-kids .psm-content-lead,.psm-kids .psm-list li,.psm-kids .psm-req-item span,.psm-kids .psm-address-text{font-family:'Nunito',sans-serif;font-style:normal;color:#302a2a}.psm-kids .psm-content p{font-size:13pt;line-height:1.55}.psm-kids .psm-content-lead{font-size:17pt;line-height:1.55}.psm-kids .psm-list li{font-size:13.5pt;line-height:1.45}.psm-kids .psm-req-item,.psm-kids .psm-address-block,.psm-kids .psm-contact-block{background:rgba(255,255,255,.75);border:1px solid rgba(103,67,139,.08);border-radius:.2in;padding:.2in;box-shadow:0 .04in .12in rgba(74,48,89,.06)}
.psm-kids .psm-price-item{background:#fff1bd;border-radius:.2in;padding:.2in .35in;min-width:2.8in}.psm-kids .psm-price-div{display:none}.psm-kids .psm-price-row{gap:.35in}.psm-kids .psm-price-num,.psm-kids .psm-price-num-lg{font-size:29pt;color:#14827c}.psm-kids .psm-pay{background:#e7f2ed;border-radius:.2in;padding:.2in .4in;max-width:7.2in;margin:0 auto}
.psm-emotion-diagram{position:relative;width:3.6in;height:3.3in;flex:0 0 3.6in}.psm-brain-core{position:absolute;left:1.2in;top:.95in;width:1.2in;height:1.2in;border-radius:48%;background:#eadff6;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#67438b}.psm-brain-core span{font-size:30pt}.psm-brain-core strong{font:800 10pt 'Nunito',sans-serif}.psm-emotion-node{position:absolute;width:.95in;height:.95in;border-radius:48%;background:#fff;border:2px solid var(--node);display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--node)}.psm-emotion-node span{font-size:17pt}.psm-emotion-node b{font:800 6.5pt 'Nunito',sans-serif;color:#403b3b;text-align:center}.psm-emotion-node.n0{left:.2in;top:.1in}.psm-emotion-node.n1{right:.1in;top:.2in}.psm-emotion-node.n2{right:.15in;bottom:.1in}.psm-emotion-node.n3{left:.1in;bottom:.1in}.psm-flow{position:absolute;font:800 16pt 'Nunito',sans-serif;color:#90849b}.psm-flow.f1{left:1.15in;top:.45in}.psm-flow.f2{right:.62in;top:1.2in}.psm-flow.f3{right:1.15in;bottom:.35in}.psm-flow.f4{left:.55in;top:1.55in}
.psm-closing-kids{background:linear-gradient(135deg,#fff2df,#f5eaff);color:#67438b}.psm-closing-kids .psm-closing-logo{filter:none}.psm-closing-kids .psm-closing-thanks{font-family:'Baloo 2',cursive;color:#67438b}.psm-closing-kids .psm-closing-role{color:#14827c}.psm-closing-cast{display:flex;gap:.14in;margin-bottom:.3in}.psm-closing-cast .psm-emo-badge{background:var(--emo-bg);border-radius:50%;padding:.08in}.psm-closing-cast svg{color:var(--emo)}
</style></head><body>${slides}</body></html>`;
}

// Original PSM PDF (pre-redesign): all 10 pages are the pre-made PNGs with
// just the dynamic price overlay on slide 7. Kept as the "current" side of
// the app-wide old/new UI toggle -- everything except documents/atividades
// switches, PSM included, so this needs to keep working exactly as it did
// before any of the redesign work.
function psmPdfHtmlLegacy(publico,individual,pacote){
  const valorBR=v=>{const n=Number(String(v||'').replace(',','.'));return Number.isFinite(n)?n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'';};
  const slides=Array.from({length:10},(_,i)=>{
    const n=String(i+1).padStart(2,'0');
    const img=dataUri(readFileSync(new URL(`../assets/psm/${publico}/page-${n}.png`,import.meta.url)),'image/png');
    const overlay=i===6?`<div class="psm-price-overlay"><span>1 sessão</span><span>${escHtml(valorBR(individual)||'R$ 0,00')}</span><span>Pacote com 4 sessões</span><span>${escHtml(valorBR(pacote)||'R$ 0,00')}</span></div>`:'';
    return `<section class="psm-slide"><img src="${img}" alt="PSM ${publico}, página ${i+1}">${overlay}</section>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>PSM ${publico==='infantil'?'Infantil':'Adulto'} - Pacote ${escHtml(valorBR(pacote))}</title><style>
@font-face{font-family:Agrandir;src:url('${fontUri('agrandir-tight-values-bold.ttf')}');font-weight:700}
@page{size:12in 8in;margin:0}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}
body{margin:0}
.psm-slide{width:12in;height:8in;position:relative;overflow:hidden;break-after:page}
.psm-slide:last-child{break-after:auto}
.psm-slide>img{width:100%;height:100%;object-fit:cover}
.psm-price-overlay{position:absolute;left:8.4%;top:27.5%;width:47.3%;height:28.2%;border-radius:8%/20%;background:#b68a77;color:#fff;padding:4.7% 2.15%;display:grid;grid-template-columns:minmax(0,1fr) minmax(84px,.48fr);column-gap:2%;row-gap:14%;align-items:center;font:700 17pt Agrandir,Arial Narrow,sans-serif}
.psm-price-overlay span{white-space:nowrap;min-width:0}
.psm-price-overlay span:nth-child(even){text-align:right}
</style></head><body>${slides}</body></html>`;
}
export function psmPdfHtml(publico,individual,pacote,theme){
  return theme==='legacy'?psmPdfHtmlLegacy(publico,individual,pacote):psmPdfHtmlNew(publico,individual,pacote);
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
      const publico=clean(req.query.publico),individual=Number(req.query.individual),pacote=Number(req.query.pacote),theme=req.query.theme==='legacy'?'legacy':'new';
      if(!['adulto','infantil'].includes(publico)||!(individual>0)||!(pacote>0))return res.status(400).json({error:'Informe os valores da PSM'});
      const {renderPdf}=await import('./pdf.js');
      const buffer=await renderPdf(psmPdfHtml(publico,individual,pacote,theme),{width:'12in',height:'8in',margin:{top:0,right:0,bottom:0,left:0}});
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
    if(req.method==='DELETE'&&req.query?.action==='psm-delete'){
      const id=clean(req.query?.id);if(!uuid.test(id))return res.status(400).json({error:'PSM inválida'});
      const r=await supabase(`/rest/v1/psm_modelos?id=eq.${encodeURIComponent(id)}&arquivado_em=is.null`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({arquivado_em:new Date().toISOString(),arquivado_por:user.id})}),data=await json(r);
      return res.status(r.ok&&data?.length?200:404).json(r.ok&&data?.length?{ok:true}:{error:'PSM não encontrada'});
    }
    if(req.method==='POST'&&req.body?.action==='generate'){
      const tipo=clean(req.body.tipo),descricao=clean(req.body.descricao);if(!TYPES.has(tipo)||descricao.length<10||descricao.length>12000)return res.status(400).json({error:'Descreva melhor o conteúdo desejado'});
      const key=process.env.OPENAI_KEY;if(!key)return res.status(500).json({error:'Assistente de texto não configurado'});
      const instructions=tipo==='relatorio_psicologico'
        ? 'Redija um relatório psicológico profissional em português do Brasil, organizado em Descrição, Análise, Conclusão e Orientações. Não invente diagnósticos, fatos ou dados. Use somente o relato fornecido. Transforme falas coloquiais, ofensivas ou citadas entre aspas em discurso indireto, técnico, respeitoso e adequado ao documento. Não reproduza insultos, palavrões ou falas literais entre aspas; descreva objetivamente o conteúdo e o contexto informado.'
        : 'Redija uma solicitação formal de relatório escolar em português do Brasil. Explique o objetivo do acompanhamento e os aspectos que a escola deve descrever. Não invente fatos ou dados.';
      const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-5-mini',instructions,input:descricao,max_output_tokens:3000,reasoning:{effort:'low'}})});
      const data=await json(r);if(!r.ok){console.error('openai generate error:',r.status,data);return res.status(r.status).json({error:'Não foi possível elaborar o texto agora'});}
      const text=clean((data.output||[]).flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text);
      // gpt-5-mini is a reasoning model: with a low max_output_tokens budget it can spend the
      // whole thing on hidden reasoning and emit no visible text, while the HTTP call itself
      // still succeeds -- that silently produced an empty "texto" that the UI reported as a
      // success. Treat that as a real failure instead of a 200 with nothing in it.
      if(!text){console.error('openai generate: empty output',JSON.stringify(data).slice(0,2000));return res.status(502).json({error:'A IA não retornou texto. Tente novamente.'});}
      return res.status(200).json({texto:text});
    }
    if(req.method==='POST'){
      const paciente_id=clean(req.body?.paciente_id),tipo=clean(req.body?.tipo),titulo=clean(req.body?.titulo),emitido_em=clean(req.body?.emitido_em),conteudo=req.body?.conteudo;
      if(!uuid.test(paciente_id)||!TYPES.has(tipo)||!titulo||!/^\d{4}-\d{2}-\d{2}$/.test(emitido_em)||!conteudo||typeof conteudo!=='object')return res.status(400).json({error:'Preencha os campos obrigatórios'});
      if(JSON.stringify(conteudo).length>131072)return res.status(413).json({error:'Documento muito extenso'});
      const r=await supabase('/rest/v1/documentos_clinicos',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({paciente_id,tipo,titulo,emitido_em,conteudo:encryptClinicalData(conteudo),criado_por:user.id})}),data=await json(r);
      return res.status(r.ok?201:r.status).json(r.ok?{...data[0],conteudo}:{error:'Não foi possível salvar o documento'});
    }
    if(req.method==='DELETE'){
      const id=clean(req.query?.id);if(!uuid.test(id))return res.status(400).json({error:'Documento inválido'});
      const r=await supabase(`/rest/v1/documentos_clinicos?id=eq.${encodeURIComponent(id)}&arquivado_em=is.null`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({arquivado_em:new Date().toISOString(),arquivado_por:user.id})}),data=await json(r);
      return res.status(r.ok&&data?.length?200:404).json(r.ok&&data?.length?{ok:true}:{error:'Documento não encontrado'});
    }
    return res.status(405).json({error:'Method not allowed'});
  }catch(error){console.error('documents handler error:',error);return res.status(500).json({error:'Não foi possível processar o documento'});}
}
