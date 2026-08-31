import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { requireAuth } from './_auth.js';

// The prompt text can *describe* an aspect ratio, but only this API parameter
// actually controls the output pixel dimensions -- a request for a vertical
// Story image still came out perfectly square before because this was
// hardcoded to 1024x1024 regardless of what the prompt asked for.
const ALLOWED_SIZES = new Set(['1024x1024', '1024x1536', '1536x1024']);

// Referência de ESTILO (nunca de conteúdo) para a edição de fotos próprias --
// um exemplo aprovado pela psicóloga do nível de acabamento desejado
// (etiquetas limpas, tipografia mista, acentos discretos). O modelo GPT
// Image aceita múltiplas imagens de entrada num mesmo pedido de edição; o
// prompt deixa explícito que essa segunda imagem é só uma referência visual,
// nunca para copiar seu conteúdo real.
const REFERENCIA_ESTILO_PATH = path.join(process.cwd(), 'assets/reference-quality/story-dia-do-psicologo.jpg');

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
  if (!await requireAuth(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { type, prompt, size, imageB64 } = req.body;
  const finalSize = ALLOWED_SIZES.has(size) ? size : '1024x1024';

  const apiKey = process.env.OPENAI_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_KEY não configurada no Vercel' });
  }

  if (type === 'image') {
    try {
      const r = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-image-2',
          prompt,
          n: 1,
          size: finalSize,
          // 'high' custa ~4x mais que 'medium' por imagem -- 'medium' foi o
          // equilíbrio escolhido explicitamente pelo usuário depois de ver
          // o custo estimado de cada nível.
          quality: 'medium',
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        return res.status(r.status).json({ error: err?.error?.message || 'Erro no GPT Image 2' });
      }
      const b64 = await extrairB64(await r.json());
      if (!b64) return res.status(500).json({ error: 'Nenhuma imagem retornada' });
      return res.status(200).json({ b64 });
    } catch (e) {
      return res.status(500).json({ error: e.message });
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
      form.append('model', 'gpt-image-2');
      // A OpenAI rejeita duas entradas 'image' repetidas ("Duplicate
      // parameter") -- múltiplas imagens precisam usar a sintaxe de array
      // 'image[]', mesmo quando só uma é enviada.
      form.append('image[]', new Blob([buffer], { type: 'image/jpeg' }), 'foto.jpg');

      let promptFinal = prompt;
      try {
        const refBuffer = await readFile(REFERENCIA_ESTILO_PATH);
        form.append('image[]', new Blob([refBuffer], { type: 'image/jpeg' }), 'referencia-estilo.jpg');
        promptFinal = `You are given two images. The FIRST image is the user's own real photo -- this is the actual scene/subject to preserve, edit and add text onto, exactly as instructed below. The SECOND image is ONLY a style and craftsmanship reference showing the target quality bar for how text labels, typography pairing, spacing and small decorative accents should look -- do NOT copy its actual photo, its specific words, its exact colors, or any of its content; take from it only the general design language and level of polish. ${prompt}`;
      } catch {
        // Se o arquivo de referência não puder ser lido por algum motivo,
        // segue com a edição de uma imagem só -- não é motivo pra falhar a
        // geração inteira.
      }

      form.append('prompt', promptFinal);
      form.append('size', finalSize);
      form.append('n', '1');
      form.append('quality', 'medium');
      const r = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: form,
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        return res.status(r.status).json({ error: err?.error?.message || 'Erro ao editar imagem' });
      }
      const b64 = await extrairB64(await r.json());
      if (!b64) return res.status(500).json({ error: 'Nenhuma imagem retornada' });
      return res.status(200).json({ b64 });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: 'Tipo inválido' });
}
