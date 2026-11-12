import {decryptClinicalData} from '../api/_clinical-crypto.js';
import {pathToFileURL} from 'node:url';

// Recuperação administrativa explícita de respostas aprovadas antes da
// sincronização. Nunca registra conteúdo, identificação ou credenciais.
export function profilePatch(content){
  const patch={};
  const fields={nome:content.nome_completo||content.nome_crianca,cpf_paciente:content.cpf_paciente||content.cpf,data_nascimento:content.data_nascimento,responsavel_nome:content.responsavel_nome||content.nome_responsavel,cpf_responsavel:content.cpf_responsavel};
  for(const [key,value] of Object.entries(fields)){
    const text=String(value??'').trim();if(!text)continue;
    if(key.startsWith('cpf_')){const digits=text.replace(/\D/g,'');if(digits.length!==11)throw new Error('CPF inválido na resposta');patch[key]=digits;}
    else if(key==='data_nascimento'){if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||Number.isNaN(Date.parse(text))||new Date(text).toISOString().slice(0,10)!==text)throw new Error('Data inválida na resposta');patch[key]=text;}
    else {if(text.length>(key==='nome'?120:160))throw new Error('Texto excede limite do cadastro');patch[key]=text;}
  }
  if(!Object.keys(patch).length)throw new Error('Resposta sem campos cadastrais');
  return patch;
}

export async function reconcile(responseId,apply=false){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(responseId))throw new Error('ID inválido');
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_KEY;
  if(!url||!key||!process.env.CLINICAL_DATA_KEY)throw new Error('Ambiente de produção incompleto');
  const request=async(path,options={})=>{
    const r=await fetch(url+'/rest/v1/'+path,{...options,headers:{apikey:key,...(key.startsWith('sb_secret_')?{}:{Authorization:'Bearer '+key}),'Content-Type':'application/json',Prefer:'return=representation'}});
    if(!r.ok)throw new Error('Falha na operação do cadastro: HTTP '+r.status);
    return r.json();
  };
  const [response]=await request('formularios_respostas?select=status,conteudo,formularios_convites!inner(paciente_id,formularios_modelos!inner(destino))&id=eq.'+responseId);
  if(response?.status!=='approved'||response.formularios_convites.formularios_modelos.destino!=='cadastro')throw new Error('Exige resposta cadastral aprovada');
  const patch=profilePatch(decryptClinicalData(response.conteudo));
  const id=response.formularios_convites.paciente_id;
  const [before]=await request('pacientes?select=id,atualizado_em&id=eq.'+id);
  if(!before)throw new Error('Paciente não encontrado');
  if(!apply)return {aplicar:false,campos:Object.keys(patch)};
  const updated=await request('pacientes?id=eq.'+id+'&atualizado_em=eq.'+encodeURIComponent(before.atualizado_em),{method:'PATCH',body:JSON.stringify({...patch,atualizado_em:new Date().toISOString()})});
  if(updated.length!==1)throw new Error('Cadastro alterado concorrentemente; nenhuma atualização aplicada');
  const [saved]=await request('pacientes?select='+Object.keys(patch).join(',')+'&id=eq.'+id);
  if(!saved||!Object.entries(patch).every(([k,v])=>saved[k]===v))throw new Error('Verificação após gravação falhou');
  return {aplicar:true,verificado:true,campos:Object.keys(patch)};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    if(process.env.VERCEL_TOKEN){
      const r=await fetch('https://api.vercel.com/v10/projects/prj_Eztc3pNA9P7KYhTEJIhnymVIpeOa/env?decrypt=true&teamId=team_5TOFRVNzimmU6aZE8ZvDyNwV',{headers:{Authorization:'Bearer '+process.env.VERCEL_TOKEN}});
      if(!r.ok)throw new Error('Falha ao preparar ambiente de produção');
      const {envs}=await r.json();
      for(const key of ['SUPABASE_URL','SUPABASE_SERVICE_KEY','CLINICAL_DATA_KEY']){
        const env=envs.find(e=>e.key===key&&e.target?.includes('production'));
        if(!env?.value)throw new Error('Configuração de produção indisponível');
        process.env[key]=env.value;
      }
    }
    console.log(JSON.stringify(await reconcile(process.argv[2],process.argv[3]==='--apply')));
  }
  catch{console.error('Não foi possível reaplicar e verificar o cadastro. Nenhum dado pessoal foi registrado.');process.exitCode=1;}
}
