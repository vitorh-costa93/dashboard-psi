// api/data.js
// Proxy do Supabase. A chave sensível permanece somente no servidor.

import { requireAuth } from './_auth.js';
import { encryptClinicalData, decryptClinicalData } from './_clinical-crypto.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY;

const TABLES = ['atividades', 'prontuarios', 'pacientes', 'posts', 'trend_radar', 'post_artes'];

// "relato" é o registro da sessão em si -- o dado mais sensível deste app --
// e por uma inconsistência foi deixado de fora da criptografia que
// documentos_clinicos/anamnese/formulário externo já tinham. Corrigido aqui
// só para esse campo (paciente_id/data_sessao/etc. continuam em texto
// simples, como já eram, pois precisam ser filtráveis). decryptClinicalData
// já devolve o valor original quando não é um envelope criptografado, então
// prontuários antigos (salvos em texto puro antes desta mudança) continuam
// legíveis normalmente -- não é preciso migrar nada, a criptografia passa a
// valer só a partir da próxima vez que cada prontuário for salvo.
function decriptarProntuario(row) {
  return row && 'relato' in row ? {...row, relato: decryptClinicalData(row.relato)} : row;
}
function encriptarRelato(body) {
  return body && 'relato' in body ? {...body, relato: encryptClinicalData(body.relato)} : body;
}

async function supaFetch(path, options = {}) {
  const legacyAuthorization = SUPABASE_KEY?.startsWith('sb_secret_') ? {} : { 'Authorization': `Bearer ${SUPABASE_KEY}` };
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_KEY,
      ...legacyAuthorization,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...(options.headers || {}),
    },
  });
}

export default async function handler(req, res) {
  if (!await requireAuth(req, res)) return;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'SUPABASE_URL ou SUPABASE_SERVICE_KEY não configuradas no Vercel' });
  }
  const { table, action } = req.query;

  // Backup sob demanda (não precisa de "table": exporta todas de uma vez).
  // Dobrado aqui em vez de virar uma rota própria porque o projeto já está
  // no limite de 12 funções serverless do plano gratuito da Vercel.
  if (req.method === 'GET' && action === 'export-tudo') {
    try {
      const dados = {};
      for (const t of TABLES) {
        const order = t === 'pacientes' ? 'nome.asc' : 'criado_em.desc';
        const r = await supaFetch(`${t}?select=*&order=${order}`);
        const rows = await r.json();
        dados[t] = r.ok ? (t === 'prontuarios' ? rows.map(decriptarProntuario) : rows) : [];
      }
      return res.status(200).json({gerado_em: new Date().toISOString(), dados});
    } catch (e) {
      return res.status(500).json({error: e.message});
    }
  }

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
      if (table === 'prontuarios' && action === 'resumo') {
        const r = await supaFetch('prontuarios?select=paciente_id,criado_em&order=criado_em.desc');
        const data = await r.json(); if(!r.ok)return res.status(r.status).json({error:data});
        return res.status(200).json(data);
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
      return res.status(200).json(table === 'prontuarios' ? data.map(decriptarProntuario) : data);
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
      const body = table === 'prontuarios' ? encriptarRelato(req.body) : req.body;
      const r=await supaFetch(table,{method:'POST',body:JSON.stringify(body)});
      const data=await r.json();if(!r.ok)return res.status(r.status).json({error:data});
      return res.status(200).json(table === 'prontuarios' ? data.map(decriptarProntuario) : data);
    }

    if (req.method === 'PATCH') {
      const { id } = req.query;if(!id)return res.status(400).json({error:'id obrigatório'});
      const body = table === 'prontuarios' ? encriptarRelato(req.body) : req.body;
      const r=await supaFetch(`${table}?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(body)});
      const data=await r.json();if(!r.ok)return res.status(r.status).json({error:data});
      return res.status(200).json(table === 'prontuarios' ? data.map(decriptarProntuario) : data);
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
