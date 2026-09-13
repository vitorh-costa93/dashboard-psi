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
  global.fetch = async (url, options) => { if (String(url).includes('api.openai.com')) { if (capturedBody === undefined) capturedBody = JSON.parse(options.body); return openaiResponsesReply('Texto gerado.'); } return {ok: true, status: 200, json: async () => ([])}; };
  const res = response();
  await handleDocuments({method: 'POST', body: {action: 'generate', tipo: 'solicitacao_escolar', descricao: 'A criança tem dificuldade de concentração em sala.'}}, res, {id: 'admin-1'});
  assert.equal(res.code, 200);
  assert.equal(res.body.texto, 'Texto gerado.');
  assert.equal(typeof capturedBody.input, 'string');
  assert.equal(capturedBody.input, 'A criança tem dificuldade de concentração em sala.');
});

test('generate com historico manda "input" como array de turnos + o novo pedido', async () => {
  let capturedBody;
  global.fetch = async (url, options) => { if (String(url).includes('api.openai.com')) { if (capturedBody === undefined) capturedBody = JSON.parse(options.body); return openaiResponsesReply('Texto ajustado, mais curto.'); } return {ok: true, status: 200, json: async () => ([])}; };
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

test('generate trunca historico com mais de 20 turnos para os ultimos 20', async () => {
  let capturedBody;
  global.fetch = async (url, options) => { if (String(url).includes('api.openai.com')) { if (capturedBody === undefined) capturedBody = JSON.parse(options.body); return openaiResponsesReply('OK'); } return {ok: true, status: 200, json: async () => ([])}; };
  const res = response();
  const historico = Array.from({length: 30}, (_, i) => ({
    papel: i % 2 === 0 ? 'usuario' : 'assistente',
    texto: `Turno ${i}`
  }));
  await handleDocuments({method: 'POST', body: {action: 'generate', tipo: 'solicitacao_escolar', descricao: 'Nova pergunta', historico}}, res, {id: 'admin-1'});
  assert.equal(res.code, 200);
  assert.ok(Array.isArray(capturedBody.input));
  assert.equal(capturedBody.input.length, 21); // 20 turnos + novo pedido
});

test('generate trunca cada texto de historico em 4000 caracteres', async () => {
  let capturedBody;
  global.fetch = async (url, options) => { if (String(url).includes('api.openai.com')) { if (capturedBody === undefined) capturedBody = JSON.parse(options.body); return openaiResponsesReply('OK'); } return {ok: true, status: 200, json: async () => ([])}; };
  const res = response();
  const textoLongo = 'a'.repeat(5000);
  const historico = [
    {papel: 'usuario', texto: textoLongo},
    {papel: 'assistente', texto: textoLongo}
  ];
  await handleDocuments({method: 'POST', body: {action: 'generate', tipo: 'solicitacao_escolar', descricao: 'Nova pergunta', historico}}, res, {id: 'admin-1'});
  assert.equal(res.code, 200);
  assert.equal(capturedBody.input[0].content.length, 4000);
  assert.equal(capturedBody.input[1].content.length, 4000);
});

test('generate aceita descricao curta quando historico não-vazio é enviado (pedido de ajuste do chat)', async () => {
  global.fetch = async (url) => (String(url).includes('api.openai.com') ? openaiResponsesReply('Texto ajustado.') : {ok: true, status: 200, json: async () => ([])});
  const res = response();
  const historico = [
    {papel: 'usuario', texto: 'A criança tem dificuldade de concentração em sala.'},
    {papel: 'assistente', texto: 'Texto gerado.'},
  ];
  await handleDocuments({method: 'POST', body: {action: 'generate', tipo: 'solicitacao_escolar', descricao: 'formal', historico}}, res, {id: 'admin-1'});
  assert.equal(res.code, 200);
  assert.equal(res.body.texto, 'Texto ajustado.');
});

test('generate relatorio_psicologico sem formato (ou "estruturado") usa as instrucoes de 4 secoes (estrutura consolidada -- so a linguagem foi recalibrada)', async () => {
  let capturedBody;
  global.fetch = async (url, options) => { if (String(url).includes('api.openai.com')) { if (capturedBody === undefined) capturedBody = JSON.parse(options.body); return openaiResponsesReply('Texto gerado.'); } return {ok: true, status: 200, json: async () => ([])}; };
  const res = response();
  await handleDocuments({method: 'POST', body: {action: 'generate', tipo: 'relatorio_psicologico', descricao: 'Criança apresenta dificuldade de concentração em sala de aula.'}}, res, {id: 'admin-1'});
  assert.equal(res.code, 200);
  assert.ok(capturedBody.instructions.includes('Descrição, Análise, Conclusão e Orientações'));
});

test('generate encaminhamento usa a estrutura fixa propria (Desenvolvimento/Justificativa/Fundamentacao etica/Encaminhamento)', async () => {
  let capturedBody;
  global.fetch = async (url, options) => { if (String(url).includes('api.openai.com')) { if (capturedBody === undefined) capturedBody = JSON.parse(options.body); return openaiResponsesReply('Texto gerado.'); } return {ok: true, status: 200, json: async () => ([])}; };
  const res = response();
  await handleDocuments({method: 'POST', body: {action: 'generate', tipo: 'encaminhamento', descricao: 'Paciente apresenta dificuldade de manter o enquadre terapeutico.'}}, res, {id: 'admin-1'});
  assert.equal(res.code, 200);
  assert.ok(!capturedBody.instructions.includes('Descrição, Análise, Conclusão e Orientações'));
  assert.ok(capturedBody.instructions.includes('Desenvolvimento do acompanhamento'));
  assert.ok(capturedBody.instructions.includes('Justificativa do encaminhamento'));
  assert.ok(capturedBody.instructions.includes('Fundamentação ética'));
  assert.ok(capturedBody.instructions.includes('Resolução CFP nº 010/2005'));
});

test('generate relatorio_psicologico com formato "orientacao" usa instrucoes de texto corrido e curto', async () => {
  let capturedBody;
  global.fetch = async (url, options) => { if (String(url).includes('api.openai.com')) { if (capturedBody === undefined) capturedBody = JSON.parse(options.body); return openaiResponsesReply('Texto gerado.'); } return {ok: true, status: 200, json: async () => ([])}; };
  const res = response();
  await handleDocuments({method: 'POST', body: {action: 'generate', tipo: 'relatorio_psicologico', descricao: 'Criança apresenta dificuldade de concentração em sala de aula.', formato: 'orientacao'}}, res, {id: 'admin-1'});
  assert.equal(res.code, 200);
  assert.ok(capturedBody.instructions.includes('sem dividir em seções tituladas'));
  assert.ok(!capturedBody.instructions.includes('Descrição, Análise, Conclusão e Orientações'));
});

test('generate reforca tom humanizado e proibe jargao de IA/autoajuda em todos os tipos com texto de IA', async () => {
  let capturedBody;
  global.fetch = async (url, options) => { if (String(url).includes('api.openai.com')) { if (capturedBody === undefined) capturedBody = JSON.parse(options.body); return openaiResponsesReply('Texto gerado.'); } return {ok: true, status: 200, json: async () => ([])}; };
  for (const tipo of ['relatorio_psicologico', 'encaminhamento', 'solicitacao_escolar']) {
    const res = response();
    await handleDocuments({method: 'POST', body: {action: 'generate', tipo, descricao: 'Criança apresenta dificuldade de concentração em sala de aula.'}}, res, {id: 'admin-1'});
    assert.equal(res.code, 200, tipo);
    assert.ok(capturedBody.instructions.includes('acolhimento humano'), tipo);
    assert.ok(capturedBody.instructions.includes('scripts'), tipo);
  }
});

test('generate sem historico NAO inclui o reforco de "ajuste dentro de uma conversa"', async () => {
  let capturedBody;
  global.fetch = async (url, options) => { if (String(url).includes('api.openai.com')) { if (capturedBody === undefined) capturedBody = JSON.parse(options.body); return openaiResponsesReply('Texto gerado.'); } return {ok: true, status: 200, json: async () => ([])}; };
  const res = response();
  await handleDocuments({method: 'POST', body: {action: 'generate', tipo: 'solicitacao_escolar', descricao: 'Criança apresenta dificuldade de concentração em sala de aula.'}}, res, {id: 'admin-1'});
  assert.equal(res.code, 200);
  assert.ok(!capturedBody.instructions.includes('ajuste dentro de uma conversa'));
});

test('generate com historico inclui o reforco pra priorizar o pedido mais recente da psicologa', async () => {
  let capturedBody;
  global.fetch = async (url, options) => { if (String(url).includes('api.openai.com')) { if (capturedBody === undefined) capturedBody = JSON.parse(options.body); return openaiResponsesReply('Texto ajustado.'); } return {ok: true, status: 200, json: async () => ([])}; };
  const res = response();
  const historico = [
    {papel: 'usuario', texto: 'Criança apresenta dificuldade de concentração em sala de aula.'},
    {papel: 'assistente', texto: 'Texto gerado.'},
  ];
  await handleDocuments({method: 'POST', body: {action: 'generate', tipo: 'solicitacao_escolar', descricao: 'Deixa mais acolhedor', historico}}, res, {id: 'admin-1'});
  assert.equal(res.code, 200);
  assert.ok(capturedBody.instructions.includes('ajuste dentro de uma conversa'));
  assert.ok(capturedBody.instructions.includes('priorize atender exatamente o que a psicóloga pediu na mensagem mais recente'));
});

test('generate le a preferencia aprendida do banco e embute nas instructions', async () => {
  let capturedBody;
  global.fetch = async (url, options) => {
    if (String(url).includes('api.openai.com')) { if (capturedBody === undefined) capturedBody = JSON.parse(options.body); return openaiResponsesReply('Texto gerado.'); }
    if (String(url).includes('/rest/v1/ia_preferencias_texto') && (!options || options.method === undefined)) return {ok: true, status: 200, json: async () => ([{notas: 'Prefere frases curtas e diretas.'}])};
    return {ok: true, status: 200, json: async () => ([])};
  };
  const res = response();
  await handleDocuments({method: 'POST', body: {action: 'generate', tipo: 'solicitacao_escolar', descricao: 'Criança apresenta dificuldade de concentração em sala de aula.'}}, res, {id: 'admin-1'});
  assert.equal(res.code, 200);
  assert.ok(capturedBody.instructions.includes('Prefere frases curtas e diretas.'));
});

test('generate sem historico NAO dispara aprendizado (nenhuma chamada extra a OpenAI)', async () => {
  let openaiCalls = 0;
  global.fetch = async (url) => {
    if (String(url).includes('api.openai.com')) { openaiCalls++; return openaiResponsesReply('Texto gerado.'); }
    return {ok: true, status: 200, json: async () => ([])};
  };
  const res = response();
  await handleDocuments({method: 'POST', body: {action: 'generate', tipo: 'solicitacao_escolar', descricao: 'Criança apresenta dificuldade de concentração em sala de aula.'}}, res, {id: 'admin-1'});
  assert.equal(res.code, 200);
  assert.equal(openaiCalls, 1);
});

test('generate com historico dispara uma segunda chamada (aprendizado) e grava a preferencia atualizada', async () => {
  let openaiCalls = 0, savedBody;
  global.fetch = async (url, options) => {
    if (String(url).includes('api.openai.com')) {
      openaiCalls++;
      return openaiCalls === 1 ? openaiResponsesReply('Texto ajustado.') : openaiResponsesReply('Sempre usar tom mais acolhedor e humano, evitando jargão técnico.');
    }
    if (String(url).includes('/rest/v1/ia_preferencias_texto') && options?.method === 'POST') { savedBody = JSON.parse(options.body); return {ok: true, status: 200, json: async () => ([])}; }
    return {ok: true, status: 200, json: async () => ([])};
  };
  const res = response();
  const historico = [
    {papel: 'usuario', texto: 'Criança apresenta dificuldade de concentração em sala de aula.'},
    {papel: 'assistente', texto: 'Texto gerado.'},
  ];
  await handleDocuments({method: 'POST', body: {action: 'generate', tipo: 'solicitacao_escolar', descricao: 'Deixa mais acolhedor', historico}}, res, {id: 'admin-1'});
  assert.equal(res.code, 200);
  assert.equal(openaiCalls, 2);
  assert.equal(savedBody.contexto, 'documentos');
  assert.ok(savedBody.notas.includes('acolhedor'));
});

test('generate com anexo .txt embute o conteudo do arquivo na descricao enviada a IA', async () => {
  let capturedBody;
  global.fetch = async (url, options) => { if (String(url).includes('api.openai.com')) { if (capturedBody === undefined) capturedBody = JSON.parse(options.body); return openaiResponsesReply('Texto gerado com base no anexo.'); } return {ok: true, status: 200, json: async () => ([])}; };
  const res = response();
  const anexo = {nome: 'observacoes.txt', base64: Buffer.from('A criança demonstrou dificuldade de concentração durante a atividade.', 'utf8').toString('base64')};
  await handleDocuments({method: 'POST', body: {action: 'generate', tipo: 'solicitacao_escolar', descricao: 'Elabore com base no anexo', anexo}}, res, {id: 'admin-1'});
  assert.equal(res.code, 200);
  assert.ok(capturedBody.input.includes('observacoes.txt'));
  assert.ok(capturedBody.input.includes('dificuldade de concentração durante a atividade'));
  assert.ok(res.body.descricaoComAnexo.includes('observacoes.txt'));
});

test('generate com anexo de formato nao suportado retorna 400 sem chamar a OpenAI', async () => {
  global.fetch = async () => { throw new Error('não deveria chamar a OpenAI'); };
  const res = response();
  const anexo = {nome: 'foto.png', base64: Buffer.from('conteudo qualquer').toString('base64')};
  await handleDocuments({method: 'POST', body: {action: 'generate', tipo: 'solicitacao_escolar', descricao: 'Elabore com base no anexo', anexo}}, res, {id: 'admin-1'});
  assert.equal(res.code, 400);
});

test('generate com anexo maior que 4MB retorna 413 sem chamar a OpenAI', async () => {
  global.fetch = async () => { throw new Error('não deveria chamar a OpenAI'); };
  const res = response();
  const anexo = {nome: 'grande.txt', base64: Buffer.alloc(5 * 1024 * 1024, 'a').toString('base64')};
  await handleDocuments({method: 'POST', body: {action: 'generate', tipo: 'solicitacao_escolar', descricao: 'Elabore com base no anexo', anexo}}, res, {id: 'admin-1'});
  assert.equal(res.code, 413);
});

test('generate com anexo malformado (sem base64) retorna 400', async () => {
  global.fetch = async () => { throw new Error('não deveria chamar a OpenAI'); };
  const res = response();
  await handleDocuments({method: 'POST', body: {action: 'generate', tipo: 'solicitacao_escolar', descricao: 'Elabore com base no anexo', anexo: {nome: 'x.txt'}}}, res, {id: 'admin-1'});
  assert.equal(res.code, 400);
});

test('generate continua rejeitando descricao curta quando historico está ausente/vazio', async () => {
  global.fetch = async () => { throw new Error('não deveria chamar a OpenAI'); };
  const res1 = response();
  await handleDocuments({method: 'POST', body: {action: 'generate', tipo: 'solicitacao_escolar', descricao: 'formal'}}, res1, {id: 'admin-1'});
  assert.equal(res1.code, 400);

  const res2 = response();
  await handleDocuments({method: 'POST', body: {action: 'generate', tipo: 'solicitacao_escolar', descricao: 'formal', historico: []}}, res2, {id: 'admin-1'});
  assert.equal(res2.code, 400);
});
