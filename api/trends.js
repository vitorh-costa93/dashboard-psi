// Radar de tendências de conteúdo para uma psicóloga que atende todo o ciclo vital.
// Fontes: RSS público do Google News. Nenhum dado clínico ou de paciente é enviado à IA.

const OPENAI_KEY = process.env.OPENAI_KEY;
const MODEL = process.env.OPENAI_TEXT_MODEL || 'gpt-4.1-mini';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const FEEDS = [
  'psicologia saúde mental infância crianças',
  'parentalidade desenvolvimento infantil educação emocional',
  'adolescência redes sociais autoestima saúde mental',
  'saúde mental adultos trabalho burnout relacionamentos',
  'saúde mental mulheres homens vida adulta relacionamentos',
  'envelhecimento saúde mental idosos solidão luto cognição',
  'luto ansiedade depressão autoestima relações humanas',
  'família educação emocional ciclo vital saúde mental',
  'datas comemorativas saúde mental família educação'
];

function rssUrl(q){
  return 'https://news.google.com/rss/search?q='+encodeURIComponent(q)+'&hl=pt-BR&gl=BR&ceid=BR:pt-419';
}
function strip(s){
  return String(s||'')
    .replace(/<[^>]*>/g,' ')
    .replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"')
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/\s+/g,' ').trim();
}
function parseItems(xml){
  const out=[];
  const items=xml.match(/<item>[\s\S]*?<\/item>/g)||[];
  for(const item of items.slice(0,8)){
    const title=strip((item.match(/<title>([\s\S]*?)<\/title>/)||[])[1]);
    const link=(item.match(/<link>([\s\S]*?)<\/link>/)||[])[1]||'';
    const pub=(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)||[])[1]||'';
    const source=strip((item.match(/<source[^>]*>([\s\S]*?)<\/source>/)||[])[1]);
    if(title) out.push({title,link,source,published_at:pub});
  }
  return out;
}
async function collect(){
  const all=[];
  for(const q of FEEDS){
    try{
      const r=await fetch(rssUrl(q),{headers:{'User-Agent':'dashboard-psi-trends/1.0'}});
      if(r.ok) all.push(...parseItems(await r.text()));
    }catch(e){ console.error('RSS',q,e.message); }
  }
  const seen=new Set();
  return all.filter(x=>{
    const k=x.title.toLowerCase().replace(/\W+/g,' ').trim();
    if(seen.has(k)) return false;
    seen.add(k); return true;
  }).slice(0,55);
}
async function askAI(body){
  if(!OPENAI_KEY) throw new Error('OPENAI_KEY não configurada no Vercel');
  const r=await fetch('https://api.openai.com/v1/chat/completions',{
    method:'POST',
    headers:{Authorization:`Bearer ${OPENAI_KEY}`,'Content-Type':'application/json'},
    body:JSON.stringify({
      model:MODEL,
      temperature:.35,
      response_format:{type:'json_object'},
      messages:[
        {role:'system',content:`Você é estrategista de conteúdo ético para uma psicóloga brasileira que atende todo o ciclo vital: crianças, adolescentes, adultos e alguns idosos.
Sua função é identificar assuntos recentes que podem virar conteúdo educativo para Instagram.
Priorize temas relevantes para o público brasileiro, utilidade prática, contexto e linguagem acolhedora.
Não faça diagnóstico, não dê aconselhamento clínico individual, não use casos de pacientes, não exponha informações privadas, não invente estudos, números ou citações e não transforme uma notícia isolada em conclusão clínica.
Não force equilíbrio entre faixas quando não houver material relevante; prefira qualidade a preencher categorias.
Evite clickbait e alarmismo.
Retorne somente JSON válido.`},
        {role:'user',content:body}
      ]
    })
  });
  const d=await r.json();
  if(!r.ok) throw new Error(d?.error?.message||'Erro ao analisar tendências');
  return JSON.parse(d.choices?.[0]?.message?.content||'{}');
}
async function saveRadar(items){
  if(!SUPABASE_URL||!SUPABASE_KEY||!items.length) return;
  const rows=items.map(x=>({
    titulo:x.titulo||'', resumo:x.resumo||'', por_que:x.por_que||'',
    formato:x.formato||'Carrossel', potencial:x.potencial||'Médio', angulo:x.angulo||'',
    fonte_titulo:x.fonte?.title||'', fonte_url:x.fonte?.link||'', fonte_publicacao:x.fonte?.source||''
  }));
  await fetch(`${SUPABASE_URL}/rest/v1/trend_radar`,{
    method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(rows)
  }).catch(()=>{});
}
export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  try{
    const news=await collect();
    if(!news.length) return res.status(200).json({suggestions:[],sources:[],generated_at:new Date().toISOString()});
    const prompt=`Analise as notícias abaixo e selecione no máximo 8 oportunidades de conteúdo para o Instagram de uma psicóloga que atende todo o ciclo vital.
Cubra, quando houver material realmente bom, estas frentes: Infância, Adolescência, Adultos, Idosos, Família/Parentalidade e Ciclo vital. Não invente uma oportunidade para uma categoria sem base nas fontes.
Também considere assuntos sazonais, datas relevantes e temas que estejam ganhando atenção.
Para cada oportunidade retorne:
- titulo: título curto e atraente, sem sensacionalismo
- resumo: o que está acontecendo
- por_que: por que vale abordar agora
- faixa: Infância|Adolescência|Adultos|Idosos|Família|Ciclo vital
- formato: Carrossel|Post|Story|Reel
- potencial: Alto|Médio
- angulo: abordagem concreta para uma psicóloga, sem aconselhamento individual
- fonte_index: índice da notícia usada

JSON: {"suggestions":[...]}

NOTÍCIAS:
${news.map((x,i)=>`[${i}] ${x.title} | ${x.source} | ${x.published_at} | ${x.link}`).join('\n')}`;
    const out=await askAI(prompt);
    const suggestions=(Array.isArray(out.suggestions)?out.suggestions:[]).map(s=>({
      ...s, fonte:news[Number(s.fonte_index)]||null
    })).filter(s=>s.fonte);
    await saveRadar(suggestions);
    return res.status(200).json({generated_at:new Date().toISOString(),suggestions,sources:news.slice(0,18)});
  }catch(e){
    console.error(e);
    return res.status(500).json({error:e.message});
  }
}
