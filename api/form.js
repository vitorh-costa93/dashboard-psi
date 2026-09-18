import {createHash} from 'node:crypto';
import {supabase} from './_auth.js';
import {encryptClinicalData} from './_clinical-crypto.js';

const digest=token=>createHash('sha256').update(token).digest('hex');

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  const token=String(req.query?.token||req.body?.token||'');
  if(token.length<40)return res.status(404).json({error:'Link inválido ou expirado'});
  const tokenHash=digest(token);
  try{
    if(req.method==='GET'){
      const response=await supabase(`/rest/v1/formularios_convites?select=expira_em,status,formularios_modelos!inner(nome,finalidade,campos)&token_hash=eq.${tokenHash}&limit=1`);
      const rows=await response.json();const invite=rows?.[0];
      if(!response.ok||!invite||invite.status!=='pending'||new Date(invite.expira_em)<=new Date())return res.status(404).json({error:'Link inválido ou expirado'});
      return res.status(200).json({nome:invite.formularios_modelos.nome,finalidade:invite.formularios_modelos.finalidade,campos:invite.formularios_modelos.campos,expira_em:invite.expira_em});
    }
    if(req.method==='POST'){
      // 131072 (mesmo limite do action='anamnesis' em api/forms.js) -- a Anamnese
      // online agora traz todas as perguntas da sub-aba Anamnese (mais de 100
      // campos, vários textarea), o limite anterior (64KB) era justo demais.
      const conteudo=req.body?.conteudo;if(!conteudo||typeof conteudo!=='object'||Array.isArray(conteudo)||JSON.stringify(conteudo).length>131072)return res.status(400).json({error:'Resposta inválida'});
      const response=await supabase('/rest/v1/rpc/enviar_formulario_externo',{method:'POST',body:JSON.stringify({p_token_hash:tokenHash,p_conteudo:encryptClinicalData(conteudo)})});
      return res.status(response.ok?201:404).json(response.ok?{ok:true}:{error:'Link inválido, expirado ou já utilizado'});
    }
    return res.status(405).json({error:'Method not allowed'});
  }catch(error){return res.status(500).json({error:'Não foi possível processar o formulário'});}
}
