import assert from 'node:assert/strict';
import test from 'node:test';
import {createHmac} from 'node:crypto';

process.env.OPENAI_KEY = 'test-openai-key';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

const {default: postContent} = await import('../api/post-content.js');

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

function chatReply(obj) {
  return {ok: true, status: 200, json: async () => ({choices: [{message: {content: JSON.stringify(obj)}}]})};
}

function supabaseReply(data) {
  return {ok: true, status: 200, json: async () => data};
}

test('sem historico, messages tem só system+user (comportamento atual)', async () => {
  let capturedBody;
  global.fetch = async (url, options) => {
    if (url.includes('api.openai.com')) {
      capturedBody = JSON.parse(options.body);
      return chatReply({titulo: 'x', gancho: 'x', slides: ['x'], legenda: 'x', hashtags: [], cta: 'x'});
    }
    if (url.includes('/auth/v1/user')) {
      return supabaseReply({id: 'test-user'});
    }
    if (url.includes('app_admin')) {
      return supabaseReply([{user_id: 'test-user'}]);
    }
    if (url.includes('supabase')) {
      return supabaseReply([]);
    }
    return {ok: false, status: 404};
  };
  const req = {
    method: 'POST',
    body: {tema: 'Ansiedade'},
    headers: {cookie: createIdleCookie()}
  };
  const res = response();
  await postContent(req, res);
  assert.equal(res.code, 200);
  assert.equal(capturedBody.messages.length, 2);
  assert.equal(capturedBody.messages[0].role, 'system');
  assert.equal(capturedBody.messages[1].role, 'user');
});

test('com historico, messages inclui os turnos anteriores antes do novo pedido', async () => {
  let capturedBody;
  global.fetch = async (url, options) => {
    if (url.includes('api.openai.com')) {
      capturedBody = JSON.parse(options.body);
      return chatReply({titulo: 'x', gancho: 'x', slides: ['x'], legenda: 'x', hashtags: [], cta: 'x'});
    }
    if (url.includes('/auth/v1/user')) {
      return supabaseReply({id: 'test-user'});
    }
    if (url.includes('app_admin')) {
      return supabaseReply([{user_id: 'test-user'}]);
    }
    if (url.includes('supabase')) {
      return supabaseReply([]);
    }
    return {ok: false, status: 404};
  };
  const historico = [
    {papel: 'usuario', texto: 'Tema: Ansiedade\nFormato: Post'},
    {papel: 'assistente', texto: '{"titulo":"Ansiedade"}'},
  ];
  const req = {
    method: 'POST',
    body: {tema: 'Ansiedade', formato: 'Post', historico, ajuste: 'Deixa o título mais curto'},
    headers: {cookie: createIdleCookie()}
  };
  const res = response();
  await postContent(req, res);
  assert.equal(res.code, 200);
  assert.equal(capturedBody.messages.length, 4);
  assert.equal(capturedBody.messages[0].role, 'system');
  assert.equal(capturedBody.messages[1].content, 'Tema: Ansiedade\nFormato: Post');
  assert.equal(capturedBody.messages[2].role, 'assistant');
  assert.equal(capturedBody.messages[3].content, 'Deixa o título mais curto');
});

test('historico malformado retorna 400', async () => {
  global.fetch = async (url) => {
    if (url.includes('/auth/v1/user')) {
      return supabaseReply({id: 'test-user'});
    }
    if (url.includes('app_admin')) {
      return supabaseReply([{user_id: 'test-user'}]);
    }
    if (url.includes('supabase')) {
      return supabaseReply([]);
    }
    throw new Error('não deveria chamar a OpenAI');
  };
  const req = {
    method: 'POST',
    body: {tema: 'Ansiedade', historico: 'não é array'},
    headers: {cookie: createIdleCookie()}
  };
  const res = response();
  await postContent(req, res);
  assert.equal(res.code, 400);
});

test('historico trunca para os ultimos 20 turnos', async () => {
  let capturedBody;
  global.fetch = async (url, options) => {
    if (url.includes('api.openai.com')) {
      capturedBody = JSON.parse(options.body);
      return chatReply({titulo: 'x', gancho: 'x', slides: ['x'], legenda: 'x', hashtags: [], cta: 'x'});
    }
    if (url.includes('/auth/v1/user')) {
      return supabaseReply({id: 'test-user'});
    }
    if (url.includes('app_admin')) {
      return supabaseReply([{user_id: 'test-user'}]);
    }
    if (url.includes('supabase')) {
      return supabaseReply([]);
    }
    return {ok: false, status: 404};
  };
  const historico = Array.from({length: 30}, (_, i) => ({
    papel: i % 2 === 0 ? 'usuario' : 'assistente',
    texto: `Turno ${i}`
  }));
  const req = {
    method: 'POST',
    body: {tema: 'Ansiedade', historico},
    headers: {cookie: createIdleCookie()}
  };
  const res = response();
  await postContent(req, res);
  assert.equal(res.code, 200);
  assert.ok(Array.isArray(capturedBody.messages));
  assert.equal(capturedBody.messages.length, 22); // 1 system + 20 turnos + 1 user (novo pedido)
});

test('system prompt inclui as regras de humanizacao, paginação variável e o limite de 5 hashtags no schema', async () => {
  let capturedBody;
  global.fetch = async (url, options) => {
    if (url.includes('api.openai.com')) {
      capturedBody = JSON.parse(options.body);
      return chatReply({titulo: 'x', gancho: 'x', slides: ['x'], legenda: 'x', hashtags: [], cta: 'x'});
    }
    if (url.includes('/auth/v1/user')) {
      return supabaseReply({id: 'test-user'});
    }
    if (url.includes('app_admin')) {
      return supabaseReply([{user_id: 'test-user'}]);
    }
    if (url.includes('supabase')) {
      return supabaseReply([]);
    }
    return {ok: false, status: 404};
  };
  const req = {
    method: 'POST',
    body: {tema: 'Ansiedade'},
    headers: {cookie: createIdleCookie()}
  };
  const res = response();
  await postContent(req, res);
  assert.equal(res.code, 200);
  const systemMsg = capturedBody.messages[0].content;
  assert.ok(systemMsg.includes('HUMANO'), 'deve trazer a secao de regras anti-tom-de-IA');
  assert.ok(systemMsg.includes('travessão'));
  assert.ok(systemMsg.includes('3 a 5 tags'));
  assert.ok(systemMsg.includes('Sete não é um padrão nem uma meta'));
  assert.equal(capturedBody.response_format.json_schema.schema.properties.hashtags.maxItems, 5);
  assert.equal(capturedBody.response_format.json_schema.schema.properties.slides.maxItems, 10);
});

test('anexo .txt embute o conteudo do arquivo na mensagem enviada a IA', async () => {
  let capturedBody;
  global.fetch = async (url, options) => {
    if (url.includes('api.openai.com')) {
      capturedBody = JSON.parse(options.body);
      return chatReply({titulo: 'x', gancho: 'x', slides: ['x'], legenda: 'x', hashtags: [], cta: 'x'});
    }
    if (url.includes('/auth/v1/user')) return supabaseReply({id: 'test-user'});
    if (url.includes('app_admin')) return supabaseReply([{user_id: 'test-user'}]);
    if (url.includes('supabase')) return supabaseReply([]);
    return {ok: false, status: 404};
  };
  const anexo = {nome: 'reportagem.txt', base64: Buffer.from('Estudo recente sobre ansiedade em adolescentes.', 'utf8').toString('base64')};
  const req = {method: 'POST', body: {tema: 'Ansiedade', anexo}, headers: {cookie: createIdleCookie()}};
  const res = response();
  await postContent(req, res);
  assert.equal(res.code, 200);
  assert.ok(capturedBody.messages[1].content.includes('reportagem.txt'));
  assert.ok(capturedBody.messages[1].content.includes('Estudo recente sobre ansiedade em adolescentes'));
});

test('anexo de formato nao suportado retorna 400 sem chamar a OpenAI', async () => {
  global.fetch = async (url) => {
    if (url.includes('/auth/v1/user')) return supabaseReply({id: 'test-user'});
    if (url.includes('app_admin')) return supabaseReply([{user_id: 'test-user'}]);
    if (url.includes('supabase')) return supabaseReply([]);
    throw new Error('não deveria chamar a OpenAI');
  };
  const anexo = {nome: 'foto.png', base64: Buffer.from('conteudo qualquer').toString('base64')};
  const req = {method: 'POST', body: {tema: 'Ansiedade', anexo}, headers: {cookie: createIdleCookie()}};
  const res = response();
  await postContent(req, res);
  assert.equal(res.code, 400);
});

test('imagem de referencia vira conteudo multimodal (texto + image_url) na ultima mensagem', async () => {
  let capturedBody;
  global.fetch = async (url, options) => {
    if (url.includes('api.openai.com')) {
      capturedBody = JSON.parse(options.body);
      return chatReply({titulo: 'x', gancho: 'x', slides: ['x'], legenda: 'x', hashtags: [], cta: 'x'});
    }
    if (url.includes('/auth/v1/user')) return supabaseReply({id: 'test-user'});
    if (url.includes('app_admin')) return supabaseReply([{user_id: 'test-user'}]);
    if (url.includes('supabase')) return supabaseReply([]);
    return {ok: false, status: 404};
  };
  const imagem = {tipo: 'image/png', base64: Buffer.from('fake-png-bytes').toString('base64')};
  const req = {method: 'POST', body: {tema: 'Ansiedade', imagem}, headers: {cookie: createIdleCookie()}};
  const res = response();
  await postContent(req, res);
  assert.equal(res.code, 200);
  const ultima = capturedBody.messages[capturedBody.messages.length - 1];
  assert.ok(Array.isArray(ultima.content));
  assert.equal(ultima.content[0].type, 'text');
  assert.equal(ultima.content[1].type, 'image_url');
  assert.ok(ultima.content[1].image_url.url.startsWith('data:image/png;base64,'));
});

test('imagem com tipo mime nao suportado retorna 400', async () => {
  global.fetch = async (url) => {
    if (url.includes('/auth/v1/user')) return supabaseReply({id: 'test-user'});
    if (url.includes('app_admin')) return supabaseReply([{user_id: 'test-user'}]);
    if (url.includes('supabase')) return supabaseReply([]);
    throw new Error('não deveria chamar a OpenAI');
  };
  const imagem = {tipo: 'image/svg+xml', base64: Buffer.from('<svg></svg>').toString('base64')};
  const req = {method: 'POST', body: {tema: 'Ansiedade', imagem}, headers: {cookie: createIdleCookie()}};
  const res = response();
  await postContent(req, res);
  assert.equal(res.code, 400);
});

test('historico trunca cada texto em 4000 caracteres', async () => {
  let capturedBody;
  global.fetch = async (url, options) => {
    if (url.includes('api.openai.com')) {
      capturedBody = JSON.parse(options.body);
      return chatReply({titulo: 'x', gancho: 'x', slides: ['x'], legenda: 'x', hashtags: [], cta: 'x'});
    }
    if (url.includes('/auth/v1/user')) {
      return supabaseReply({id: 'test-user'});
    }
    if (url.includes('app_admin')) {
      return supabaseReply([{user_id: 'test-user'}]);
    }
    if (url.includes('supabase')) {
      return supabaseReply([]);
    }
    return {ok: false, status: 404};
  };
  const textoLongo = 'a'.repeat(5000);
  const historico = [
    {papel: 'usuario', texto: textoLongo},
    {papel: 'assistente', texto: textoLongo}
  ];
  const req = {
    method: 'POST',
    body: {tema: 'Ansiedade', historico},
    headers: {cookie: createIdleCookie()}
  };
  const res = response();
  await postContent(req, res);
  assert.equal(res.code, 200);
  assert.equal(capturedBody.messages[1].content.length, 4000);
  assert.equal(capturedBody.messages[2].content.length, 4000);
});
