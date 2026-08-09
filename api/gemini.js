export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { type, prompt } = req.body;

  if (type !== 'image') {
    return res.status(400).json({ error: 'Tipo inválido' });
  }

  const apiKey = process.env.OPENAI_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_KEY não configurada no Vercel' });
  }

  try {
    const r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size: '1024x1024',
        quality: 'standard',
      }),
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(r.status).json({ error: err?.error?.message || 'Erro no DALL-E 3' });
    }

    const data = await r.json();

    // A API pode retornar b64_json diretamente ou uma url — cobrimos os dois casos
    let b64 = data.data?.[0]?.b64_json;

    if (!b64) {
      const imgUrl = data.data?.[0]?.url;
      if (!imgUrl) return res.status(500).json({ error: 'Nenhuma imagem retornada' });

      // Baixa a imagem da URL e converte para base64
      const imgRes = await fetch(imgUrl);
      const buffer = await imgRes.arrayBuffer();
      b64 = Buffer.from(buffer).toString('base64');
    }

    return res.status(200).json({ b64 });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
