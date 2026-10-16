import {supabase} from './_auth.js';

// Cache de leitura compartilhado entre instâncias (tabela dashboard_cache no
// Supabase), invalidado por trigger a cada escrita nas tabelas lidas pelo
// Dashboard/Agenda -- ver supabase/migrations/20261016120000_dashboard_cache.sql.
// Nunca serve dado velho: o payload só vale para a versão vigente. A cópia em
// memória só poupa o download do payload; a versão é sempre confirmada no banco.
// Se a migração não existir ou o banco falhar, cai para o cálculo direto.
const mem = new Map();
const MEM_MAX = 40;

async function rpc(nome, corpo) {
  const r = await supabase('/rest/v1/rpc/' + nome, {method: 'POST', body: JSON.stringify(corpo || {})});
  if (!r.ok) throw new Error('cache ' + nome + ' ' + r.status);
  return r.json();
}

export async function cached(chave, compute) {
  let versao;
  try { versao = Number(await rpc('dashboard_cache_versao')); } catch { return compute(); }
  const m = mem.get(chave);
  if (m && m.versao === versao) return m.payload;
  try {
    const p = await rpc('dashboard_cache_get', {p_chave: chave});
    if (p != null) { guardar(chave, versao, p); return p; }
  } catch { /* segue para o cálculo */ }
  const payload = await compute();
  guardar(chave, versao, payload);
  rpc('dashboard_cache_put', {p_chave: chave, p_versao: versao, p_payload: payload}).catch(() => {});
  return payload;
}

function guardar(chave, versao, payload) {
  if (mem.size >= MEM_MAX && !mem.has(chave)) mem.delete(mem.keys().next().value);
  mem.set(chave, {versao, payload});
}
