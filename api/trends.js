// api/trends.js
// Busca assuntos recentes e transforma as notícias em ideias de conteúdo.
// Não publica nada no Instagram.

const OPENAI_KEY = process.env.OPENAI_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const QUERIES = [
  'psicologia infantil saúde mental crianças',
  'parentalidade desenvolvimento infantil ansiedade',
  'psicologia adolescência saúde mental',
  'educação emocional crianças pais'
];

function decodeEntities(s='') {
  return s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'")
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>');
}

function parseRSS(xml) {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)];
  return items.map(m => {
    const x = m[1];
    const get = tag => {
      const hit = x.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      return hit ? decodeEntities(hit[1].replace(/<!\[CDATA\[|\]\]>/g,'' ).trim()) : '';
    };
    return {
      title: get('title'),
      link: get('link'),
      pubDate: get('pubDate'),
      source: get('source'),
    };
  }).filter(x => x.title && x.link);
}

async function getNews() {
  const all = [];
  for (const q of QUERIES) {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
    const r = await fetch(url);
    if (!r.ok) continue;
    all.push(...parseRSS(await r.text()));
  }
  const seen = new Set();
  return all.filter(x => {
    const k = x.title.toLowerCase().replace(/\W+/g,' ').trim();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 24);
}


async function saveSuggestions(suggestions) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !suggestions.length) return;
  const rows=suggestions.map(s=>({
    titulo:s.titulo||'',
    resumo:s.resumo||'',
    por_que:s.por_que||'',
    formato:s.formato||'Carrossel',
    potencial:s.potencial||'Médio',
    angulo:s.angulo||'',
    fonte_titulo:s.fonte?.title||'',
    fonte_url:s.fonte?.link||'',
    fonte_publicacao:s.fonte?.source||''
  }));
  await fetch(`${SUPABASE_URL}/rest/v1/trend_radar`,{
    method:'POST',
    headers:{
      apikey:SUPABASE_KEY,
      Authorization:`Bearer ${SUPABASE_KEY}`,
      'Content-Type':'application/json',
      Prefer:'return=minimal'
    },
    body:JSON.stringify(rows)
  }).catch(()=>{});
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!OPENAI_KEY) return res.status(500).json({ error: 'OPENAI_KEY não configurada no Vercel' });

  try {
    const news = await getNews();
    if (!news.length) return res.status(200).json({ suggestions: [], sources: [] });

    const system = `Você é estrategista de conteúdo para uma psicóloga brasileira.
Analise notícias recentes e sugira oportunidades de conteúdo para Instagram.
Não faça diagnóstico, não dê aconselhamento clínico individual e não transforme notícia em afirmação médica.
Priorize conteúdo educativo, responsável, acolhedor e adequado a pais, crianças e adolescentes.
Retorne APENAS JSON válido no formato:
{
  "suggestions": [
    {
      "titulo": "até 80 caracteres",
      "resumo": "até 180 caracteres",
      "por_que": "até 220 caracteres",
      "formato": "Carrossel|Post|Story|Reel",
      "potencial": "Alto|Médio",
      "angulo": "ideia concreta para o post",
      "fonte_index": 0
    }
  ]
}
Gere no máximo 6 sugestões e escolha assuntos realmente diferentes entre si.`;

    const user = `Notícias encontradas agora:\n${news.map((n,i) =>
      `[${i}] ${n.title} — ${n.source} — ${n.pubDate} — ${n.link}`
    ).join('\n')}`;

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{role:'system',content:system},{role:'user',content:user}],
        temperature: 0.5,
        response_format: { type: 'json_object' }
      })
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data?.error?.message || 'Erro ao analisar tendências' });

    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{"suggestions":[]}');
    const suggestions = (parsed.suggestions || []).map(s => ({
      ...s,
      fonte: news[Number(s.fonte_index)] || null
    })).filter(s => s.fonte);

    await saveSuggestions(suggestions);
    return res.status(200).json({
      generated_at: new Date().toISOString(),
      suggestions,
      sources: news.slice(0, 12)
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
