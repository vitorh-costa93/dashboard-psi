import { requireAuth } from './_auth.js';

export default async function handler(req, res) {
  if (!await requireAuth(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { type, prompt, size } = req.body;

  if (type !== 'image') {
    return res.status(400).json({ error: 'Tipo inválido' });
  }

  // The prompt text can *describe* an aspect ratio, but only this API
  // parameter actually controls the output pixel dimensions -- a request for
  // a vertical Story image still came out perfectly square before because
  // this was hardcoded to 1024x1024 regardless of what the prompt asked for.
  const ALLOWED_SIZES = new Set(['1024x1024', '1024x1536', '1536x1024']);
  const finalSize = ALLOWED_SIZES.has(size) ? size : '1024x1024';

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
        model: 'gpt-image-2',
        prompt,
        n: 1,
        size: finalSize,
      }),
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      const msg = err?.error?.message || 'Erro no GPT Image 2';
      return res.status(r.status).json({ error: msg });
    }

    const data = await r.json();

    // GPT Image 2 retorna b64_json por padrão; cobrimos fallback para url também
    let b64 = data.data?.[0]?.b64_json;

    if (!b64) {
      const imgUrl = data.data?.[0]?.url;
      if (!imgUrl) return res.status(500).json({ error: 'Nenhuma imagem retornada' });
      const imgRes = await fetch(imgUrl);
      const buffer = await imgRes.arrayBuffer();
      b64 = Buffer.from(buffer).toString('base64');
    }

    return res.status(200).json({ b64 });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
