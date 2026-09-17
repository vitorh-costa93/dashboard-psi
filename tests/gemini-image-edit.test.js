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
  assert.equal(capturedForm.get('model'), 'gpt-image-2.5-flare');
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
  assert.doesNotMatch(capturedForm.get('prompt'),/add text onto/);
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
    assert.equal(body.model, 'gpt-image-2.5-flare');
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

test('timeout (AbortError) retorna mensagem amigavel, nao o texto cru do erro', async () => {
  global.fetch = authFetchStub(async () => {
    const err = new Error('This operation was aborted');
    err.name = 'AbortError';
    throw err;
  });
  const req = baseReq({type: 'image', prompt: 'Um prompt qualquer', size: '1024x1024'});
  const res = response();
  await gemini(req, res);
  assert.equal(res.code, 500);
  assert.equal(res.body.error, 'A geração demorou mais do que o esperado e foi interrompida. Tente novamente.');
});

test('tipo invalido retorna 400', async () => {
  global.fetch = authFetchStub(() => { throw new Error('não deveria chamar OpenAI'); });
  const req = baseReq({type: 'algo-invalido'});
  const res = response();
  await gemini(req, res);
  assert.equal(res.code, 400);
});

test('type=image com incluirLogo usa images/edits com a logo como imagem de entrada', async () => {
  global.fetch = authFetchStub(async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/images/edits');
    assert.ok(options.body instanceof FormData);
    const imagens = options.body.getAll('image[]');
    assert.equal(imagens.length, 1);
    assert.equal(imagens[0].name, 'logo.png');
    assert.ok(options.body.get('prompt').includes('clinic\'s logo'));
    assert.ok(options.body.get('prompt').includes('Um prompt qualquer'));
    return {ok: true, status: 200, json: async () => ({data: [{b64_json: 'COM_LOGO_B64'}]})};
  });
  const req = baseReq({type: 'image', prompt: 'Um prompt qualquer', size: '1024x1024', incluirLogo: true});
  const res = response();
  await gemini(req, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.b64, 'COM_LOGO_B64');
});

test('image-edit com incluirLogo anexa a logo como terceira imagem', async () => {
  global.fetch = authFetchStub(async (url, options) => {
    const imagens = options.body.getAll('image[]');
    assert.equal(imagens.length, 3);
    assert.equal(imagens[2].name, 'logo.png');
    assert.ok(options.body.get('prompt').includes('additional image: the clinic\'s logo'));
    return {ok: true, status: 200, json: async () => ({data: [{b64_json: 'RESULTADO_B64'}]})};
  });
  const req = baseReq({type: 'image-edit', prompt: 'Edite esta foto', size: '1024x1024', imageB64: smallImageB64, incluirLogo: true});
  const res = response();
  await gemini(req, res);
  assert.equal(res.code, 200);
});

test('refine-image-prompt sem descricao retorna 400 sem chamar a OpenAI', async () => {
  global.fetch = authFetchStub(() => { throw new Error('não deveria chamar OpenAI'); });
  const req = baseReq({type: 'refine-image-prompt'});
  const res = response();
  await gemini(req, res);
  assert.equal(res.code, 400);
});

test('refine-image-prompt monta a chamada com schema estrito e devolve descricao/incluirLogo', async () => {
  let capturedBody;
  global.fetch = authFetchStub(async (url, options) => {
    if (url.includes('/v1/chat/completions')) {
      capturedBody = JSON.parse(options.body);
      return {ok: true, status: 200, json: async () => ({choices: [{message: {content: JSON.stringify({descricao: 'Uma rotina ilustrada', incluirLogo: false})}}]})};
    }
    throw new Error('endpoint inesperado: ' + url);
  });
  const req = baseReq({type: 'refine-image-prompt', tipo: 'Rotina', faixa: '4–6 anos', tema: 'TDAH', descricao: 'rotina matinal'});
  const res = response();
  await gemini(req, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.descricao, 'Uma rotina ilustrada');
  assert.equal(res.body.incluirLogo, false);
  assert.equal(capturedBody.response_format.json_schema.name, 'descricao_imagem');
  assert.ok(capturedBody.messages[0].content.includes('incluirLogo=true SOMENTE'));
});
