import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { requireAuth } from './_auth.js';
import { fetchComRetentativa } from './_openai-retry.js';
import { extrairTextoAnexo, validarImagemAnexo, AnexoError } from '../lib/anexo.js';
import { buscarPreferenciaTexto, aprenderComAjusteChat } from '../lib/aprendizado.js';
import { PERFIL_JAQUELINE } from '../lib/perfil-jaqueline.js';

// The prompt text can *describe* an aspect ratio, but only this API parameter
// actually controls the output pixel dimensions -- a request for a vertical
// Story image still came out perfectly square before because this was
// hardcoded to 1024x1024 regardless of what the prompt asked for.
const ALLOWED_SIZES = new Set(['1024x1024', '1024x1536', '1536x1024']);
// GPT Image 2.5 Flare entrega geração cotidiana rápida e de alta qualidade,
// apropriada para o fluxo recorrente de posts e stories.
const IMAGE_MODEL = 'gpt-image-2.5-flare';

// AbortError vira "This operation was aborted" (ou variações) na mensagem
// crua do Node/undici -- ilegível pra quem está usando o app. Reportado ao
// vivo: geração de atividade infantil estourou o timeout e essa mensagem
// técnica apareceu direto na tela da psicóloga.
function mensagemErro(e) {
  if (e?.name === 'AbortError') return 'A geração demorou mais do que o esperado e foi interrompida. Tente novamente.';
  return e.message;
}

// Referência de ESTILO (nunca de conteúdo) para a edição de fotos próprias --
// desenhada com a skill canvas-design (filosofia "Calor Editorial": paleta
// terrosa, tipografia dupla serifada+manuscrita, etiquetas 100% flat/2D,
// bandas verticais bem espaçadas) com texto de exemplo genérico, não um
// print de uma data comemorativa específica -- evita qualquer risco de a IA
// "vazar" conteúdo de ocasião pontual pro resto do ano, e pode ser
// regenerada a qualquer momento sem depender de a psicóloga mandar um novo
// print. O modelo GPT Image aceita múltiplas imagens de entrada num mesmo
// pedido de edição; o prompt deixa explícito que essa segunda imagem é só
// uma referência visual, nunca para copiar seu conteúdo real.
const REFERENCIA_ESTILO_PATH = path.join(process.cwd(), 'assets/reference-quality/story-referencia-estilo.jpg');

// Logo da psicóloga -- só entra na imagem gerada quando ela pede
// explicitamente no chat (ver lib/aprendizado.js/api ppt-content e o chat de
// Gerar Imagens em index.html). Nunca é aplicado por padrão.
const LOGO_PATH = path.join(process.cwd(), 'assets/logo-symbol-hires.png');

async function extrairB64(data) {
  let b64 = data.data?.[0]?.b64_json;
  if (b64) return b64;
  const imgUrl = data.data?.[0]?.url;
  if (!imgUrl) return null;
  const imgRes = await fetch(imgUrl);
  const buffer = await imgRes.arrayBuffer();
  return Buffer.from(buffer).toString('base64');
}

export default async function handler(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { type, prompt, size, imageB64, incluirLogo } = req.body;
  const finalSize = ALLOWED_SIZES.has(size) ? size : '1024x1024';

  const apiKey = process.env.OPENAI_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_KEY não configurada no Vercel' });
  }

  if (type === 'refine-image-prompt') {
    // Chat de "Elaborar com IA" da aba Gerar Imagens: não gera a imagem em
    // si, só ajuda a psicóloga a lapidar a descrição em texto (igual ao
    // chat de posts/apresentações) antes de mandar pro fluxo normal de
    // geração de imagem já existente (gerarAtividade/regenerar).
    const { tipo, faixa, tema, descricao, historico: historicoBruto, ajuste, anexo, imagem } = req.body;
    if (!descricao) return res.status(400).json({ error: 'Descrição obrigatória' });
    if (historicoBruto !== undefined && !Array.isArray(historicoBruto)) return res.status(400).json({ error: 'Histórico inválido' });
    const historico = (historicoBruto || []).map(h => ({ papel: h?.papel === 'assistente' ? 'assistente' : 'usuario', texto: String(h?.texto || '').trim().slice(0, 4000) })).filter(h => h.texto).slice(-20);
    let anexoTexto = null;
    if (anexo != null) {
      try { const extraido = await extrairTextoAnexo(anexo); anexoTexto = `Conteúdo do arquivo enviado (${extraido.nome}):\n"""\n${extraido.texto}\n"""`; }
      catch (e) { if (e instanceof AnexoError) return res.status(e.status).json({ error: e.message }); throw e; }
    }
    let imagemValidada = null;
    if (imagem != null) {
      try { imagemValidada = validarImagemAnexo(imagem); }
      catch (e) { if (e instanceof AnexoError) return res.status(e.status).json({ error: e.message }); throw e; }
    }

    const systemPrompt = `Você ajuda uma psicóloga a lapidar, em texto, a descrição de uma imagem/atividade terapêutica ilustrada que será gerada por IA (para pacientes, incluindo crianças).
Sua saída é APENAS a descrição final em português, pronta para virar prompt de geração de imagem: objetiva, visual, com estilo/cores/composição quando relevante, sem markdown, sem explicações.
Se a mensagem pedir um AJUSTE sobre uma descrição já elaborada (você verá o histórico da conversa), reescreva a descrição inteira aplicando o pedido e mantendo o que não foi pedido para mudar.
Defina incluirLogo=true SOMENTE se a psicóloga pedir explicitamente para incluir a logo/marca/logotipo do consultório na imagem; caso contrário incluirLogo=false.

${PERFIL_JAQUELINE}`;
    const preferenciaAprendida = await buscarPreferenciaTexto('imagens');
    const systemComAprendizado = preferenciaAprendida ? `${systemPrompt}\n\nObservações de estilo já aprendidas com esta psicóloga em conversas anteriores (aplique com prioridade alta, junto com as regras acima):\n${preferenciaAprendida}` : systemPrompt;

    const primeiroPedido = `Tipo de atividade: ${tipo || 'não informado'}\nFaixa etária: ${faixa || 'não informada'}\nTema clínico: ${tema || 'não informado'}\nDescrição inicial da psicóloga: ${descricao}`;
    const pedidoTextoBase = historico.length ? (String(ajuste || '').trim() || primeiroPedido) : primeiroPedido;
    const pedidoTexto = anexoTexto ? `${anexoTexto}\n\n${pedidoTextoBase}` : pedidoTextoBase;
    const userPrompt = imagemValidada
      ? [{ type: 'text', text: pedidoTexto }, { type: 'image_url', image_url: { url: `data:${imagemValidada.tipo};base64,${imagemValidada.base64}` } }]
      : pedidoTexto;

    try {
      const r = await fetchComRetentativa('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env.OPENAI_TEXT_MODEL || 'gpt-5.6-terra',
          messages: [
            { role: 'system', content: systemComAprendizado },
            ...historico.map(h => ({ role: h.papel === 'assistente' ? 'assistant' : 'user', content: h.texto })),
            { role: 'user', content: userPrompt },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'descricao_imagem',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  descricao: { type: 'string' },
                  incluirLogo: { type: 'boolean' },
                },
                required: ['descricao', 'incluirLogo'],
                additionalProperties: false,
              },
            },
          },
        }),
      }, { tentativas: 1, timeoutMs: 20000 });

      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        return res.status(r.status).json({ error: err?.error?.message || 'Erro ao elaborar descrição' });
      }
      const data = await r.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) return res.status(500).json({ error: 'Nenhuma resposta retornada' });
      const parsed = JSON.parse(content);
      if (historico.length) {
        await aprenderComAjusteChat({ contexto: 'imagens', pedido: String(ajuste || '').trim(), atual: preferenciaAprendida, key: apiKey, autorId: user?.id });
      }
      return res.status(200).json(parsed);
    } catch (e) {
      return res.status(500).json({ error: mensagemErro(e) });
    }
  }

  if (type === 'image') {
    // Sem logo: geração de texto-pra-imagem normal. Com logo (pedida
    // explicitamente no chat), usa o endpoint de edição passando a logo
    // como imagem-base de entrada, com instrução pra só posicioná-la num
    // canto -- mesmo padrão de "imagem de referência" já usado abaixo em
    // image-edit, mas aqui a logo é o único insumo visual.
    if (!incluirLogo) {
      try {
        const r = await fetchComRetentativa('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: IMAGE_MODEL,
            prompt,
            n: 1,
            size: finalSize,
            // 'high' custa ~4x mais que 'medium' por imagem -- 'medium' foi o
            // equilíbrio escolhido explicitamente pelo usuário depois de ver
            // o custo estimado de cada nível.
            quality: 'medium',
          }),
        // gpt-image-2 as vezes passa de 45s pra gerar (relatado ao vivo: um
        // prompt de atividade infantil mais elaborado estourou esse limite e
        // devolveu "This operation was aborted" direto pra tela). A funcao
        // serverless (vercel.json) tem orcamento de 100s -- uma tentativa so,
        // com quase todo esse orcamento, evita abortar uma geracao que so
        // precisava de mais tempo. Sem retentativa: se a 1a chamada gastar
        // 90s so pra falhar, uma 2a tentativa nunca caberia no orcamento
        // mesmo assim.
        }, {tentativas: 0, timeoutMs: 90000});
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          return res.status(r.status).json({ error: err?.error?.message || 'Erro no GPT Image 2.5' });
        }
        const b64 = await extrairB64(await r.json());
        if (!b64) return res.status(500).json({ error: 'Nenhuma imagem retornada' });
        return res.status(200).json({ b64 });
      } catch (e) {
        return res.status(500).json({ error: mensagemErro(e) });
      }
    }
    try {
      const logoBuffer = await readFile(LOGO_PATH);
      const form = new FormData();
      form.append('model', IMAGE_MODEL);
      form.append('image[]', new Blob([logoBuffer], { type: 'image/png' }), 'logo.png');
      const promptComLogo = `You are given one image: the clinic's logo, on a transparent or plain background. Generate a brand new illustration as described below, and place this exact logo small and tastefully in a corner of the new image (e.g. bottom-right), without altering the logo itself. The logo is a small brand mark, not the main subject -- the illustration described below is the main content. ${prompt}`;
      form.append('prompt', promptComLogo);
      form.append('size', finalSize);
      form.append('n', '1');
      form.append('quality', 'medium');
      const r = await fetchComRetentativa('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: form,
      }, {tentativas: 0, timeoutMs: 90000});
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        return res.status(r.status).json({ error: err?.error?.message || 'Erro no GPT Image 2.5' });
      }
      const b64 = await extrairB64(await r.json());
      if (!b64) return res.status(500).json({ error: 'Nenhuma imagem retornada' });
      return res.status(200).json({ b64 });
    } catch (e) {
      return res.status(500).json({ error: mensagemErro(e) });
    }
  }

  if (type === 'image-edit') {
    // Edita uma foto real enviada pela psicóloga (composição feita pela
    // própria IA de imagem em cima da foto -- mesmo modelo usado no caminho
    // 100% gerado por IA, só que com a foto real como base em vez de um
    // prompt puramente textual).
    if (!imageB64) return res.status(400).json({ error: 'Imagem obrigatória' });
    const buffer = Buffer.from(imageB64, 'base64');
    // O app já redimensiona a foto antes de enviar (ver
    // prepararFotoParaEdicaoIA em index.html); este limite é uma segunda
    // trava de segurança contra o limite de payload da função serverless.
    if (buffer.length > 4 * 1024 * 1024) {
      return res.status(400).json({ error: 'Imagem grande demais para edição por IA' });
    }
    try {
      const form = new FormData();
      form.append('model', IMAGE_MODEL);
      // A OpenAI rejeita duas entradas 'image' repetidas ("Duplicate
      // parameter") -- múltiplas imagens precisam usar a sintaxe de array
      // 'image[]', mesmo quando só uma é enviada.
      form.append('image[]', new Blob([buffer], { type: 'image/jpeg' }), 'foto.jpg');

      let promptFinal = prompt;
      try {
        const refBuffer = await readFile(REFERENCIA_ESTILO_PATH);
        form.append('image[]', new Blob([refBuffer], { type: 'image/jpeg' }), 'referencia-estilo.jpg');
        promptFinal = `You are given two images. The FIRST image is the user's own real photo -- this is the actual scene/subject to preserve and edit exactly as instructed below. The SECOND image is ONLY a style and craftsmanship reference showing the target quality bar for composition, spacing and small decorative accents -- do NOT copy its actual photo, its specific words, its exact colors, or any of its content; take from it only the general design language and level of polish. ${prompt}`;
      } catch {
        // Se o arquivo de referência não puder ser lido por algum motivo,
        // segue com a edição de uma imagem só -- não é motivo pra falhar a
        // geração inteira.
      }
      if (incluirLogo) {
        try {
          const logoBuffer = await readFile(LOGO_PATH);
          form.append('image[]', new Blob([logoBuffer], { type: 'image/png' }), 'logo.png');
          promptFinal = `${promptFinal} You are also given one additional image: the clinic's logo. Place this exact logo small and tastefully in a corner of the final result (e.g. bottom-right), without altering the logo itself.`;
        } catch {
          // Sem a logo disponível, segue sem ela -- não é motivo pra falhar
          // a edição inteira.
        }
      }

      form.append('prompt', promptFinal);
      form.append('size', finalSize);
      form.append('n', '1');
      form.append('quality', 'medium');
      const r = await fetchComRetentativa('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: form,
      // gpt-image-2 as vezes passa de 45s pra gerar (relatado ao vivo: um
      // prompt de atividade infantil mais elaborado estourou esse limite e
      // devolveu "This operation was aborted" direto pra tela). A funcao
      // serverless (vercel.json) tem orcamento de 100s -- uma tentativa so,
      // com quase todo esse orcamento, evita abortar uma geracao que so
      // precisava de mais tempo. Sem retentativa: se a 1a chamada gastar
      // 90s so pra falhar, uma 2a tentativa nunca caberia no orcamento
      // mesmo assim.
      }, {tentativas: 0, timeoutMs: 90000});
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        return res.status(r.status).json({ error: err?.error?.message || 'Erro ao editar imagem' });
      }
      const b64 = await extrairB64(await r.json());
      if (!b64) return res.status(500).json({ error: 'Nenhuma imagem retornada' });
      return res.status(200).json({ b64 });
    } catch (e) {
      return res.status(500).json({ error: mensagemErro(e) });
    }
  }

  return res.status(400).json({ error: 'Tipo inválido' });
}
