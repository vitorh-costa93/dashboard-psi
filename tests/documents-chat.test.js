import assert from 'node:assert/strict';
import test from 'node:test';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.CLINICAL_DATA_KEY = Buffer.alloc(32,7).toString('base64');
process.env.OPENAI_KEY = 'test-openai-key';

const {handleDocuments} = await import('../lib/documents.js');

function response() {
  return {
    code: 200,
    body: undefined,
    status(code) { this.code = code; return this; },
    setHeader() {},
    json(body) { this.body = body; return this; },
  };
}

function openaiResponsesReply(text) {
  return {ok: true, status: 200, json: async () => ({output: [{content: [{type: 'output_text', text}]}]})};
}

test('generate sem historico manda "input" como string simples (comportamento atual preservado)', async () => {
  let capturedBody;
  global.fetch = async (url, options) => { capturedBody = JSON.parse(options.body); return openaiResponsesReply('Texto gerado.'); };
  const res = response();
  await handleDocuments({method: 'POST', body: {action: 'generate', tipo: 'solicitacao_escolar', descricao: 'A criança tem dificuldade de concentração em sala.'}}, res, {id: 'admin-1'});
  assert.equal(res.code, 200);
  assert.equal(res.body.texto, 'Texto gerado.');
  assert.equal(typeof capturedBody.input, 'string');
  assert.equal(capturedBody.input, 'A criança tem dificuldade de concentração em sala.');
});

test('generate com historico manda "input" como array de turnos + o novo pedido', async () => {
  let capturedBody;
  global.fetch = async (url, options) => { capturedBody = JSON.parse(options.body); return openaiResponsesReply('Texto ajustado, mais curto.'); };
  const res = response();
  const historico = [
    {papel: 'usuario', texto: 'A criança tem dificuldade de concentração em sala.'},
    {papel: 'assistente', texto: 'Texto gerado.'},
  ];
  await handleDocuments({method: 'POST', body: {action: 'generate', tipo: 'solicitacao_escolar', descricao: 'Deixa mais curto', historico}}, res, {id: 'admin-1'});
  assert.equal(res.code, 200);
  assert.equal(res.body.texto, 'Texto ajustado, mais curto.');
  assert.ok(Array.isArray(capturedBody.input));
  assert.deepEqual(capturedBody.input, [
    {role: 'user', content: 'A criança tem dificuldade de concentração em sala.'},
    {role: 'assistant', content: 'Texto gerado.'},
    {role: 'user', content: 'Deixa mais curto'},
  ]);
});

test('generate valida historico malformado', async () => {
  global.fetch = async () => { throw new Error('não deveria chamar a OpenAI'); };
  const res = response();
  await handleDocuments({method: 'POST', body: {action: 'generate', tipo: 'solicitacao_escolar', descricao: 'Deixa mais curto', historico: 'não é array'}}, res, {id: 'admin-1'});
  assert.equal(res.code, 400);
});
