// Log de uso/custo das chamadas à OpenAI na tabela public.ai_usage (custo ESTIMADO).
// Nunca lança: falha de log não pode derrubar a funcionalidade. O teto mensal só AVISA.
import {supabase} from '../api/_auth.js';
import {estimateCostUsd, IMAGE_FALLBACK_COST_USD} from './ai-models.js';

function monthlyCap() {
  const n = Number(process.env.AI_MONTHLY_CAP_USD);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

/** Extrai tokens de um `usage` da OpenAI (chat/completions, responses ou images). */
export function parseUsage(usage) {
  const u = usage || {};
  return {
    inputTokens: u.prompt_tokens ?? u.input_tokens ?? 0,
    cachedTokens: u.prompt_tokens_details?.cached_tokens ?? u.input_tokens_details?.cached_tokens ?? 0,
    outputTokens: u.completion_tokens ?? u.output_tokens ?? 0,
    reasoningTokens: u.completion_tokens_details?.reasoning_tokens ?? u.output_tokens_details?.reasoning_tokens ?? 0,
  };
}

/**
 * Registra uma chamada de IA.
 * rec: {task, model, ok, usage (objeto cru da OpenAI), costUsd?, durationMs?, error?}
 * Para imagem sem `usage`, use imageFallback:true (custo fixo por imagem).
 */
export async function logAiUsage(rec) {
  try {
    const t = parseUsage(rec.usage);
    let cost = rec.costUsd;
    if (cost === undefined) {
      const temUsage = t.inputTokens || t.outputTokens;
      cost = !temUsage && rec.imageFallback && rec.ok ? IMAGE_FALLBACK_COST_USD : estimateCostUsd(rec.model, t);
    }
    const r = await supabase('/rest/v1/ai_usage', {
      method: 'POST',
      headers: {Prefer: 'return=minimal'},
      body: JSON.stringify({
        task: rec.task,
        model: rec.model,
        ok: rec.ok !== false,
        input_tokens: t.inputTokens,
        cached_tokens: t.cachedTokens,
        output_tokens: t.outputTokens,
        reasoning_tokens: t.reasoningTokens,
        cost_usd: cost,
        duration_ms: rec.durationMs != null ? Math.round(rec.durationMs) : null,
        error: rec.error ? String(rec.error).slice(0, 300) : null,
      }),
    });
    if (!r.ok) { console.error('logAiUsage: falha ao gravar', r.status); return; }
    const inicio = new Date(); inicio.setUTCDate(1); inicio.setUTCHours(0, 0, 0, 0);
    const g = await supabase(`/rest/v1/ai_usage?select=cost_usd&created_at=gte.${encodeURIComponent(inicio.toISOString())}`);
    if (!g.ok) return;
    const rows = await g.json();
    const gasto = (Array.isArray(rows) ? rows : []).reduce((s, x) => s + Number(x.cost_usd ?? 0), 0);
    const teto = monthlyCap();
    if (gasto >= teto) console.warn(`[ai] gasto estimado do mês US$ ${gasto.toFixed(2)} passou do teto US$ ${teto.toFixed(2)}`);
  } catch (e) {
    console.error('logAiUsage failed:', e);
  }
}

/** Mede a duração de uma chamada: const fim = iniciarMedicao(); ... fim() -> ms. */
export function iniciarMedicao() {
  const t0 = Date.now();
  return () => Date.now() - t0;
}
