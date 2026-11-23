// Camada central de modelos de IA: um lugar só para escolher modelo por tarefa e estimar custo.
// Decisão de 01/10/2026 (testes reais em farmacia-uailazo/docs/CUSTOS-OPENAI-TESTES.md):
// texto/visão = gpt-6-luna; imagem = gpt-image-2.5-flare em qualidade medium.
// Para trocar sem deploy de código: variável de ambiente AI_MODEL_<TAREFA> (ex.: AI_MODEL_POST).
// OPENAI_TEXT_MODEL (legado) foi aposentada de propósito: um valor antigo na Vercel não pode trocar o modelo.
// Nenhum nome de modelo deve aparecer fora deste arquivo. Mesma tabela PRICES do meudinheiro/Uailazo.

const DEFAULT_MODELS = {
  trends: 'gpt-6-luna',
  post: 'gpt-6-luna',
  ppt: 'gpt-6-luna',
  documents: 'gpt-6-luna',
  learning: 'gpt-6-luna',
  text: 'gpt-6-luna',
  transcription: 'whisper-1',
  image: 'gpt-image-2.5-flare',
};

export function modelFor(task) {
  const especifico = process.env[`AI_MODEL_${String(task).toUpperCase()}`]?.trim();
  if (especifico) return especifico;
  return DEFAULT_MODELS[task];
}

const MODEL_DISCOVERY_TTL_MS = 12 * 60 * 60 * 1000;
let _discoveryCache = { at: 0, ids: null };

export function clearModelDiscoveryCache() {
  _discoveryCache = { at: 0, ids: null };
}

function parseVersion(str) {
  return String(str || '').split('.').map(n => Number(n) || 0);
}

function compareVersionsDesc(a, b) {
  const va = parseVersion(a), vb = parseVersion(b);
  const len = Math.max(va.length, vb.length);
  for (let i = 0; i < len; i++) {
    const diff = (vb[i] || 0) - (va[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Seleciona a versão mais recente da família configurada a partir da lista de modelos da OpenAI. */
export function pickLatestFromList(task, ids) {
  const fallback = DEFAULT_MODELS[task];
  if (!Array.isArray(ids) || !ids.length || task === 'transcription') return fallback;

  if (task === 'image') {
    const matches = ids
      .map(id => {
        const m = String(id || '').match(/^gpt-image-(\d+(?:\.\d+)?)(?:-(flare))?$/i);
        return m ? { id, ver: m[1], isFlare: !!m[2] } : null;
      })
      .filter(Boolean)
      .sort((a, b) => compareVersionsDesc(a.ver, b.ver) || (Number(b.isFlare) - Number(a.isFlare)));
    return matches[0]?.id || fallback;
  }

  const matches = ids
    .map(id => {
      const m = String(id || '').match(/^gpt-(\d+(?:\.\d+)?)-luna$/i);
      return m ? { id, ver: m[1] } : null;
    })
    .filter(Boolean)
    .sort((a, b) => compareVersionsDesc(a.ver, b.ver));
  return matches[0]?.id || fallback;
}

/**
 * Resolve o modelo da tarefa consultando a lista de modelos da OpenAI (cache 12h)
 * para usar automaticamente a versão mais recente da família (luna / gpt-image).
 * Variáveis AI_MODEL_<TAREFA> têm prioridade; em caso de falha, usa DEFAULT_MODELS.
 */
export async function resolveModelFor(task, { apiKey, discover } = {}) {
  const especifico = process.env[`AI_MODEL_${String(task).toUpperCase()}`]?.trim();
  if (especifico) return especifico;
  if (task === 'transcription' || !apiKey) return DEFAULT_MODELS[task];
  if (process.env.NODE_TEST_CONTEXT && !discover) return DEFAULT_MODELS[task];

  const agora = Date.now();
  if (_discoveryCache.ids && agora - _discoveryCache.at < MODEL_DISCOVERY_TTL_MS) {
    return pickLatestFromList(task, _discoveryCache.ids);
  }

  try {
    const r = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return DEFAULT_MODELS[task];
    const data = await r.json();
    const ids = Array.isArray(data?.data) ? data.data.map(m => m?.id).filter(Boolean) : [];
    if (!ids.length) return DEFAULT_MODELS[task];
    _discoveryCache = { at: agora, ids };
    return pickLatestFromList(task, ids);
  } catch {
    return DEFAULT_MODELS[task];
  }
}

/** Qualidade de imagem: sempre medium (decisão do usuário; flare medium ≈ US$ 0,011 por imagem 1024x1536). */
export function imageQuality() {
  return 'medium';
}

/** Custo fixo estimado por imagem quando a API não devolve `usage`. */
export const IMAGE_FALLBACK_COST_USD = 0.011;

// US$ por 1M de tokens: [entrada, entrada em cache, saída]. Lidos em 01/10/2026 (CONFERIR em
// platform.openai.com/docs/pricing). gpt-6-luna: cache assumido em 10% da entrada (não confirmado).
// Custo guardado é ESTIMADO; o valor faturado só aparece em Costs na plataforma da OpenAI.
export const PRICES = {
  'gpt-6-luna': [0.1, 0.01, 0.5],
  'gpt-5.6-luna': [0.2, 0.02, 1.2],
  'gpt-5.6-terra': [2, 0.2, 12],
  'gpt-6.1-sol': [2, 0.2, 10],
  'gpt-4o-mini': [0.15, 0.075, 0.6],
  'gpt-image-2.5-flare': [5, 1.25, 30],
  'gpt-image-2': [5, 1.25, 30],
  'gpt-image-1.5': [5, 1.25, 32],
  'gpt-image-1': [5, 1.25, 40],
};

/** Custo estimado em US$; null quando o modelo não tem preço na tabela (guarda só os tokens). */
export function estimateCostUsd(model, usage) {
  const p = PRICES[model];
  if (!p) return null;
  const fresh = Math.max((usage.inputTokens || 0) - (usage.cachedTokens || 0), 0);
  return (fresh / 1e6) * p[0] + ((usage.cachedTokens || 0) / 1e6) * p[1] + ((usage.outputTokens || 0) / 1e6) * p[2];
}
