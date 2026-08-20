import assert from 'node:assert/strict';
import test from 'node:test';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.CLINICAL_DATA_KEY = Buffer.alloc(32,7).toString('base64');

const {requireAuth,setSessionCookies,IDLE_TIMEOUT_MS} = await import('../api/_auth.js');
const {default: setup} = await import('../api/auth/setup.js');
const {default: login} = await import('../api/auth/login.js');
const {default: status} = await import('../api/auth/status.js');
const {default: operational} = await import('../api/operational.js');
const {default: forms} = await import('../api/forms.js');
const {handleDocuments,formatDates} = await import('../lib/documents.js');
const {default: publicForm} = await import('../api/form.js');
const {encryptClinicalData} = await import('../api/_clinical-crypto.js');

function response() {
  return {
    code: 200,
    headers: {},
    body: undefined,
    status(code) { this.code = code; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
  };
}

function jsonResponse(body, ok = true, statusCode = 200) {
  return {ok, status: statusCode, json: async () => body};
}

function authenticatedCookie(){
  const res=response();
  setSessionCookies(res,{access_token:'token',refresh_token:'refresh',expires_in:3600});
  return res.headers['Set-Cookie'].map(value=>value.split(';')[0]).join('; ');
}

test('visitante sem cookie é bloqueado', async () => {
  global.fetch = async () => { throw new Error('não deveria consultar sem token'); };
  const res = response();
  const user = await requireAuth({headers: {}}, res);
  assert.equal(user, null);
  assert.equal(res.code, 401);
});

test('API operacional não entrega dados a visitante', async () => {
  global.fetch = async () => { throw new Error('não deveria consultar sem token'); };
  const res = response();
  await operational({method: 'GET', headers: {}}, res);
  assert.equal(res.code, 401);
});

test('administração de formulários não entrega dados a visitante', async () => {
  global.fetch=async()=>{throw new Error('não deveria consultar sem token');};
  const res=response();await forms({method:'GET',headers:{}},res);assert.equal(res.code,401);
});

test('documentos por paciente não são entregues a visitante', async () => {
  global.fetch=async()=>{throw new Error('não deveria consultar sem token');};
  const res=response();await forms({method:'GET',query:{resource:'documents'},headers:{}},res);assert.equal(res.code,401);
});

test('datas de documentos são apresentadas no padrão brasileiro', () => {
  assert.equal(formatDates('Sessões em 2026-08-20 e 2026-08-27.'),'Sessões em 20/08/2026 e 27/08/2026.');
});

test('exportação de documento salvo gera um arquivo docx válido', async () => {
  const id='11111111-1111-4111-8111-111111111111';
  global.fetch=async url=>{
    if(url.includes('/auth/v1/user'))return jsonResponse({id:'admin-1'});
    if(url.includes('app_admin'))return jsonResponse([{user_id:'admin-1'}]);
    if(url.includes('documentos_clinicos'))return jsonResponse([{id,paciente_id:'22222222-2222-4222-8222-222222222222',tipo:'declaracao_comparecimento',titulo:'Declaração de Comparecimento',emitido_em:'2026-08-20',criado_em:'2026-08-20T12:00:00Z',conteudo:encryptClinicalData({campos:{Paciente:'Teste'},secoes:[{titulo:'Declaração',texto:'Compareceu ao atendimento.'}]})}]);
    throw new Error(`URL inesperada: ${url}`);
  };
  const res=response();await handleDocuments({method:'GET',query:{action:'export',id},headers:{cookie:authenticatedCookie()}},res,{id:'admin-1'});
  assert.equal(res.code,200);assert.equal(Buffer.from(res.body).subarray(0,2).toString(),'PK');
});

test('formulário público recusa token curto sem consultar o banco', async () => {
  global.fetch=async()=>{throw new Error('não deveria consultar token inválido');};
  const res=response();await publicForm({method:'GET',query:{token:'curto'},headers:{}},res);assert.equal(res.code,404);
});

test('exportação de anamnese gera um arquivo docx válido', async () => {
  global.fetch=async url=>{
    if(url.includes('/auth/v1/user'))return jsonResponse({id:'admin-1'});
    if(url.includes('app_admin'))return jsonResponse([{user_id:'admin-1'}]);
    throw new Error(`URL inesperada: ${url}`);
  };
  const res=response();
  await forms({method:'POST',headers:{cookie:authenticatedCookie()},body:{action:'export_anamnesis',paciente_nome:'Teste',versao:1,criado_em:'19/08/2026',secoes:[{titulo:'Identificação',itens:[{rotulo:'Nome',valor:'Teste'}]}]}},res);
  assert.equal(res.code,200);
  assert.equal(Buffer.from(res.body.arquivo,'base64').subarray(0,2).toString(),'PK');
});

test('API operacional entrega contrato legado somente ao administrador', async () => {
  global.fetch = async url => {
    if(url.includes('/auth/v1/user'))return jsonResponse({id:'admin-1',email:'admin@example.com'});
    if(url.includes('app_admin'))return jsonResponse([{user_id:'admin-1'}]);
    if(url.includes('/sessoes?'))return jsonResponse([{data_sessao:'2026-08-19',genero:'F',faixa_etaria:'Adulto',modalidade:'Online',horario:'Quarta 10h',comparecimento:'Sim',motivo:null,valor_sessao:150,sessoes_cobradas:1,valor_total:150,valor_final:150,cnpj:false,pacientes:{nome:'Paciente Teste',ativo:true},convenios:{nome:'Particular'}}]);
    throw new Error(`URL inesperada: ${url}`);
  };
  const res=response();
  await operational({method:'GET',headers:{cookie:authenticatedCookie()}},res);
  assert.equal(res.code,200);
  assert.equal(res.body[0].Data,'19/08/2026');
  assert.equal(res.body[0].Paciente,'Paciente Teste');
  assert.equal(res.body[0].Ativo,'Ativo');
});

test('sessão expira após uma hora sem atividade', async () => {
  const cookie=authenticatedCookie(),realNow=Date.now,base=realNow();
  Date.now=()=>base+IDLE_TIMEOUT_MS+1;
  global.fetch=async()=>{throw new Error('não deve consultar o Supabase após expiração');};
  try{
    const res=response(),user=await requireAuth({headers:{cookie}},res);
    assert.equal(user,null);assert.equal(res.code,401);assert.match(res.body.error,/inatividade/i);
  }finally{Date.now=realNow;}
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
