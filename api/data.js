// api/data.js
// Proxy do Supabase. A chave sensível permanece somente no servidor.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY;

const TABLES = ['atividades', 'prontuarios', 'pacientes', 'posts', 'trend_radar'];

async function supaFetch(path, options = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...(options.headers || {}),
    },
  });
}

export default async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'SUPABASE_URL ou SUPABASE_SERVICE_KEY não configuradas no Vercel' });
  }

  const { table, action } = req.query;

  if (!TABLES.includes(table)) {
    return res.status(400).json({ error: 'Tabela inválida' });
  }

  try {
    if (req.method === 'GET') {
      const order = table === 'pacientes' ? 'nome.asc' : 'criado_em.desc';
      const r = await supaFetch(`${table}?select=*&order=${order}`);
      const data = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: data });
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      // Upsert de pacientes por nome. Isso garante um ID permanente mesmo
      // quando o dia/horário do paciente muda na planilha.
      if (table === 'pacientes' || action === 'upsert') {
        const r = await supaFetch(table, {
          method: 'POST',
          headers: {
            'Prefer': 'resolution=merge-duplicates,return=representation',
          },
          body: JSON.stringify(req.body),
        });
        const data = await r.json();
        if (!r.ok) return res.status(r.status).json({ error: data });
        return res.status(200).json(data);
      }

      const r = await supaFetch(table, {
        method: 'POST',
        body: JSON.stringify(req.body),
      });
      const data = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: data });
      return res.status(200).json(data);
    }

    if (req.method === 'PATCH') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id obrigatório' });
      const r = await supaFetch(`${table}?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(req.body),
      });
      const data = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: data });
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id obrigatório' });
      const r = await supaFetch(`${table}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        return res.status(r.status).json({ error: data });
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
