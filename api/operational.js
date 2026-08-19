import {requireAuth, supabase} from './_auth.js';

async function allSessions() {
  const rows=[];
  for(let from=0;;from+=1000){
    const response=await supabase('/rest/v1/sessoes?select=data_sessao,genero,faixa_etaria,modalidade,horario,comparecimento,motivo,valor_sessao,sessoes_cobradas,valor_total,valor_final,cnpj,pacientes!inner(nome,ativo),convenios(nome)&order=data_sessao.asc',{
      headers:{Range:`${from}-${from+999}`},
    });
    if(!response.ok)throw new Error(`Falha ao carregar sessões: ${response.status}`);
    const page=await response.json();rows.push(...page);if(page.length<1000)break;
  }
  return rows;
}

function brDate(value){const [year,month,day]=String(value).split('-');return `${day}/${month}/${year}`;}

export default async function handler(req,res){
  if(!await requireAuth(req,res))return;
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  try{
    const rows=await allSessions();
    return res.status(200).json(rows.map(row=>({
      'Data':brDate(row.data_sessao),
      'Paciente':row.pacientes.nome,
      'Gênero':row.genero||'',
      'Faixa Etária':row.faixa_etaria||'',
      'Modalidade':row.modalidade||'',
      'Convênio':row.convenios?.nome||'',
      'Horário':row.horario||'',
      'Valor da sessão':row.valor_sessao,
      'Sessões cobradas':row.sessoes_cobradas,
      'Valor total':row.valor_total,
      'Valor final':row.valor_final,
      'Ativo':row.pacientes.ativo?'Ativo':'',
      'Comparecimento':row.comparecimento||'',
      'Motivo':row.motivo||'',
      'CNPJ?':row.cnpj?'Sim':'Não',
    })));
  }catch(error){
    return res.status(500).json({error:'Não foi possível carregar os dados operacionais'});
  }
}

