import assert from 'node:assert/strict';
import test from 'node:test';
import {readdir, readFile} from 'node:fs/promises';
import {modelFor, imageQuality, estimateCostUsd} from '../lib/ai-models.js';

test('texto usa gpt-6-luna e imagem usa flare em qualidade medium', () => {
  delete process.env.OPENAI_TEXT_MODEL;
  for (const t of ['trends', 'post', 'ppt', 'documents', 'learning', 'text']) assert.equal(modelFor(t), 'gpt-6-luna');
  assert.equal(modelFor('image'), 'gpt-image-2.5-flare');
  assert.equal(imageQuality(), 'medium');
});

test('OPENAI_TEXT_MODEL legado não troca o modelo', () => {
  process.env.OPENAI_TEXT_MODEL = 'modelo-antigo';
  try { assert.equal(modelFor('post'), 'gpt-6-luna'); } finally { delete process.env.OPENAI_TEXT_MODEL; }
});

test('estima custo pela tabela e devolve null para modelo sem preço', () => {
  const c = estimateCostUsd('gpt-6-luna', {inputTokens: 1e6, cachedTokens: 0, outputTokens: 1e6});
  assert.ok(Math.abs(c - 0.6) < 1e-9);
  assert.equal(estimateCostUsd('desconhecido', {inputTokens: 1}), null);
});

test('nenhum nome de modelo literal fora de lib/ai-models.js', async () => {
  for (const dir of ['api', 'lib']) {
    for (const f of await readdir(new URL(`../${dir}/`, import.meta.url), {recursive: true})) {
      if (!f.endsWith('.js') || f === 'ai-models.js') continue;
      const src = await readFile(new URL(`../${dir}/${f}`, import.meta.url), 'utf8');
      assert.doesNotMatch(src, /gpt-\d|gpt-image|dall-e|whisper-1/i, `${dir}/${f}`);
    }
  }
});
