import assert from 'node:assert/strict';
import test from 'node:test';
import {createHmac, randomBytes} from 'node:crypto';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.CLINICAL_DATA_KEY = randomBytes(32).toString('base64');

const {default: data} = await import('../api/data.js');

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

function supabaseAuthReply(data) {
  return {ok: true, status: 200, json: async () => data};
}

function authFetchStub(extra) {
  return async (url, options) => {
    if (url.includes('/auth/v1/user')) return supabaseAuthReply({id: 'test-user'});
    if (url.includes('app_admin')) return supabaseAuthReply([{user_id: 'test-user'}]);
    return extra(url, options);
  };
}

function baseReq(method, query, body) {
  return {method, query, body, headers: {cookie: createIdleCookie()}};
}

test('POST em prontuarios criptografa o relato antes de mandar pro Supabase', async () => {
  let capturedBody;
  global.fetch = authFetchStub(async (url, options) => {
    assert.ok(url.includes('/rest/v1/prontuarios'));
    capturedBody = JSON.parse(options.body);
    return {ok: true, status: 201, json: async () => [{...capturedBody, id: 'abc'}]};
  });
  const req = baseReq('POST', {table: 'prontuarios'}, {paciente_id: 'p1', relato: 'Conteúdo confidencial da sessão'});
  const res = response();
  await data(req, res);
  assert.equal(res.code, 200);
  // O que foi enviado ao Supabase não pode conter o texto original em claro.
  assert.equal(JSON.stringify(capturedBody).includes('Conteúdo confidencial'), false);
  assert.equal(capturedBody.relato.alg, 'A256GCM');
  // A resposta devolvida pro app já vem descriptografada de volta.
  assert.equal(res.body[0].relato, 'Conteúdo confidencial da sessão');
});

test('GET em prontuarios descriptografa o relato', async () => {
  const {encryptClinicalData} = await import('../api/_clinical-crypto.js');
  global.fetch = authFetchStub(async (url) => {
    assert.ok(url.includes('/rest/v1/prontuarios'));
    return {ok: true, status: 200, json: async () => [{id: '1', paciente_id: 'p1', relato: encryptClinicalData('Relato real')}]};
  });
  const req = baseReq('GET', {table: 'prontuarios'});
  const res = response();
  await data(req, res);
  assert.equal(res.code, 200);
  assert.equal(res.body[0].relato, 'Relato real');
});

test('prontuario antigo salvo em texto puro (antes desta mudanca) continua legivel', async () => {
  global.fetch = authFetchStub(async () => ({
    ok: true, status: 200, json: async () => [{id: '1', paciente_id: 'p1', relato: 'Relato salvo antes da criptografia existir'}]
  }));
  const req = baseReq('GET', {table: 'prontuarios'});
  const res = response();
  await data(req, res);
  assert.equal(res.code, 200);
  assert.equal(res.body[0].relato, 'Relato salvo antes da criptografia existir');
});

test('PATCH em prontuarios criptografa o relato atualizado', async () => {
  let capturedBody;
  global.fetch = authFetchStub(async (url, options) => {
    capturedBody = JSON.parse(options.body);
    return {ok: true, status: 200, json: async () => [{...capturedBody, id: '1'}]};
  });
  const req = baseReq('PATCH', {table: 'prontuarios', id: '1'}, {relato: 'Relato atualizado'});
  const res = response();
  await data(req, res);
  assert.equal(res.code, 200);
  assert.equal(capturedBody.relato.alg, 'A256GCM');
  assert.equal(res.body[0].relato, 'Relato atualizado');
});

test('outras tabelas (pacientes) nao sao afetadas pela criptografia', async () => {
  let capturedBody;
  global.fetch = authFetchStub(async (url, options) => {
    capturedBody = JSON.parse(options.body);
    return {ok: true, status: 201, json: async () => [{...capturedBody, id: 'x'}]};
  });
  const req = baseReq('POST', {table: 'pacientes'}, {nome: 'Fulano'});
  const res = response();
  await data(req, res);
  assert.equal(res.code, 200);
  assert.equal(capturedBody.nome, 'Fulano');
  assert.equal(res.body[0].nome, 'Fulano');
});
