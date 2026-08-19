import assert from 'node:assert/strict';
import test from 'node:test';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

const {requireAuth} = await import('../api/_auth.js');
const {default: setup} = await import('../api/auth/setup.js');
const {default: login} = await import('../api/auth/login.js');
const {default: status} = await import('../api/auth/status.js');

function response() {
  return {
    code: 200,
    headers: {},
    body: undefined,
    status(code) { this.code = code; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    json(body) { this.body = body; return this; },
  };
}

function jsonResponse(body, ok = true, statusCode = 200) {
  return {ok, status: statusCode, json: async () => body};
}

test('visitante sem cookie é bloqueado', async () => {
  global.fetch = async () => { throw new Error('não deveria consultar sem token'); };
  const res = response();
  const user = await requireAuth({headers: {}}, res);
  assert.equal(user, null);
  assert.equal(res.code, 401);
});

test('status mostra criação inicial quando não existe administrador', async () => {
  global.fetch = async url => {
    assert.match(url, /app_admin/);
    return jsonResponse([]);
  };
  const res = response();
  await status({method: 'GET', headers: {}}, res);
  assert.deepEqual(res.body, {configured: false, authenticated: false});
});

test('cadastro é recusado depois que o administrador existe', async () => {
  global.fetch = async url => {
    assert.match(url, /app_admin/);
    return jsonResponse([{user_id: 'admin-1'}]);
  };
  const res = response();
  await setup({method: 'POST', body: {email: 'admin@example.com', password: 'senha-segura-123'}}, res);
  assert.equal(res.code, 409);
  assert.match(res.body.error, /já foi criado/i);
});

test('login inválido não cria sessão', async () => {
  let calls = 0;
  global.fetch = async url => {
    calls += 1;
    if (url.includes('app_admin')) return jsonResponse([{user_id: 'admin-1'}]);
    if (url.includes('/token?')) return jsonResponse({error: 'invalid'}, false, 400);
    throw new Error(`URL inesperada: ${url}`);
  };
  const res = response();
  await login({method: 'POST', body: {email: 'admin@example.com', password: 'errada'}, headers: {}}, res);
  assert.equal(calls, 2);
  assert.equal(res.code, 401);
  assert.equal(res.headers['Set-Cookie'], undefined);
});
