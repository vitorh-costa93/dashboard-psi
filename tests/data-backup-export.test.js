import assert from 'node:assert/strict';
import test from 'node:test';
import {createHmac, randomBytes} from 'node:crypto';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.CLINICAL_DATA_KEY = randomBytes(32).toString('base64');

const {default: data} = await import('../api/data.js');
const {encryptClinicalData} = await import('../api/_clinical-crypto.js');

function createIdleCookie() {
  const timestamp = Date.now();
  const signature = createHmac('sha256', process.env.SUPABASE_SERVICE_KEY).update(String(timestamp)).digest('base64url');
  return `psi_idle=${timestamp}.${signature}; psi_access=test-token; psi_refresh=test-refresh`;
}

function response() {
  return {
    code: 200,
    body: undefined,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader() { return this; },
    getHeader() { return null; },
  };
}

function supabaseAuthReply(d) {
  return {ok: true, status: 200, json: async () => d};
}

function authFetchStub(extra) {
  return async (url, options) => {
    if (url.includes('/auth/v1/user')) return supabaseAuthReply({id: 'test-user'});
    if (url.includes('app_admin')) return supabaseAuthReply([{user_id: 'test-user'}]);
    return extra(url, options);
  };
}

test('export-tudo busca todas as tabelas e descriptografa prontuarios', async () => {
  const chamadas = [];
  global.fetch = authFetchStub(async (url) => {
    chamadas.push(url);
    if (url.includes('/rest/v1/prontuarios')) {
      return {ok: true, status: 200, json: async () => [{id: '1', relato: encryptClinicalData('Sigiloso')}]};
    }
    return {ok: true, status: 200, json: async () => [{id: 'x'}]};
  });
  const req = {method: 'GET', query: {action: 'export-tudo'}, headers: {cookie: createIdleCookie()}};
  const res = response();
  await data(req, res);
  assert.equal(res.code, 200);
  assert.ok(res.body.gerado_em);
  assert.equal(res.body.dados.prontuarios[0].relato, 'Sigiloso');
  assert.ok(Array.isArray(res.body.dados.pacientes));
  assert.ok(Array.isArray(res.body.dados.atividades));
  assert.ok(Array.isArray(res.body.dados.posts));
  assert.ok(Array.isArray(res.body.dados.trend_radar));
  assert.ok(Array.isArray(res.body.dados.post_artes));
  // uma chamada por tabela declarada
  assert.equal(chamadas.length, 6);
});

test('export-tudo nao exige "table" na query (diferente das outras rotas)', async () => {
  global.fetch = authFetchStub(async () => ({ok: true, status: 200, json: async () => []}));
  const req = {method: 'GET', query: {action: 'export-tudo'}, headers: {cookie: createIdleCookie()}};
  const res = response();
  await data(req, res);
  assert.equal(res.code, 200);
});

test('tabela invalida continua rejeitada normalmente fora do backup', async () => {
  global.fetch = authFetchStub(() => { throw new Error('não deveria chamar Supabase'); });
  const req = {method: 'GET', query: {table: 'tabela_que_nao_existe'}, headers: {cookie: createIdleCookie()}};
  const res = response();
  await data(req, res);
  assert.equal(res.code, 400);
});
