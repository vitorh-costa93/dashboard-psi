export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { type, prompt } = req.body;

  if (type !== 'image') {
    return res.status(400).json({ error: 'Tipo inválido' });
  }

  const hfKey = process.env.HF_TOKEN;
  if (!hfKey) return res.status(500).json({ error: 'HF_TOKEN não configurada no Vercel' });

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

    const buffer = await r.arrayBuffer();
    const b64 = Buffer.from(buffer).toString('base64');
    return res.status(200).json({ b64 });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
