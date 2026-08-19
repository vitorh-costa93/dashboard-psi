import {randomBytes,createHash} from 'node:crypto';
import {requireAuth,supabase} from './_auth.js';

const digest=token=>createHash('sha256').update(token).digest('hex');
const safeJson=async response=>response.json().catch(()=>null);

export default async function handler(req,res){
  const user=await requireAuth(req,res);if(!user)return;
  try{
    if(req.method==='GET'){
      if(req.query?.resource==='templates'){
        const response=await supabase('/rest/v1/formularios_modelos?select=id,nome,finalidade,campos,ativo&ativo=eq.true&order=criado_em.desc');
        const data=await safeJson(response);return res.status(response.ok?200:response.status).json(response.ok?data:{error:'Falha ao carregar modelos'});
      }
      const response=await supabase('/rest/v1/formularios_respostas?select=id,status,enviado_em,conteudo,formularios_convites!inner(paciente_id,formularios_modelos(nome,finalidade))&order=enviado_em.desc');
      const data=await safeJson(response);return res.status(response.ok?200:response.status).json(response.ok?data:{error:'Falha ao carregar respostas'});
    }
    if(req.method==='POST'&&req.body?.action==='template'){
      const {nome,finalidade,campos}=req.body;if(!nome||!finalidade||!Array.isArray(campos))return res.status(400).json({error:'Modelo inválido'});
      const response=await supabase('/rest/v1/formularios_modelos',{method:'POST',body:JSON.stringify({nome,finalidade,campos})});
      const data=await safeJson(response);return res.status(response.ok?201:response.status).json(response.ok?data[0]:{error:'Falha ao criar modelo'});
    }
    if(req.method==='POST'&&req.body?.action==='invite'){
      const {modelo_id,paciente_id}=req.body;const hours=Math.min(168,Math.max(1,Number(req.body.expires_in_hours)||72));
      if(!modelo_id||!paciente_id)return res.status(400).json({error:'Modelo e paciente são obrigatórios'});
      const token=randomBytes(32).toString('base64url');const expira_em=new Date(Date.now()+hours*3600000).toISOString();
      const response=await supabase('/rest/v1/formularios_convites',{method:'POST',body:JSON.stringify({modelo_id,paciente_id,token_hash:digest(token),expira_em,criado_por:user.id})});
      if(!response.ok)return res.status(response.status).json({error:'Falha ao criar convite'});
      const origin=`https://${req.headers.host}`;return res.status(201).json({url:`${origin}/form.html?token=${encodeURIComponent(token)}`,expira_em});
    }
    if(req.method==='PATCH'){
      const {resposta_id,action}=req.body||{};if(!resposta_id||!['approve','reject'].includes(action))return res.status(400).json({error:'Revisão inválida'});
      const response=await supabase('/rest/v1/rpc/revisar_formulario',{method:'POST',body:JSON.stringify({p_resposta_id:resposta_id,p_acao:action,p_revisor:user.id})});
      return res.status(response.ok?200:409).json(response.ok?{ok:true,anamnese_versao_id:await safeJson(response)}:{error:'Resposta não está pendente'});
    }
    return res.status(405).json({error:'Method not allowed'});
  }catch(error){return res.status(500).json({error:'Não foi possível processar formulários'});}
}
