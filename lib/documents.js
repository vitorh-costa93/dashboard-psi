import {readFileSync} from 'node:fs';
import {Document,Packer,Paragraph,TextRun,ImageRun,HeadingLevel,AlignmentType,Footer,Table,TableRow,TableCell,WidthType,VerticalAlign,BorderStyle} from 'docx';
import {supabase} from '../api/_auth.js';
import {decryptClinicalData,encryptClinicalData} from '../api/_clinical-crypto.js';

const TYPES=new Set(['termo_infantil','termo_adulto','orcamento','recibo','relatorio_psicologico','solicitacao_escolar','declaracao_comparecimento']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json=async r=>r.json().catch(()=>null);
const clean=value=>String(value??'').trim();
const brandSymbol=readFileSync(new URL('../assets/logo-symbol-hires.png',import.meta.url));
const brandSymbolWhite=readFileSync(new URL('../assets/logo-symbol-white-hires.png',import.meta.url));
export const formatDates=value=>clean(value).replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g,'$3/$2/$1');

// --- HTML/PDF export (server-rendered, no browser print dialog involved) ---
const dataUri=(buf,mime)=>`data:${mime};base64,${buf.toString('base64')}`;
const brandSymbolUri=dataUri(brandSymbol,'image/png');
const brandSymbolWhiteUri=dataUri(brandSymbolWhite,'image/png');
const fontUri=name=>dataUri(readFileSync(new URL(`../assets/fonts/${name}`,import.meta.url)),'font/ttf');
const escHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dataBR=value=>formatDates(value);
const longDate=iso=>new Date(iso+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'});

// Mirrors the on-screen .doc-preview rules in index.html 1:1 (same px values,
// same negative-margin bleed on the brand strip, same DM Sans/Agrandir Tight
// fonts) so the exported PDF matches what's shown in the app, not an
// approximation of it.
//
// The page margin (PAGE_MARGIN, passed to page.pdf()) is a real per-page
// margin, repeated by Chromium on every page a document overflows onto --
// unlike a margin:0 + body padding approach, where the "padding" is really
// just leading space before the first line of the flow and vanishes on
// page 2+, leaving continuation pages with no margin at all. The colored
// brand strip still bleeds to the true page edge on page 1 by giving it a
// negative margin that exactly cancels PAGE_MARGIN -- Chromium renders
// negative-margin content into the reserved margin band instead of
// clipping it, so this only affects the element that opts into it.
export const PAGE_MARGIN={top:'30px',right:'42px',bottom:'30px',left:'42px'};
function pageStyles(colorido){
  return `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;1,400&display=swap">
<style>
@font-face{font-family:'Agrandir Tight';src:url('${fontUri('agrandir-tight.ttf')}')}
@font-face{font-family:'Agrandir Tight';src:url('${fontUri('agrandir-tight-bold.ttf')}');font-weight:700}
@page{size:A4}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}
html,body{margin:0}
body{font-family:'DM Sans',Arial,sans-serif;font-size:13px;line-height:1.65;color:#333;background:#fbfaf9}
${colorido===false?'body{filter:grayscale(1)}':''}
.doc-preview-brand{height:108px;margin:-30px -42px 30px;position:relative;overflow:visible}
.doc-preview-brand:before{content:'';position:absolute;left:-18px;top:-32px;width:156px;height:156px;border-radius:50%;background:${colorido===false?'#b8b8b8':'#b7c3a5'};z-index:0}
.doc-preview-brand:after{content:'';position:absolute;left:0;bottom:0;width:180px;border-bottom:2px solid #9aa7aa;z-index:1}
.doc-preview-brand .brand-lockup{position:absolute;left:7px;top:7px;display:flex;align-items:center;color:#6b6b70;line-height:.82;z-index:2}
.doc-preview-brand .brand-symbol{width:100px;height:88px;object-fit:contain;filter:brightness(0) invert(1)}
.doc-preview-brand .brand-copy{font-family:'Agrandir Tight','Arial Narrow',sans-serif;margin-left:37px}
.doc-preview-brand .brand-name{font-size:23px}
.doc-preview-brand .brand-name strong,.doc-preview-brand .brand-role strong{font-weight:700}
.doc-preview-brand .brand-role{display:flex;align-items:baseline;gap:10px;margin-top:6px;font-size:6.5px;white-space:nowrap}
table.doc-page{width:100%;border-collapse:collapse}
table.doc-page thead{display:table-header-group}
table.doc-page td{padding:0}
h2{text-align:center;color:#626267;font:700 17.28px 'Agrandir Tight','Arial Narrow',sans-serif;margin:26px 0 46px}
h3{font-size:13.76px;color:#626267;margin:20px 0 7px;break-after:avoid}
p{margin:0 0 12px;white-space:pre-wrap;text-align:justify;orphans:3;widows:3}
.doc-closing{break-inside:avoid}
.doc-signature{position:relative;text-align:right;margin-top:74px;padding-top:14px;padding-right:92px;min-height:112px}
.doc-signature:before{content:'';position:absolute;right:0;top:0;width:330px;border-top:2px solid #9aa7aa}
.doc-signature img{position:absolute;right:0;bottom:0;width:88px;height:98px;object-fit:contain;opacity:.28}
.doc-signature p{margin:0 0 2px;text-align:right;color:#3f3f44}
.doc-signature strong{color:#69696e}
</style>`;
}

const brandMarkupPdf=()=>`<div class="doc-preview-brand"><div class="brand-lockup"><img class="brand-symbol" src="${brandSymbolWhiteUri}" alt=""><div class="brand-copy"><div class="brand-name"><strong>Jaqueline</strong><br>Vieira</div><div class="brand-role"><strong>PSICÓLOGA</strong><span>CRP 06/191478</span></div></div></div></div>`;

function documentPdfHtml(item){
  const c=item.conteudo||{},fields=c.campos||{},sections=Array.isArray(c.secoes)?c.secoes:[];
  const colorido=(c.estilo||'colorido')==='colorido';
  const campos=Object.entries(fields).filter(([,v])=>clean(v)).map(([k,v])=>`<p><strong>${escHtml(k)}:</strong> ${escHtml(dataBR(v))}</p>`).join('');
  const secoes=sections.map(s=>`${s.titulo?`<h3>${escHtml(s.titulo)}</h3>`:''}${s.texto?`<p>${escHtml(dataBR(s.texto))}</p>`:''}`).join('');
  const closing=`<div class="doc-closing"><p style="text-align:right;margin-top:42px">Araraquara, ${longDate(item.emitido_em)}.</p><p style="text-align:right">À disposição para esclarecimentos de quaisquer dúvidas.</p><div class="doc-signature"><img src="${brandSymbolUri}" alt=""><p><strong>Jaqueline Cristina Vieira</strong></p><p>CRP 06/191478</p><p>Psicóloga Clínica</p><p>Pós-graduada em Terapia Cognitivo-Comportamental</p></div></div>`;
  const bodyContent=`${campos}${secoes}${closing}`;
  // A plain <thead> repeats on every printed page in Chromium's pagination
  // (same mechanism that repeats table headers across pages) -- that's what
  // makes the letterhead/title reappear on page 2, 3, etc. instead of only
  // showing once at the very top of the whole document.
  const body=`<table class="doc-page"><thead><tr><td>${brandMarkupPdf()}<h2>${escHtml(item.titulo)}</h2></td></tr></thead><tbody><tr><td>${bodyContent}</td></tr></tbody></table>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escHtml(item.titulo)}</title>${pageStyles(colorido)}</head><body>${body}</body></html>`;
}

function prontuarioPdfHtml(nome,sessoes){
  const linhas=sessoes.map(s=>{
    const [y,m,d]=clean(s.data).split('-');
    return `<tr><td class="pront-data">${escHtml(`${d}/${m}/${y}`)}</td><td class="pront-relato">${escHtml(clean(s.relato)).replace(/\n/g,'<br>')}</td></tr>`;
  }).join('');
  // The brand+title row lives inside <thead> alongside the column headers so
  // both repeat together on every printed page (see documentPdfHtml).
  const body=`<table class="pront-table"><thead><tr><th colspan="2" class="pront-brand-cell">${brandMarkupPdf()}<h2>Prontuário — ${escHtml(nome)}</h2></th></tr><tr><th class="pront-data">Data</th><th class="pront-relato">Relato da sessão</th></tr></thead><tbody>${linhas}</tbody></table>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Prontuário - ${escHtml(nome)}</title>${pageStyles(true)}<style>
.pront-table{width:100%;border-collapse:collapse;break-inside:auto}
.pront-table thead{display:table-header-group}
.pront-table th.pront-brand-cell{background:transparent;padding:0;border:none}
.pront-table th:not(.pront-brand-cell){background:#b7c3a5;color:#fff;text-align:left;padding:6px 10px;font-size:12.5px}
.pront-table td{border:1px solid #ddd;padding:6px 10px;vertical-align:top;font-size:12.5px}
.pront-data{white-space:nowrap;width:90px;color:#555}
.pront-table tbody tr{break-inside:avoid}
</style></head><body>${body}</body></html>`;
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

function psmPdfHtml(publico,individual,pacote){
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
      const {renderPdf}=await import('./pdf.js');
      const buffer=await renderPdf(documentPdfHtml(item),{format:'A4',margin:PAGE_MARGIN});
      res.setHeader('Content-Type','application/pdf');
      res.setHeader('Content-Disposition',`attachment; filename="documento-${item.tipo}.pdf"`);
      return res.status(200).send(buffer);
    }
    if(req.method==='GET'&&req.query?.action==='psm-pdf'){
      const publico=clean(req.query.publico),individual=Number(req.query.individual),pacote=Number(req.query.pacote);
      if(!['adulto','infantil'].includes(publico)||!(individual>0)||!(pacote>0))return res.status(400).json({error:'Informe os valores da PSM'});
      const {renderPdf}=await import('./pdf.js');
      const buffer=await renderPdf(psmPdfHtml(publico,individual,pacote),{width:'12in',height:'8in',margin:{top:0,right:0,bottom:0,left:0}});
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
