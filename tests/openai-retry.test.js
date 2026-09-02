import assert from 'node:assert/strict';
import test from 'node:test';
import {fetchComRetentativa} from '../api/_openai-retry.js';

test('devolve a resposta direto quando a primeira tentativa ja funciona', async () => {
  let chamadas = 0;
  global.fetch = async () => { chamadas++; return {ok: true, status: 200}; };
  const r = await fetchComRetentativa('https://x', {}, {tentativas: 2, esperaBaseMs: 1});
  assert.equal(r.ok, true);
  assert.equal(chamadas, 1);
});

test('tenta de novo em erro 500 e devolve a resposta boa da segunda tentativa', async () => {
  let chamadas = 0;
  global.fetch = async () => {
    chamadas++;
    if (chamadas === 1) return {ok: false, status: 500};
    return {ok: true, status: 200};
  };
  const r = await fetchComRetentativa('https://x', {}, {tentativas: 2, esperaBaseMs: 1});
  assert.equal(r.ok, true);
  assert.equal(chamadas, 2);
});

test('tenta de novo em 429 (rate limit)', async () => {
  let chamadas = 0;
  global.fetch = async () => { chamadas++; return chamadas === 1 ? {ok: false, status: 429} : {ok: true, status: 200}; };
  const r = await fetchComRetentativa('https://x', {}, {tentativas: 1, esperaBaseMs: 1});
  assert.equal(r.ok, true);
  assert.equal(chamadas, 2);
});

test('NAO tenta de novo em erro 400 (pedido invalido) -- devolve a resposta ruim direto', async () => {
  let chamadas = 0;
  global.fetch = async () => { chamadas++; return {ok: false, status: 400}; };
  const r = await fetchComRetentativa('https://x', {}, {tentativas: 2, esperaBaseMs: 1});
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
  assert.equal(chamadas, 1);
});

test('depois de esgotar as tentativas com erro 500, devolve a ultima resposta ruim', async () => {
  let chamadas = 0;
  global.fetch = async () => { chamadas++; return {ok: false, status: 503}; };
  const r = await fetchComRetentativa('https://x', {}, {tentativas: 2, esperaBaseMs: 1});
  assert.equal(r.ok, false);
  assert.equal(r.status, 503);
  assert.equal(chamadas, 3); // tentativa inicial + 2 retentativas
});

test('erro de rede (fetch lanca excecao) tenta de novo e se recupera', async () => {
  let chamadas = 0;
  global.fetch = async () => {
    chamadas++;
    if (chamadas === 1) throw new Error('network fail');
    return {ok: true, status: 200};
  };
  const r = await fetchComRetentativa('https://x', {}, {tentativas: 1, esperaBaseMs: 1});
  assert.equal(r.ok, true);
  assert.equal(chamadas, 2);
});

test('erro de rede persistente propaga a excecao apos esgotar as tentativas', async () => {
  global.fetch = async () => { throw new Error('network fail'); };
  await assert.rejects(
    () => fetchComRetentativa('https://x', {}, {tentativas: 1, esperaBaseMs: 1}),
    /network fail/
  );
});
