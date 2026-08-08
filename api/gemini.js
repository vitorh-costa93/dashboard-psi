export default async function handler(req, res) {
  // Só aceita POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_KEY não configurada no Vercel' });
  }

  const { endpoint, body } = req.body;

  // Endpoints permitidos (whitelist de segurança)
  const allowed = [
    'models/gemini-2.0-flash:generateContent',
    'models/gemini-3.1-flash-lite-image:generateContent',
    'models/gemini-2.0-flash-preview-image-generation:generateContent',
    'models/imagen-3.0-generate-002:predict',
  ];

  if (!allowed.includes(endpoint)) {
    return res.status(403).json({ error: 'Endpoint não permitido' });
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/${endpoint}?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
