import assert from 'node:assert/strict';
import test from 'node:test';
import {createHmac} from 'node:crypto';

process.env.OPENAI_KEY = 'test-openai-key';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

const {default: gemini} = await import('../api/gemini.js');

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

const smallImageB64 = Buffer.from('conteudo de teste pequeno').toString('base64');

test('image-edit sem imageB64 retorna 400', async () => {
  global.fetch = authFetchStub(() => { throw new Error('não deveria chamar OpenAI'); });
  const req = baseReq({type: 'image-edit', prompt: 'x', size: '1024x1024'});
  const res = response();
  await gemini(req, res);
  assert.equal(res.code, 400);
});

test('image-edit com imagem maior que 4MB retorna 400 sem chamar OpenAI', async () => {
  global.fetch = authFetchStub(() => { throw new Error('não deveria chamar OpenAI'); });
  const grande = Buffer.alloc(5 * 1024 * 1024, 1).toString('base64');
  const req = baseReq({type: 'image-edit', prompt: 'x', size: '1024x1024', imageB64: grande});
  const res = response();
  await gemini(req, res);
  assert.equal(res.code, 400);
});

test('image-edit monta multipart com model/prompt/size/image e retorna b64', async () => {
  let capturedForm;
  global.fetch = authFetchStub(async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/images/edits');
    capturedForm = options.body;
    assert.ok(capturedForm instanceof FormData);
    return {ok: true, status: 200, json: async () => ({data: [{b64_json: 'RESULTADO_B64'}]})};
  });
  const req = baseReq({type: 'image-edit', prompt: 'Edite esta foto', size: '1024x1536', imageB64: smallImageB64});
  const res = response();
  await gemini(req, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.b64, 'RESULTADO_B64');
  assert.equal(capturedForm.get('model'), 'gpt-image-2');
  assert.equal(capturedForm.get('size'), '1024x1536');
  assert.equal(capturedForm.get('n'), '1');
  assert.equal(capturedForm.get('quality'), 'medium');
  // Prompt original preservado (com o prefixo de duas imagens na frente,
  // quando a referência de estilo está disponível no deploy).
  assert.ok(capturedForm.get('prompt').includes('Edite esta foto'));
  const imagens = capturedForm.getAll('image[]');
  assert.equal(imagens[0].type, 'image/jpeg');
  assert.equal(imagens[0].name, 'foto.jpg');
  // A referência de estilo (assets/reference-quality/story-referencia-estilo.jpg)
  // faz parte do repositório -- deve sempre estar disponível e ser anexada.
  assert.equal(imagens.length, 2);
  assert.equal(imagens[1].name, 'referencia-estilo.jpg');
  assert.ok(capturedForm.get('prompt').includes('SECOND image is ONLY a style'));
});

test('image-edit propaga erro da OpenAI com a mensagem original', async () => {
  global.fetch = authFetchStub(async () => ({
    ok: false, status: 400, json: async () => ({error: {message: 'Conteúdo rejeitado pela moderação'}})
  }));
  const req = baseReq({type: 'image-edit', prompt: 'x', size: '1024x1024', imageB64: smallImageB64});
  const res = response();
  await gemini(req, res);
  assert.equal(res.code, 400);
  assert.equal(res.body.error, 'Conteúdo rejeitado pela moderação');
});

test('type=image (geração normal) continua funcionando', async () => {
  global.fetch = authFetchStub(async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/images/generations');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'gpt-image-2');
    assert.equal(body.prompt, 'Um prompt qualquer');
    assert.equal(body.quality, 'medium');
    return {ok: true, status: 200, json: async () => ({data: [{b64_json: 'GERADO_B64'}]})};
  });
  const req = baseReq({type: 'image', prompt: 'Um prompt qualquer', size: '1024x1024'});
  const res = response();
  await gemini(req, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.b64, 'GERADO_B64');
});

test('tipo invalido retorna 400', async () => {
  global.fetch = authFetchStub(() => { throw new Error('não deveria chamar OpenAI'); });
  const req = baseReq({type: 'algo-invalido'});
  const res = response();
  await gemini(req, res);
  assert.equal(res.code, 400);
});
