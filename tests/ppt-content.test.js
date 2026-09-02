import assert from 'node:assert/strict';
import test from 'node:test';
import {createHmac} from 'node:crypto';

process.env.OPENAI_KEY = 'test-openai-key';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

const {default: pptContent} = await import('../api/ppt-content.js');
const {PERFIL_JAQUELINE} = await import('../lib/perfil-jaqueline.js');

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

function supabaseReply(data) {
  return {ok: true, status: 200, json: async () => data};
}

function authFetchStub(extra) {
  return async (url, options) => {
    if (url.includes('/auth/v1/user')) return supabaseReply({id: 'test-user'});
    if (url.includes('app_admin')) return supabaseReply([{user_id: 'test-user'}]);
    if (url.includes('supabase')) return supabaseReply([]);
    return extra(url, options);
  };
}

function baseReq(body) {
  return {method: 'POST', body, headers: {cookie: createIdleCookie()}};
}

const conteudoValido = {titulo: 'Apresentação', slides: [
  {titulo: 'Slide 1', conteudo: ['ponto 1']},
  {titulo: 'Slide 2', conteudo: ['ponto 1']},
  {titulo: 'Slide 3', conteudo: ['ponto 1']},
  {titulo: 'Slide 4', conteudo: ['ponto 1']},
]};

test('monta a chamada com gpt-5.6-terra, sem temperature, e schema estrito', async () => {
  let capturedBody;
  global.fetch = authFetchStub(async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/chat/completions');
    capturedBody = JSON.parse(options.body);
    return {ok: true, status: 200, json: async () => ({choices: [{message: {content: JSON.stringify(conteudoValido)}}]})};
  });
  const req = baseReq({descricao: 'Uma apresentação sobre emoções', publico: 'criança', tema: 'emoções'});
  const res = response();
  await pptContent(req, res);
  assert.equal(res.code, 200);
  assert.equal(capturedBody.model, 'gpt-5.6-terra');
  assert.equal('temperature' in capturedBody, false);
  assert.equal(capturedBody.response_format.type, 'json_schema');
  assert.equal(capturedBody.response_format.json_schema.strict, true);
  assert.deepEqual(res.body, conteudoValido);
});

test('o system prompt inclui o perfil da Jaqueline', async () => {
  let capturedBody;
  global.fetch = authFetchStub(async (url, options) => {
    capturedBody = JSON.parse(options.body);
    return {ok: true, status: 200, json: async () => ({choices: [{message: {content: JSON.stringify(conteudoValido)}}]})};
  });
  const req = baseReq({descricao: 'Uma apresentação sobre emoções'});
  const res = response();
  await pptContent(req, res);
  assert.equal(res.code, 200);
  const systemMsg = capturedBody.messages.find(m => m.role === 'system');
  assert.ok(systemMsg.content.includes(PERFIL_JAQUELINE));
});

test('descricao ausente retorna 400 sem chamar a OpenAI', async () => {
  global.fetch = authFetchStub(() => { throw new Error('não deveria chamar OpenAI'); });
  const req = baseReq({});
  const res = response();
  await pptContent(req, res);
  assert.equal(res.code, 400);
});

test('erro da OpenAI eh propagado com a mensagem original', async () => {
  global.fetch = authFetchStub(async () => ({
    ok: false, status: 400, json: async () => ({error: {message: 'Schema inválido'}})
  }));
  const req = baseReq({descricao: 'Uma apresentação'});
  const res = response();
  await pptContent(req, res);
  assert.equal(res.code, 400);
  assert.equal(res.body.error, 'Schema inválido');
});
