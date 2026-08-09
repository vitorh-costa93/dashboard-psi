// api/ppt-content.js
// Usa a API da OpenAI (texto, gpt-4o-mini) para estruturar o conteúdo de slides
// a partir de uma descrição da psicóloga. Retorna JSON estruturado que o
// frontend usa para montar o .pptx com a biblioteca PptxGenJS.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENAI_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_KEY não configurada no Vercel' });
  }

  const { descricao, publico, tema } = req.body;
  if (!descricao) {
    return res.status(400).json({ error: 'Descrição obrigatória' });
  }

  const systemPrompt = `Você é especialista em criar apresentações terapêuticas para psicólogos mostrarem a pacientes (incluindo crianças).
Gere o conteúdo de uma apresentação de slides em formato JSON.
Responda APENAS com um JSON válido, sem markdown, sem explicações, no formato:
{
  "titulo": "Título da apresentação",
  "slides": [
    { "titulo": "Título do slide", "conteudo": ["ponto 1", "ponto 2", "ponto 3"] }
  ]
}
Gere entre 4 e 8 slides. Linguagem simples e acolhedora, adequada ao público informado.
Cada slide deve ter no máximo 4 pontos curtos (max 12 palavras cada).`;

  const userPrompt = `Público: ${publico || 'paciente'}
Tema: ${tema || 'geral'}
Descrição do que a psicóloga quer na apresentação: ${descricao}`;

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' },
      }),
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(r.status).json({ error: err?.error?.message || 'Erro ao gerar conteúdo' });
    }

    const data = await r.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return res.status(500).json({ error: 'Nenhum conteúdo retornado' });

    const parsed = JSON.parse(content);
    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
