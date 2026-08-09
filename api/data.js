// api/data.js
// Proxy simples para o Supabase — evita expor a chave no frontend
// e centraliza CRUD de "atividades" e "prontuarios"

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY;

async function supaFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...(options.headers || {}),
    },
  });
  return res;
}

export default async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'SUPABASE_URL ou SUPABASE_SERVICE_KEY não configuradas no Vercel' });
  }

  const { table, action } = req.query; // table = 'atividades' | 'prontuarios'

  if (!['atividades', 'prontuarios'].includes(table)) {
    return res.status(400).json({ error: 'Tabela inválida' });
  }

  try {
    // ── LISTAR TUDO ──────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const r = await supaFetch(`${table}?select=*&order=criado_em.desc`);
      const data = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: data });
      return res.status(200).json(data);
    }

    // ── CRIAR ────────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const r = await supaFetch(table, {
        method: 'POST',
        body: JSON.stringify(req.body),
      });
      const data = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: data });
      return res.status(200).json(data);
    }

    // ── ATUALIZAR (por id) ───────────────────────────────────────────────────
    if (req.method === 'PATCH') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id obrigatório' });
      const r = await supaFetch(`${table}?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify(req.body),
      });
      const data = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: data });
      return res.status(200).json(data);
    }

    // ── DELETAR (por id) ─────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id obrigatório' });
      const r = await supaFetch(`${table}?id=eq.${id}`, { method: 'DELETE' });
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
