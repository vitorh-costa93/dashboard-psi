import assert from 'node:assert/strict';
import test from 'node:test';
import {createHmac} from 'node:crypto';

process.env.OPENAI_KEY = 'test-openai-key';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

const {default: trends} = await import('../api/trends.js');

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
    // saveRadar's insert into trend_radar
    if (url.includes('/rest/v1/trend_radar')) return supabaseReply(null);
    if (url.includes('supabase')) return supabaseReply([]);
    return extra(url, options);
  };
}

function baseReq() {
  return {method: 'GET', query: {}, headers: {cookie: createIdleCookie()}};
}

function respostaComSugestoes(suggestions) {
  return {
    ok: true, status: 200,
    json: async () => ({
      output: [
        {type: 'reasoning'},
        {type: 'web_search_call'},
        {type: 'message', content: [{type: 'output_text', text: JSON.stringify({suggestions})}]}
      ]
    })
  };
}

const sugestaoValida = {
  titulo: 'Título', resumo: 'Resumo', por_que: 'Por que agora', faixa: 'Adultos',
  formato: 'Post', potencial: 'Alto', angulo: 'Ângulo prático',
  fonte_titulo: 'Notícia real', fonte_url: 'https://exemplo.com/noticia', fonte_publicacao: 'Veículo X'
};

test('monta a chamada da Responses API com tool web_search e schema estrito', async () => {
  let capturedUrl, capturedBody;
  global.fetch = authFetchStub(async (url, options) => {
    capturedUrl = url;
    capturedBody = JSON.parse(options.body);
    return respostaComSugestoes([sugestaoValida]);
  });
  const req = baseReq();
  const res = response();
  await trends(req, res);
  assert.equal(res.code, 200);
  assert.equal(capturedUrl, 'https://api.openai.com/v1/responses');
  assert.equal(capturedBody.model, 'gpt-5.6-terra');
  assert.deepEqual(capturedBody.tools, [{type: 'web_search'}]);
  assert.equal(capturedBody.text.format.type, 'json_schema');
  assert.equal(capturedBody.text.format.strict, true);
  assert.equal(capturedBody.text.format.schema.required.includes('suggestions'), true);
  const itemSchema = capturedBody.text.format.schema.properties.suggestions.items;
  assert.deepEqual(itemSchema.required.sort(), ['angulo','faixa','fonte_publicacao','fonte_titulo','fonte_url','formato','por_que','potencial','resumo','titulo'].sort());
  assert.equal(itemSchema.additionalProperties, false);
});

test('reempacota fonte_titulo/fonte_url/fonte_publicacao no formato aninhado que o frontend espera', async () => {
  global.fetch = authFetchStub(async () => respostaComSugestoes([sugestaoValida]));
  const req = baseReq();
  const res = response();
  await trends(req, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.suggestions.length, 1);
  const s = res.body.suggestions[0];
  assert.equal(s.fonte.title, 'Notícia real');
  assert.equal(s.fonte.link, 'https://exemplo.com/noticia');
  assert.equal(s.fonte.source, 'Veículo X');
  assert.equal(s.titulo, 'Título');
  // "sources" não existe mais na resposta (não é mais lido pelo frontend)
  assert.equal('sources' in res.body, false);
});

test('lista vazia de sugestoes eh tratada normalmente (nao força conteudo)', async () => {
  global.fetch = authFetchStub(async () => respostaComSugestoes([]));
  const req = baseReq();
  const res = response();
  await trends(req, res);
  assert.equal(res.code, 200);
  assert.deepEqual(res.body.suggestions, []);
});

test('erro da OpenAI eh propagado como 500', async () => {
  global.fetch = authFetchStub(async () => ({
    ok: false, status: 400, json: async () => ({error: {message: 'Modelo inválido'}})
  }));
  const req = baseReq();
  const res = response();
  await trends(req, res);
  assert.equal(res.code, 500);
  assert.equal(res.body.error, 'Modelo inválido');
});

test('saida vazia (sem output_text) retorna erro tratado, nao trava', async () => {
  global.fetch = authFetchStub(async () => ({ok: true, status: 200, json: async () => ({output: [{type: 'reasoning'}]})}));
  const req = baseReq();
  const res = response();
  await trends(req, res);
  assert.equal(res.code, 500);
  assert.ok(res.body.error);
});

test('metodo diferente de GET (sem job=import-sheet) retorna 405', async () => {
  global.fetch = authFetchStub(() => { throw new Error('não deveria chamar OpenAI'); });
  const req = {method: 'POST', query: {}, headers: {cookie: createIdleCookie()}};
  const res = response();
  await trends(req, res);
  assert.equal(res.code, 405);
});
