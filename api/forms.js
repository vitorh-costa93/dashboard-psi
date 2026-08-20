import {randomBytes,createHash} from 'node:crypto';
import {requireAuth,supabase} from './_auth.js';
import {decryptClinicalData,encryptClinicalData} from './_clinical-crypto.js';
import {Document,Packer,Paragraph,TextRun,HeadingLevel} from 'docx';
import {handleDocuments,renderProntuarioPdf,renderAtividadePdf} from '../lib/documents.js';

const digest=token=>createHash('sha256').update(token).digest('hex');
const safeJson=async response=>response.json().catch(()=>null);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req,res){
  const user=await requireAuth(req,res);if(!user)return;
  if(req.query?.resource==='documents'||req.body?.resource==='documents')return handleDocuments(req,res,user);
  try{
    if(req.method==='GET'){
      if(req.query?.resource==='anamnesis'){
        const pacienteId=String(req.query?.paciente_id||'');if(!uuid.test(pacienteId))return res.status(400).json({error:'Paciente inválido'});
        const rr=await supabase(`/rest/v1/registros_clinicos?select=id&paciente_id=eq.${pacienteId}&limit=1`),records=await safeJson(rr);
        if(!rr.ok)return res.status(rr.status).json({error:'Falha ao carregar anamnese'});if(!records?.length)return res.status(200).json([]);
        const vr=await supabase(`/rest/v1/anamneses_versoes?select=id,versao,conteudo,criado_em&registro_clinico_id=eq.${records[0].id}&excluido_em=is.null&order=versao.desc`),versions=await safeJson(vr);
        if(!vr.ok)return res.status(vr.status).json({error:'Falha ao carregar versões'});
        try{return res.status(200).json(versions.map(item=>({...item,conteudo:decryptClinicalData(item.conteudo)})));}
        catch{return res.status(500).json({error:'Não foi possível abrir os dados da anamnese'});}
      }
      if(req.query?.resource==='templates'){
        const response=await supabase('/rest/v1/formularios_modelos?select=id,nome,finalidade,campos,destino,ativo&ativo=eq.true&order=criado_em.desc');
        const data=await safeJson(response);return res.status(response.ok?200:response.status).json(response.ok?data:{error:'Falha ao carregar modelos'});
      }
      const response=await supabase('/rest/v1/formularios_respostas?select=id,status,enviado_em,conteudo,formularios_convites!inner(paciente_id,formularios_modelos(nome,finalidade,destino,campos))&status=in.(pending_review,approved)&arquivado_em=is.null&order=enviado_em.desc');
      const data=await safeJson(response);
      if(response.ok){
        try{return res.status(200).json(data.map(item=>({...item,conteudo:decryptClinicalData(item.conteudo)})));}
        catch{return res.status(500).json({error:'Não foi possível abrir os dados clínicos'});}
      }
      return res.status(response.status).json({error:'Falha ao carregar respostas'});
    }
    if(req.method==='POST'&&req.body?.action==='anamnesis'){
      const pacienteId=String(req.body?.paciente_id||''),conteudo=req.body?.conteudo;
      if(!uuid.test(pacienteId))return res.status(400).json({error:'Paciente inválido'});
      if(!conteudo||typeof conteudo!=='object'||Array.isArray(conteudo))return res.status(400).json({error:'Conteúdo inválido'});
      const serialized=JSON.stringify(conteudo);if(serialized.length>131072)return res.status(413).json({error:'Anamnese muito extensa'});
      if(!Object.values(conteudo).some(value=>String(value||'').trim()))return res.status(400).json({error:'Preencha ao menos um campo'});
      const response=await supabase('/rest/v1/rpc/salvar_anamnese',{method:'POST',body:JSON.stringify({p_paciente_id:pacienteId,p_conteudo:encryptClinicalData(conteudo),p_autor:user.id})});
      const result=await safeJson(response);return res.status(response.ok?201:409).json(response.ok?{id:result}:{error:'Não foi possível salvar a anamnese'});
    }
    if(req.method==='POST'&&req.body?.action==='export_anamnesis'){
      const {paciente_nome,versao,criado_em,secoes}=req.body;
      if(!Array.isArray(secoes)||secoes.length>30)return res.status(400).json({error:'Dados de exportação inválidos'});
      const children=[new Paragraph({text:'ANAMNESE INFANTIL',heading:HeadingLevel.TITLE}),new Paragraph({children:[new TextRun({text:`Paciente: ${String(paciente_nome||'Não informado')}`,bold:true})]}),new Paragraph({text:`Versão ${Number(versao)||1} · ${String(criado_em||'')}`})];
      for(const section of secoes){
        children.push(new Paragraph({text:String(section.titulo||'Seção'),heading:HeadingLevel.HEADING_1}));
        for(const item of Array.isArray(section.itens)?section.itens:[]){
          const value=String(item.valor||'').trim();if(!value)continue;
          children.push(new Paragraph({children:[new TextRun({text:`${String(item.rotulo||'Campo')}: `,bold:true}),new TextRun(value)]}));
        }
      }
      const doc=new Document({sections:[{properties:{},children}]});
      const buffer=await Packer.toBuffer(doc);
      return res.status(200).json({arquivo:buffer.toString('base64')});
    }
    if(req.method==='POST'&&req.body?.action==='export_prontuario'){
      const nome=String(req.body?.paciente_nome||'').trim();
      const sessoes=Array.isArray(req.body?.sessoes)?req.body.sessoes:[];
      if(!nome||nome.length>200)return res.status(400).json({error:'Paciente inválido'});
      if(!sessoes.length||sessoes.length>1000)return res.status(400).json({error:'Nenhuma sessão para exportar'});
      const sane=sessoes.every(s=>s&&typeof s.data==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s.data)&&typeof s.relato==='string'&&s.relato.length<=20000);
      if(!sane)return res.status(400).json({error:'Dados de sessão inválidos'});
      const buffer=await renderProntuarioPdf(nome,sessoes);
      res.setHeader('Content-Type','application/pdf');
      res.setHeader('Content-Disposition',`attachment; filename="prontuario-${nome.replace(/[^a-zA-Z0-9]+/g,'-')}.pdf"`);
      return res.status(200).send(buffer);
    }
    if(req.method==='POST'&&req.body?.action==='export_atividade_pdf'){
      const titulo=String(req.body?.titulo||'').trim().slice(0,200);
      const img_b64=String(req.body?.img_b64||'');
      if(!img_b64||img_b64.length>15000000||!/^[A-Za-z0-9+/]+=*$/.test(img_b64))return res.status(400).json({error:'Imagem inválida'});
      const buffer=await renderAtividadePdf(titulo,img_b64);
      res.setHeader('Content-Type','application/pdf');
      res.setHeader('Content-Disposition',`attachment; filename="${(titulo||'atividade').replace(/[^a-zA-Z0-9]+/g,'-')}.pdf"`);
      return res.status(200).send(buffer);
    }
    if(req.method==='POST'&&req.body?.action==='template'){
      const {nome,finalidade,campos}=req.body,destino=req.body.destino==='cadastro'?'cadastro':'anamnese';if(!nome||!finalidade||!Array.isArray(campos))return res.status(400).json({error:'Modelo inválido'});
      const existingResponse=await supabase(`/rest/v1/formularios_modelos?select=id,nome,finalidade,campos,destino,ativo&nome=eq.${encodeURIComponent(nome)}&destino=eq.${destino}&ativo=eq.true&limit=1`);
      const existing=await safeJson(existingResponse);if(existingResponse.ok&&existing?.length)return res.status(200).json(existing[0]);
      const response=await supabase('/rest/v1/formularios_modelos',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({nome,finalidade,campos,destino})});
      const data=await safeJson(response);return res.status(response.ok?201:response.status).json(response.ok?data[0]:{error:'Falha ao criar modelo'});
    }
    if(req.method==='POST'&&req.body?.action==='invite'){
      const {modelo_id,paciente_id}=req.body;const hours=Math.min(168,Math.max(1,Number(req.body.expires_in_hours)||72));
      if(!modelo_id||!paciente_id)return res.status(400).json({error:'Modelo e paciente são obrigatórios'});
      const token=randomBytes(32).toString('base64url');const expira_em=new Date(Date.now()+hours*3600000).toISOString();
      const response=await supabase('/rest/v1/formularios_convites',{method:'POST',body:JSON.stringify({modelo_id,paciente_id,token_hash:digest(token),expira_em,criado_por:user.id})});
      if(!response.ok)return res.status(response.status).json({error:'Falha ao criar convite'});
      const origin=String(process.env.PUBLIC_FORM_ORIGIN||`https://${req.headers.host}`).replace(/\/$/,'');return res.status(201).json({url:`${origin}/form.html?token=${encodeURIComponent(token)}`,expira_em});
    }
    if(req.method==='PATCH'){
      const {resposta_id,action}=req.body||{};if(!resposta_id||!['approve','reject'].includes(action))return res.status(400).json({error:'Revisão inválida'});
      const response=await supabase('/rest/v1/rpc/revisar_formulario',{method:'POST',body:JSON.stringify({p_resposta_id:resposta_id,p_acao:action,p_revisor:user.id})});
      return res.status(response.ok?200:409).json(response.ok?{ok:true,anamnese_versao_id:await safeJson(response)}:{error:'Resposta não está pendente'});
    }
    if(req.method==='DELETE'&&req.query?.resource==='anamnesis'){
      const anamneseId=String(req.query?.id||'');if(!uuid.test(anamneseId))return res.status(400).json({error:'Anamnese inválida'});
      const response=await supabase('/rest/v1/rpc/arquivar_anamnese',{method:'POST',body:JSON.stringify({p_anamnese_id:anamneseId,p_autor:user.id})});
      const archived=await safeJson(response);return res.status(response.ok&&archived?200:404).json(response.ok&&archived?{ok:true}:{error:'Anamnese não encontrada'});
    }
    if(req.method==='DELETE'&&req.query?.resource==='response'){
      const respostaId=String(req.query?.id||'');if(!uuid.test(respostaId))return res.status(400).json({error:'Resposta inválida'});
      const response=await supabase('/rest/v1/rpc/arquivar_resposta_formulario',{method:'POST',body:JSON.stringify({p_resposta_id:respostaId,p_autor:user.id})});
      const archived=await safeJson(response);return res.status(response.ok&&archived?200:404).json(response.ok&&archived?{ok:true}:{error:'Registro aprovado não encontrado'});
    }
    return res.status(405).json({error:'Method not allowed'});
  }catch(error){console.error('forms handler error:',error);return res.status(500).json({error:'Não foi possível processar formulários'});}
}
