// Radar de tendências de conteúdo para uma psicóloga que atende todo o ciclo vital.
// Fontes: busca na web ao vivo feita pelo próprio modelo (tool "web_search" da
// Responses API), não mais um RSS público raspado por nós. Nenhum dado
// clínico ou de paciente é enviado à IA.

import { requireAuthOrCron } from './_auth.js';
import { fetchComRetentativa } from './_openai-retry.js';
import { applySheetImport } from '../lib/sheet-import.js';
import webpush from 'web-push';

const SHEET_URL = process.env.SHEET_CSV_URL || 'https://docs.google.com/spreadsheets/d/1rxeRgbqkaX6usYd8iSJYkNSqIlAeyJnDNxrIJJ7mPsI/gviz/tq?tqx=out:csv&gid=0';
const OPENAI_KEY = process.env.OPENAI_KEY;
// gpt-4.1-mini não consta mais na lista de modelos disponíveis da OpenAI.
// gpt-5.6-terra (não o gpt-5.6-sol, o flagship mais caro) é o meio-termo
// atual: $2/$12 por milhão de tokens entrada/saída contra $4/$20 do Sol.
const MODEL = process.env.OPENAI_TEXT_MODEL || 'gpt-5.6-terra';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
// Chave pública não é secreta (vai embutida no index.html também, pra
// pushManager.subscribe) -- só a privada precisa ficar só no Vercel.
const VAPID_PUBLIC_KEY = 'BI2ZG0TEK3GUeg3lp5BwcFLhshtdVlJHOpO1YHgcPgyYv4hzokR-Jb0q83hbOmtiwf06_d58-ICfYKweNRUsGt4';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:psi.jaquelinev@gmail.com';
if (VAPID_PRIVATE_KEY) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// Áreas temáticas que orientam a busca do próprio modelo -- antes eram 9
// queries fixas de RSS; agora são só um guia de cobertura, a busca em si é
// livre (o modelo decide quais termos usar e quantas buscas fazer).
const TEMAS = [
  'psicologia, saúde mental e desenvolvimento infantil',
  'parentalidade e educação emocional',
  'adolescência, redes sociais e autoestima',
  'saúde mental de adultos: trabalho, burnout, relacionamentos',
  'saúde mental na vida adulta: mulheres, homens, relações',
  'envelhecimento, solidão e cognição em idosos',
  'luto, ansiedade, depressão e relações humanas',
  'família e ciclo vital',
  'datas comemorativas relevantes para saúde mental e família'
];

const SUGGESTIONS_SCHEMA = {
  type: 'json_schema',
  name: 'radar_sugestoes',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      suggestions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            titulo: {type: 'string', description: 'título curto e atraente, sem sensacionalismo'},
            resumo: {type: 'string', description: 'o que está acontecendo'},
            por_que: {type: 'string', description: 'por que vale abordar agora'},
            faixa: {type: 'string', enum: ['Infância', 'Adolescência', 'Adultos', 'Idosos', 'Família', 'Ciclo vital']},
            formato: {type: 'string', enum: ['Carrossel', 'Post', 'Story']},
            potencial: {type: 'string', enum: ['Alto', 'Médio']},
            angulo: {type: 'string', description: 'abordagem concreta para uma psicóloga, sem aconselhamento individual'},
            fonte_titulo: {type: 'string', description: 'título real da notícia/fonte usada'},
            fonte_url: {type: 'string', description: 'URL real da notícia/fonte usada'},
            fonte_publicacao: {type: 'string', description: 'nome do veículo/publicação'}
          },
          required: ['titulo', 'resumo', 'por_que', 'faixa', 'formato', 'potencial', 'angulo', 'fonte_titulo', 'fonte_url', 'fonte_publicacao'],
          additionalProperties: false
        }
      }
    },
    required: ['suggestions'],
    additionalProperties: false
  }
};

async function askAI(){
  if(!OPENAI_KEY) throw new Error('OPENAI_KEY não configurada no Vercel');
  const instructions = `Você é estrategista de conteúdo ético para uma psicóloga brasileira que atende todo o ciclo vital: crianças, adolescentes, adultos e alguns idosos.
Sua função é buscar na web assuntos recentes (idealmente dos últimos 30 dias) que podem virar conteúdo educativo para Instagram, e selecionar no máximo 8 oportunidades reais, cada uma baseada numa notícia/fonte real que você efetivamente encontrou na busca -- nunca invente uma fonte, título, URL ou publicação.
Priorize fontes brasileiras em português, temas relevantes para o público brasileiro, utilidade prática, contexto e linguagem acolhedora.
Cubra, quando houver material realmente bom, estas frentes: Infância, Adolescência, Adultos, Idosos, Família/Parentalidade e Ciclo vital -- não invente uma oportunidade para uma categoria sem uma fonte real por trás. Não force equilíbrio entre faixas quando não houver material relevante; prefira qualidade a preencher categorias.
Entre as oportunidades, inclua pelo menos 1 ou 2 em formato Story sempre que o tema permitir: Story não é uma versão curta do conteúdo educativo do Carrossel/Post, é a psicóloga reagindo a esse assunto de forma pessoal e no calor do momento (um pensamento, sentimento ou bastidor genuíno do dia dela relacionado ao tema), nunca uma explicação em terceira pessoa. Não force um Story quando nenhum tema realmente render essa abordagem pessoal.
Não faça diagnóstico, não dê aconselhamento clínico individual, não use casos de pacientes, não exponha informações privadas, não invente estudos, números ou citações e não transforme uma notícia isolada em conclusão clínica. Evite clickbait e alarmismo.
Também considere assuntos sazonais, datas relevantes e temas que estejam ganhando atenção.`;
  const input = `Busque assuntos recentes cobrindo, quando houver material bom, estas áreas temáticas:
${TEMAS.map((t, i) => `${i + 1}) ${t}`).join('\n')}

Selecione no máximo 8 oportunidades de conteúdo reais, cada uma com a fonte real (título, URL e publicação) que você encontrou na busca.`;
  // Sem retentativa aqui (tentativas:0): uma chamada real já leva ~60s por
  // causa da busca na web ao vivo -- tentar de novo dobraria o tempo e
  // arriscaria estourar o maxDuration da função (120s, ver vercel.json).
  // Uma falha isolada só significa que o radar não atualiza nesta rodada
  // (roda de novo amanhã sozinho, ou a psicóloga clica em "Atualizar").
  const r = await fetchComRetentativa('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({
      model: MODEL,
      instructions,
      input,
      tools: [{type: 'web_search'}],
      text: {format: SUGGESTIONS_SCHEMA},
      max_output_tokens: 6000
    })
  }, {tentativas: 0, timeoutMs: 100000});
  const d = await r.json();
  if(!r.ok) throw new Error(d?.error?.message || 'Erro ao analisar tendências');
  const text = (d.output || []).flatMap(x => x.content || []).find(x => x.type === 'output_text')?.text;
  if(!text) throw new Error('A IA não retornou sugestões. Tente novamente.');
  return JSON.parse(text);
}
async function saveRadar(items){
  if(!SUPABASE_URL||!SUPABASE_KEY||!items.length) return;
  const rows=items.map(x=>({
    titulo:x.titulo||'', resumo:x.resumo||'', por_que:x.por_que||'',
    formato:x.formato||'Carrossel', potencial:x.potencial||'Médio', angulo:x.angulo||'',
    fonte_titulo:x.fonte?.title||'', fonte_url:x.fonte?.link||'', fonte_publicacao:x.fonte?.source||''
  }));
  const legacyAuthorization=SUPABASE_KEY.startsWith('sb_secret_')?{}:{Authorization:`Bearer ${SUPABASE_KEY}`};
  await fetch(`${SUPABASE_URL}/rest/v1/trend_radar`,{
    method:'POST',headers:{apikey:SUPABASE_KEY,...legacyAuthorization,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(rows)
  }).catch(()=>{});
}
// Folded into this same function (rather than a separate api/ file) because
// the Vercel Hobby plan caps a deployment at 12 serverless functions, and
// this project is already at that limit -- each route file is one function.
async function handleImportSheet(req,res){
  if (!await requireAuthOrCron(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({error: 'Method not allowed'});
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({error: 'SUPABASE_URL ou SUPABASE_SERVICE_KEY não configuradas no Vercel'});
  try {
    const result = await applySheetImport({supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY, sheetUrl: SHEET_URL});
    return res.status(200).json(result);
  } catch (error) {
    console.error('import-sheet error:', error);
    return res.status(500).json({error: 'Não foi possível importar a planilha'});
  }
}

// Notificações push. Dobrado aqui pelo mesmo motivo do import-sheet: a
// Vercel Hobby já está no limite de 12 funções serverless.
function spAgora(){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date());
  const get=t=>parts.find(x=>x.type===t)?.value;
  return {data:`${get('year')}-${get('month')}-${get('day')}`, minutos:Number(get('hour'))*60+Number(get('minute'))};
}
function addDiasISO(dataStr,dias){
  const d=new Date(`${dataStr}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+dias);return d.toISOString().slice(0,10);
}
function horarioParaMinutos(h){
  const [hh,mm]=String(h||'0:0').split(':').map(Number);
  return (hh||0)*60+(mm||0);
}
async function restTrends(path,options={}){
  const legacyAuthorization=SUPABASE_KEY.startsWith('sb_secret_')?{}:{Authorization:`Bearer ${SUPABASE_KEY}`};
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...options,headers:{apikey:SUPABASE_KEY,...legacyAuthorization,'Content-Type':'application/json',...(options.headers||{})}});
  const data=await r.json().catch(()=>null);
  if(!r.ok) throw new Error(`Falha no banco (${path}): ${r.status}`);
  return data;
}
async function enviarPushParaTodos(payload){
  if(!VAPID_PRIVATE_KEY) return;
  const subs=await restTrends('push_subscriptions?select=id,endpoint,p256dh,auth');
  for(const s of subs){
    try{
      await webpush.sendNotification({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth}},JSON.stringify(payload));
    }catch(e){
      // 404/410 = inscrição expirada/revogada pelo navegador -- limpa do banco.
      if(e.statusCode===404||e.statusCode===410){
        await restTrends(`push_subscriptions?id=eq.${encodeURIComponent(s.id)}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}).catch(()=>{});
      }
    }
  }
}
async function lembretesProntuario(){
  const {data:hoje,minutos:agora}=spAgora();
  const rows=await restTrends(`agenda_atendimentos?select=id,horario,pacientes(nome)&data_atendimento=eq.${hoje}&status=in.(agendado,realizado)&lembrete_prontuario_enviado_em=is.null`);
  for(const r of rows){
    if(agora<horarioParaMinutos(r.horario)+90) continue;
    await enviarPushParaTodos({title:'Atualizar prontuário',body:`Lembrete: atualize o prontuário de ${r.pacientes?.nome||'paciente'}.`,url:'/'});
    await restTrends(`agenda_atendimentos?id=eq.${encodeURIComponent(r.id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({lembrete_prontuario_enviado_em:new Date().toISOString()})}).catch(()=>{});
  }
}
async function resumoDoDiaSeguinte(){
  const {data:hoje,minutos:agora}=spAgora();
  if(agora<9*60) return;
  const existente=await restTrends(`notificacoes_diarias?select=data&data=eq.${hoje}`);
  if(existente.length) return;
  const amanha=addDiasISO(hoje,1);
  const resumo=await restTrends(`rpc/resumo_agenda_dia`,{method:'POST',body:JSON.stringify({p_data:amanha})});
  // Registra sempre (mesmo sem sessões) pra não recalcular a cada 15min o dia todo.
  await restTrends('notificacoes_diarias',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify({data:hoje})}).catch(()=>{});
  if(!resumo.length) return;
  const nomes=resumo.map(r=>r.nome).join(', ');
  const emDebito=resumo.filter(r=>r.saldo<0).map(r=>`${r.nome} (${Math.abs(r.saldo)} sessõe${Math.abs(r.saldo)===1?'':'s'} em débito)`);
  const renovam=resumo.filter(r=>r.pacote_habitual>1&&r.saldo===1).map(r=>r.nome);
  let body=`Amanhã tem sessão com ${nomes}.`;
  if(emDebito.length) body+=` Em débito: ${emDebito.join(', ')}.`;
  if(renovam.length) body+=` Renova pacote: ${renovam.join(', ')}.`;
  await enviarPushParaTodos({title:'Agenda de amanhã',body,url:'/'});
}
async function handleSendNotifications(req,res){
  if (!await requireAuthOrCron(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({error: 'Method not allowed'});
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({error: 'SUPABASE_URL ou SUPABASE_SERVICE_KEY não configuradas no Vercel'});
  try {
    await lembretesProntuario();
    await resumoDoDiaSeguinte();
    return res.status(200).json({ok:true});
  } catch (error) {
    console.error('send-notifications error:', error);
    return res.status(500).json({error: 'Não foi possível processar notificações'});
  }
}

export default async function handler(req,res){
  if(req.query?.job==='import-sheet') return handleImportSheet(req,res);
  if(req.query?.job==='send-notifications') return handleSendNotifications(req,res);
  if (!await requireAuthOrCron(req, res)) return;
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  try{
    const out=await askAI();
    // O schema estrito já devolve a fonte embutida em cada sugestão
    // (fonte_titulo/fonte_url/fonte_publicacao) -- reempacotada aqui no
    // mesmo formato aninhado (`fonte:{title,link,source}`) que o frontend e
    // o saveRadar já esperavam do fluxo antigo baseado em RSS, pra não
    // precisar mudar mais nada além da coleta em si.
    const suggestions=(Array.isArray(out.suggestions)?out.suggestions:[]).map(s=>({
      titulo:s.titulo, resumo:s.resumo, por_que:s.por_que, faixa:s.faixa, formato:s.formato, potencial:s.potencial, angulo:s.angulo,
      fonte:{title:s.fonte_titulo||'', link:s.fonte_url||'', source:s.fonte_publicacao||'', published_at:''}
    }));
    await saveRadar(suggestions);
    return res.status(200).json({generated_at:new Date().toISOString(),suggestions});
  }catch(e){
    console.error(e);
    return res.status(500).json({error:e.message});
  }
}
