import assert from 'node:assert/strict';
import test from 'node:test';
import {createHmac} from 'node:crypto';

process.env.OPENAI_KEY = 'test-openai-key';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.CLINICAL_DATA_KEY = Buffer.alloc(32, 7).toString('base64');

const {default: forms} = await import('../api/forms.js');

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

function supabaseReply(data, ok = true, status = 200) {
  return {ok, status, json: async () => data};
}

function authFetchStub(extra) {
  return async (url, options) => {
    if (url.includes('/auth/v1/user')) return supabaseReply({id: 'test-user'});
    if (url.includes('app_admin')) return supabaseReply([{user_id: 'test-user'}]);
    return extra(url, options);
  };
}

function baseReq(body) {
  return {method: 'POST', body, headers: {cookie: createIdleCookie()}};
}

test('action=template atualiza campos/finalidade quando o modelo já existe (em vez de devolvê-lo intocado)', async () => {
  let patchBody, patchUrl;
  global.fetch = authFetchStub(async (url, options) => {
    if (url.includes('/rest/v1/formularios_modelos?select=id,nome,finalidade,campos,destino,ativo')) {
      return supabaseReply([{id: 'modelo-1', nome: 'Anamnese inicial completa', finalidade: 'antiga', campos: [{key: 'nome_completo'}], destino: 'anamnese', ativo: true}]);
    }
    if (url.includes('/rest/v1/formularios_modelos?id=eq.modelo-1') && options.method === 'PATCH') {
      patchUrl = url; patchBody = JSON.parse(options.body);
      return supabaseReply([{id: 'modelo-1', ...patchBody}]);
    }
    throw new Error('chamada inesperada: ' + url);
  });
  const novoCampos = [{key: 'nome_crianca', label: 'Nome da criança', type: 'text', required: true, secao: 'Identificação'}];
  const req = baseReq({action: 'template', destino: 'anamnese', nome: 'Anamnese inicial completa', finalidade: 'nova', campos: novoCampos});
  const res = response();
  await forms(req, res);
  assert.equal(res.code, 200);
  assert.ok(patchUrl, 'deveria ter feito PATCH no modelo existente');
  assert.deepEqual(patchBody.campos, novoCampos);
  assert.equal(patchBody.finalidade, 'nova');
  assert.deepEqual(res.body.campos, novoCampos);
});

test('action=template cria um modelo novo quando nenhum existe ainda', async () => {
  let createdBody;
  global.fetch = authFetchStub(async (url, options) => {
    if (url.includes('/rest/v1/formularios_modelos?select=id,nome,finalidade,campos,destino,ativo')) {
      return supabaseReply([]);
    }
    if (url === 'https://example.supabase.co/rest/v1/formularios_modelos' && options.method === 'POST') {
      createdBody = JSON.parse(options.body);
      return supabaseReply([{id: 'modelo-novo', ...createdBody}], true, 201);
    }
    throw new Error('chamada inesperada: ' + url);
  });
  const req = baseReq({action: 'template', destino: 'cadastro', nome: 'Cadastro do paciente', finalidade: 'x', campos: [{key: 'nome_completo'}]});
  const res = response();
  await forms(req, res);
  assert.equal(res.code, 201);
  assert.equal(createdBody.nome, 'Cadastro do paciente');
});
