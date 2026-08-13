// api/data.js
// Proxy do Supabase. A chave sensível permanece somente no servidor.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY;

const TABLES = ['atividades', 'prontuarios', 'pacientes', 'posts', 'trend_radar', 'post_artes'];

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
  if (!TABLES.includes(table)) return res.status(400).json({ error: 'Tabela inválida' });

  try {
    if (req.method === 'GET') {
      if (table === 'posts' && action === 'detail') {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'id obrigatório' });
        const r = await supaFetch(`posts?select=*&id=eq.${encodeURIComponent(id)}`);
        const data = await r.json();
        if (!r.ok) return res.status(r.status).json({ error: data });
        const post = data?.[0] || null;
        if (!post) return res.status(404).json({ error: 'Rascunho não encontrado' });
        const ir = await supaFetch(`post_artes?select=ordem,image_b64&post_id=eq.${encodeURIComponent(id)}&order=ordem.asc`);
        const imagens = await ir.json();
        if (ir.ok) post.imagens_b64 = (imagens || []).map(x=>x.image_b64).filter(Boolean);
        else post.imagens_b64 = Array.isArray(post.imagens_b64)?post.imagens_b64.filter(Boolean):[];
        return res.status(200).json(post);
      }
      if (table === 'post_artes') {
        const { post_id } = req.query;
        if (!post_id) return res.status(400).json({ error: 'post_id obrigatório' });
        const r = await supaFetch(`post_artes?select=ordem,image_b64&post_id=eq.${encodeURIComponent(post_id)}&order=ordem.asc`);
        const data = await r.json(); if(!r.ok)return res.status(r.status).json({error:data});
        return res.status(200).json(data);
      }
      const select = table === 'posts' ? 'id,titulo,tema,formato,publico,status,criado_em,logo_cor' : '*';
      const order = table === 'pacientes' ? 'nome.asc' : 'criado_em.desc';
      const r = await supaFetch(`${table}?select=${select}&order=${order}`);
      const data = await r.json(); if(!r.ok)return res.status(r.status).json({error:data});
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      if (table === 'posts' && action === 'append-image') {
        const { id } = req.query; const image_b64=req.body?.image_b64; const ordem=Number(req.body?.ordem ?? 0);
        if(!id || !image_b64)return res.status(400).json({error:'id e image_b64 são obrigatórios'});
        // Apaga uma eventual arte na mesma posição e insere a nova. Cada request leva somente uma imagem.
        await supaFetch(`post_artes?post_id=eq.${encodeURIComponent(id)}&ordem=eq.${encodeURIComponent(ordem)}`,{method:'DELETE'});
        const r=await supaFetch('post_artes',{method:'POST',body:JSON.stringify({post_id:id,ordem,image_b64})});
        const data=await r.json();if(!r.ok)return res.status(r.status).json({error:data});
        return res.status(200).json({id,ordem});
      }
      if (table === 'pacientes' || action === 'upsert') {
        const r=await supaFetch(`${table}?on_conflict=nome`,{method:'POST',headers:{'Prefer':'resolution=merge-duplicates,return=representation'},body:JSON.stringify(req.body)});
        const data=await r.json();if(!r.ok)return res.status(r.status).json({error:data});return res.status(200).json(data);
      }
      const r=await supaFetch(table,{method:'POST',body:JSON.stringify(req.body)});
      const data=await r.json();if(!r.ok)return res.status(r.status).json({error:data});return res.status(200).json(data);
    }

    if (req.method === 'PATCH') {
      const { id } = req.query;if(!id)return res.status(400).json({error:'id obrigatório'});
      const r=await supaFetch(`${table}?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(req.body)});
      const data=await r.json();if(!r.ok)return res.status(r.status).json({error:data});return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;if(!id)return res.status(400).json({error:'id obrigatório'});
      const r=await supaFetch(`${table}?id=eq.${encodeURIComponent(id)}`,{method:'DELETE'});
      if(!r.ok){const data=await r.json().catch(()=>({}));return res.status(r.status).json({error:data});}
      return res.status(200).json({ok:true});
    }
    return res.status(405).json({error:'Method not allowed'});
  } catch(e){ return res.status(500).json({error:e.message}); }
}
