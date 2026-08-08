export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { type, body, prompt } = req.body;

  // ── Gemini (texto) ──────────────────────────────────────────────────────
  if (type === 'gemini') {
    const apiKey = process.env.GEMINI_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_KEY não configurada' });

    const allowed = ['models/gemini-2.0-flash:generateContent'];
    if (!allowed.includes(body.endpoint)) {
      return res.status(403).json({ error: 'Endpoint não permitido' });
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/${body.endpoint}?key=${apiKey}`;
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body.body),
      });
      const data = await r.json();
      return res.status(r.status).json(data);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── Hugging Face (imagem) ───────────────────────────────────────────────
  if (type === 'image') {
    const hfKey = process.env.HF_TOKEN;
    if (!hfKey) return res.status(500).json({ error: 'HF_TOKEN não configurada' });

    try {
      const r = await fetch(
        'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell/v1/images/generations',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${hfKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ prompt, num_inference_steps: 4 }),
        }
      );

      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        return res.status(r.status).json({ error: err?.error || 'Erro no Hugging Face' });
      }

      // Retorna a imagem como base64
      const buffer = await r.arrayBuffer();
      const b64 = Buffer.from(buffer).toString('base64');
      return res.status(200).json({ b64 });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: 'Tipo inválido' });
}
