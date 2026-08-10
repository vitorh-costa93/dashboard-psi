// api/post-content.js
// Gera legenda/estrutura do post. A publicação no Instagram não é feita.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENAI_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENAI_KEY não configurada no Vercel' });

  const { tema, formato, publico, contexto } = req.body || {};
  if (!tema) return res.status(400).json({ error: 'Tema obrigatório' });

  const system = `Você cria conteúdo educativo para Instagram de uma psicóloga brasileira.
O objetivo é informar e gerar identificação sem fazer diagnóstico, prescrição ou promessa de resultado.
Evite linguagem sensacionalista. Não invente estudos, números ou citações.
Retorne APENAS JSON válido:
{
  "titulo": "...",
  "gancho": "...",
  "slides": ["...", "..."],
  "legenda": "...",
  "hashtags": ["#...", "#..."],
  "cta": "..."
}
Para carrossel, gere 5 a 8 slides. Para post, use slides como lista de 1 item.
A legenda deve ser pronta para revisão, clara e profissional.`;

  const user = `Tema: ${tema}
Formato: ${formato || 'Carrossel'}
Público: ${publico || 'pais e responsáveis'}
Contexto/trend que motivou a ideia: ${contexto || 'nenhum'}`;

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method:'POST',
      headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        model:'gpt-4o-mini',
        messages:[{role:'system',content:system},{role:'user',content:user}],
        temperature:0.7,
        response_format:{type:'json_object'}
      })
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({error:data?.error?.message || 'Erro ao gerar post'});
    const content = data.choices?.[0]?.message?.content;
    if (!content) return res.status(500).json({error:'Nenhum conteúdo retornado'});
    return res.status(200).json(JSON.parse(content));
  } catch(e) {
    return res.status(500).json({error:e.message});
  }
}
