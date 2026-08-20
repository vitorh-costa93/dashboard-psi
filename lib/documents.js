import {readFileSync} from 'node:fs';
import {Document,Packer,Paragraph,TextRun,ImageRun,HeadingLevel,AlignmentType,Footer} from 'docx';
import {supabase} from '../api/_auth.js';
import {decryptClinicalData,encryptClinicalData} from '../api/_clinical-crypto.js';

const TYPES=new Set(['termo_infantil','termo_adulto','orcamento','recibo','relatorio_psicologico','solicitacao_escolar','declaracao_comparecimento']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json=async r=>r.json().catch(()=>null);
const clean=value=>String(value??'').trim();
const brandLogo=readFileSync(new URL('../assets/logo-jaqueline-dark.png',import.meta.url));

function paragraph(text,{bold=false,heading,align,spaceAfter=160}={}){
  return new Paragraph({heading,alignment:align,spacing:{after:spaceAfter,line:300},children:[new TextRun({text:clean(text),bold,font:'Arial',size:22})]});
}

function documentChildren(item){
  const c=item.conteudo||{}, fields=c.campos||{}, sections=Array.isArray(c.secoes)?c.secoes:[];
  const out=[
    new Paragraph({spacing:{after:300},children:[new ImageRun({data:brandLogo,transformation:{width:190,height:74},type:'png',altText:{title:'Jaqueline Vieira Psicóloga',description:'Identidade visual da profissional',name:'Logo'}})]}),
    paragraph(item.titulo.toUpperCase(),{bold:true,heading:HeadingLevel.TITLE,align:AlignmentType.CENTER,spaceAfter:320}),
  ];
  Object.entries(fields).filter(([,v])=>clean(v)).forEach(([k,v])=>out.push(new Paragraph({spacing:{after:100},children:[new TextRun({text:`${k}: `,bold:true,font:'Arial',size:21}),new TextRun({text:clean(v),font:'Arial',size:21})]})));
  sections.forEach(section=>{
    if(section.titulo)out.push(paragraph(section.titulo,{bold:true,heading:HeadingLevel.HEADING_1,spaceAfter:120}));
    if(section.texto)clean(section.texto).split(/\n+/).filter(Boolean).forEach(x=>out.push(paragraph(x,{spaceAfter:150})));
  });
  out.push(paragraph(`Araraquara, ${new Date(item.emitido_em+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'})}.`,{align:AlignmentType.RIGHT,spaceAfter:300}));
  out.push(paragraph('À disposição para esclarecimentos de quaisquer dúvidas.',{align:AlignmentType.RIGHT,spaceAfter:420}));
  out.push(paragraph('________________________________________',{align:AlignmentType.RIGHT,spaceAfter:30}));
  out.push(paragraph('Jaqueline Cristina Vieira',{bold:true,align:AlignmentType.RIGHT,spaceAfter:30}));
  out.push(paragraph('Psicóloga Clínica · CRP 06/191478',{align:AlignmentType.RIGHT}));
  return out;
}

async function loadOne(id){
  const r=await supabase(`/rest/v1/documentos_clinicos?select=id,paciente_id,tipo,titulo,conteudo,emitido_em,criado_em&id=eq.${encodeURIComponent(id)}&arquivado_em=is.null&limit=1`),data=await json(r);
  if(!r.ok||!data?.[0])return null;
  return {...data[0],conteudo:decryptClinicalData(data[0].conteudo)};
}

export async function handleDocuments(req,res,user){
  try{
    if(req.method==='GET'&&req.query?.action==='export'){
      const id=clean(req.query.id);if(!uuid.test(id))return res.status(400).json({error:'Documento inválido'});
      const item=await loadOne(id);if(!item)return res.status(404).json({error:'Documento não encontrado'});
      const doc=new Document({sections:[{properties:{page:{margin:{top:900,right:900,bottom:900,left:900}}},footers:{default:new Footer({children:[paragraph('Jaqueline Cristina Vieira · CRP 06/191478',{align:AlignmentType.CENTER,spaceAfter:0})]})},children:documentChildren(item)}]});
      const buffer=await Packer.toBuffer(doc);
      res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition',`attachment; filename="documento-${item.tipo}.docx"`);
      return res.status(200).send(buffer);
    }
    if(req.method==='GET'){
      const paciente=clean(req.query?.paciente_id),filter=paciente?`&paciente_id=eq.${encodeURIComponent(paciente)}`:'';
      if(paciente&&!uuid.test(paciente))return res.status(400).json({error:'Paciente inválido'});
      const r=await supabase(`/rest/v1/documentos_clinicos?select=id,paciente_id,tipo,titulo,conteudo,emitido_em,criado_em&arquivado_em=is.null${filter}&order=criado_em.desc`),data=await json(r);
      if(!r.ok)return res.status(r.status).json({error:'Não foi possível carregar os documentos'});
      return res.status(200).json(data.map(x=>({...x,conteudo:decryptClinicalData(x.conteudo)})));
    }
    if(req.method==='POST'&&req.body?.action==='generate'){
      const tipo=clean(req.body.tipo),descricao=clean(req.body.descricao);if(!TYPES.has(tipo)||descricao.length<10||descricao.length>12000)return res.status(400).json({error:'Descreva melhor o conteúdo desejado'});
      const key=process.env.OPENAI_KEY;if(!key)return res.status(500).json({error:'Assistente de texto não configurado'});
      const instructions=tipo==='relatorio_psicologico'
        ? 'Redija um relatório psicológico profissional em português do Brasil, organizado em Descrição, Análise, Conclusão e Orientações. Não invente diagnósticos, fatos ou dados. Use somente o relato fornecido.'
        : 'Redija uma solicitação formal de relatório escolar em português do Brasil. Explique o objetivo do acompanhamento e os aspectos que a escola deve descrever. Não invente fatos ou dados.';
      const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-5-mini',instructions,input:descricao,max_output_tokens:1800})});
      const data=await json(r);if(!r.ok)return res.status(r.status).json({error:'Não foi possível elaborar o texto agora'});
      const text=(data.output||[]).flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text;
      return res.status(200).json({texto:clean(text)});
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
  }catch{return res.status(500).json({error:'Não foi possível processar o documento'});}
}
