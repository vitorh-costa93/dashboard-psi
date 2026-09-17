// api/ppt-content.js
// Usa a API da OpenAI (texto) para estruturar o conteúdo de slides a partir de
// uma descrição da psicóloga. Retorna JSON estruturado que o frontend usa
// para montar o .pptx com a biblioteca PptxGenJS.

import { requireAuth } from './_auth.js';
import { fetchComRetentativa } from './_openai-retry.js';
import { PERFIL_JAQUELINE } from '../lib/perfil-jaqueline.js';
import { extrairTextoAnexo, validarImagemAnexo, AnexoError } from '../lib/anexo.js';
import { buscarPreferenciaTexto, aprenderComAjusteChat } from '../lib/aprendizado.js';

export default async function handler(req, res) {
  const user=await requireAuth(req, res);if(!user)return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENAI_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_KEY não configurada no Vercel' });
  }

  const { descricao, publico, tema, historico: historicoBruto, ajuste, anexo, imagem } = req.body;
  if (!descricao) {
    return res.status(400).json({ error: 'Descrição obrigatória' });
  }
  if(historicoBruto!==undefined&&!Array.isArray(historicoBruto))return res.status(400).json({error:'Histórico inválido'});
  const historico=(historicoBruto||[]).map(h=>({papel:h?.papel==='assistente'?'assistente':'usuario',texto:String(h?.texto||'').trim().slice(0,4000)})).filter(h=>h.texto).slice(-20);
  let anexoTexto=null;
  if(anexo!=null){
    try{const extraido=await extrairTextoAnexo(anexo);anexoTexto=`Conteúdo do arquivo enviado (${extraido.nome}):\n"""\n${extraido.texto}\n"""`;}
    catch(e){if(e instanceof AnexoError)return res.status(e.status).json({error:e.message});throw e;}
  }
  let imagemValidada=null;
  if(imagem!=null){
    try{imagemValidada=validarImagemAnexo(imagem);}
    catch(e){if(e instanceof AnexoError)return res.status(e.status).json({error:e.message});throw e;}
  }

  const systemPrompt = `Você é especialista em criar apresentações terapêuticas para psicólogos mostrarem a pacientes (incluindo crianças).
Gere o conteúdo de uma apresentação de slides em formato JSON.
Gere entre 4 e 8 slides. Linguagem simples e acolhedora, adequada ao público informado.
Cada slide deve ter no máximo 4 pontos curtos (max 12 palavras cada).
Entregue sempre uma proposta pronta pra aplicar no consultório, com aplicabilidade real -- nunca só uma ideia abstrata.

Se a mensagem do usuário pedir um AJUSTE sobre uma apresentação já gerada (você verá o conteúdo anterior no histórico da conversa), reescreva o objeto JSON inteiro aplicando o que foi pedido e mantendo tudo o que não foi pedido para mudar.

Defina incluirLogo=true SOMENTE se a psicóloga pedir explicitamente para incluir a logo/marca/logotipo do consultório na capa da apresentação; caso contrário incluirLogo=false.

${PERFIL_JAQUELINE}`;
  const preferenciaAprendida=await buscarPreferenciaTexto('apresentacoes');
  const systemComAprendizado=preferenciaAprendida?`${systemPrompt}\n\nObservações de estilo já aprendidas com esta psicóloga em conversas anteriores (aplique com prioridade alta, junto com as regras acima):\n${preferenciaAprendida}`:systemPrompt;

  const primeiroPedido = `Público: ${publico || 'paciente'}
Tema: ${tema || 'geral'}
Descrição do que a psicóloga quer na apresentação: ${descricao}`;
  const pedidoTextoBase = historico.length ? (String(ajuste || '').trim() || primeiroPedido) : primeiroPedido;
  const pedidoTexto = anexoTexto ? `${anexoTexto}\n\n${pedidoTextoBase}` : pedidoTextoBase;
  // Com imagem de referência, o conteúdo do último turno vira multimodal
  // (texto + imagem), mesmo padrão já usado em api/post-content.js.
  const userPrompt = imagemValidada
    ? [{type:'text',text:pedidoTexto},{type:'image_url',image_url:{url:`data:${imagemValidada.tipo};base64,${imagemValidada.base64}`}}]
    : pedidoTexto;

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
          { role: 'system', content: systemComAprendizado },
          ...historico.map(h=>({role:h.papel==='assistente'?'assistant':'user',content:h.texto})),
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
                },
                incluirLogo: { type: 'boolean' }
              },
              required: ['titulo', 'slides', 'incluirLogo'],
              additionalProperties: false
            }
          }
        },
      }),
    // vercel.json define maxDuration:45 pra esta função -- 2 tentativas de
    // 20s (+ backoff) cabem em ~40.5s. Antes não havia limite explícito no
    // vercel.json e o retry interno podia chegar a ~91s (achado numa
    // varredura depois que a geração de imagem estourou o limite dela).
    }, {tentativas: 1, timeoutMs: 20000});

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(r.status).json({ error: err?.error?.message || 'Erro ao gerar conteúdo' });
    }

    const data = await r.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return res.status(500).json({ error: 'Nenhum conteúdo retornado' });

    const parsed = JSON.parse(content);
    if(historico.length){
      await aprenderComAjusteChat({contexto:'apresentacoes',pedido:String(ajuste||'').trim(),atual:preferenciaAprendida,key:apiKey,autorId:user?.id});
    }
    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
