import assert from 'node:assert/strict';
import test from 'node:test';
import {readdir, readFile} from 'node:fs/promises';
import {modelFor, imageQuality, estimateCostUsd, pickLatestFromList, resolveModelFor, clearModelDiscoveryCache} from '../lib/ai-models.js';

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

test('pickLatestFromList escolhe automaticamente a versão mais nova da família', () => {
  const ids = ['gpt-5.6-luna', 'gpt-6-luna', 'gpt-7.1-luna', 'gpt-9-pro', 'gpt-image-2', 'gpt-image-2.5-flare', 'gpt-image-3', 'gpt-image-3-flare'];
  assert.equal(pickLatestFromList('post', ids), 'gpt-7.1-luna');
  assert.equal(pickLatestFromList('image', ids), 'gpt-image-3-flare');
  assert.equal(pickLatestFromList('image', ['gpt-image-3']), 'gpt-image-3');
  assert.equal(pickLatestFromList('transcription', ids), 'whisper-1');
});

test('resolveModelFor consulta /v1/models, faz fallback em erro e respeita override AI_MODEL_*', async () => {
  clearModelDiscoveryCache();
  const origFetch = global.fetch;
  try {
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ data: [{ id: 'gpt-6-luna' }, { id: 'gpt-8-luna' }, { id: 'gpt-image-4-flare' }] }),
    });
    assert.equal(await resolveModelFor('documents', { apiKey: 'sk-test', discover: true }), 'gpt-8-luna');
    assert.equal(await resolveModelFor('image', { apiKey: 'sk-test', discover: true }), 'gpt-image-4-flare');

    process.env.AI_MODEL_IMAGE = 'gpt-image-custom';
    assert.equal(await resolveModelFor('image', { apiKey: 'sk-test', discover: true }), 'gpt-image-custom');
    delete process.env.AI_MODEL_IMAGE;

    clearModelDiscoveryCache();
    global.fetch = async () => { throw new Error('network down'); };
    assert.equal(await resolveModelFor('post', { apiKey: 'sk-test', discover: true }), 'gpt-6-luna');
  } finally {
    delete process.env.AI_MODEL_IMAGE;
    global.fetch = origFetch;
    clearModelDiscoveryCache();
  }
});
