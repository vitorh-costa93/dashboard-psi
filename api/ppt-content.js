// api/ppt-content.js
// Usa a API da OpenAI (texto) para estruturar o conteúdo de slides a partir de
// uma descrição da psicóloga. Retorna JSON estruturado que o frontend usa
// para montar o .pptx com a biblioteca PptxGenJS.

import { requireAuth } from './_auth.js';
import { fetchComRetentativa } from './_openai-retry.js';
import { PERFIL_JAQUELINE } from '../lib/perfil-jaqueline.js';

export default async function handler(req, res) {
  if (!await requireAuth(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENAI_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_KEY não configurada no Vercel' });
  }

  const { descricao, publico, tema } = req.body;
  if (!descricao) {
    return res.status(400).json({ error: 'Descrição obrigatória' });
  }

  const systemPrompt = `Você é especialista em criar apresentações terapêuticas para psicólogos mostrarem a pacientes (incluindo crianças).
Gere o conteúdo de uma apresentação de slides em formato JSON.
Gere entre 4 e 8 slides. Linguagem simples e acolhedora, adequada ao público informado.
Cada slide deve ter no máximo 4 pontos curtos (max 12 palavras cada).
Entregue sempre uma proposta pronta pra aplicar no consultório, com aplicabilidade real -- nunca só uma ideia abstrata.

${PERFIL_JAQUELINE}`;

  const userPrompt = `Público: ${publico || 'paciente'}
Tema: ${tema || 'geral'}
Descrição do que a psicóloga quer na apresentação: ${descricao}`;

  try {
    // gpt-4o-mini não consta mais na lista de modelos disponíveis da OpenAI;
    // gpt-5.6-terra (mesmo modelo já usado em post-content.js) rejeita
    // temperature customizado, por isso o parâmetro foi removido daqui.
    // Structured Outputs (json_schema+strict) no lugar do antigo json_object,
    // mesma melhoria já aplicada em post-content.js.
    const r = await fetchComRetentativa('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_TEXT_MODEL || 'gpt-5.6-terra',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'apresentacao',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                titulo: {type: 'string'},
                slides: {
                  type: 'array',
                  minItems: 4,
                  maxItems: 8,
                  items: {
                    type: 'object',
                    properties: {
                      titulo: {type: 'string'},
                      conteudo: {type: 'array', items: {type: 'string'}, minItems: 1, maxItems: 4}
                    },
                    required: ['titulo', 'conteudo'],
                    additionalProperties: false
                  }
                }
              },
              required: ['titulo', 'slides'],
              additionalProperties: false
            }
          }
        },
      }),
    }, {tentativas: 2, timeoutMs: 30000});

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(r.status).json({ error: err?.error?.message || 'Erro ao gerar conteúdo' });
    }

    const data = await r.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return res.status(500).json({ error: 'Nenhum conteúdo retornado' });

    const parsed = JSON.parse(content);
    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
