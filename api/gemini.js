export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { type, prompt } = req.body;

  if (type !== 'image') {
    return res.status(400).json({ error: 'Tipo inválido' });
  }

  const cfToken = process.env.CF_TOKEN;
  const cfAccount = process.env.CF_ACCOUNT_ID;

  if (!cfToken || !cfAccount) {
    return res.status(500).json({ error: 'CF_TOKEN ou CF_ACCOUNT_ID não configurados no Vercel' });
  }

  try {
    const r = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cfAccount}/ai/run/@cf/stabilityai/stable-diffusion-xl-base-1.0`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cfToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      }
    );

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(r.status).json({ error: err?.errors?.[0]?.message || 'Erro no Cloudflare Workers AI' });
    }

    // Cloudflare retorna a imagem como binário (PNG)
    const buffer = await r.arrayBuffer();
    const b64 = Buffer.from(buffer).toString('base64');
    return res.status(200).json({ b64 });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
