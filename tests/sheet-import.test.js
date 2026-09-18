import assert from 'node:assert/strict';
import test from 'node:test';

const { applySheetImport } = await import('../lib/sheet-import.js');

const CSV = [
  'Data,Paciente,Ativo,Comparecimento,Motivo,Convênio,Horário,Sessões cobradas,Valor da sessão,Valor total,Valor final,Gênero,Faixa Etária,Modalidade,CNPJ?',
  '01/09/2026,Cláudia,Ativo,Sim,,,Qua 16h,1,100,100,100,F,Adulto,Online,Não',
].join('\n');

function fetchStub({ existingPatients, existingMappings, calls }) {
  return async (url, options = {}) => {
    const method = options.method || 'GET';
    calls.push({ url: String(url), method, body: options.body });
    if (String(url).includes('docs.google.com')) return { ok: true, text: async () => CSV };
    if (url.includes('/rest/v1/importacoes') && method === 'POST') return { ok: true, json: async () => [{ id: 'run-1' }] };
    if (url.includes('/rest/v1/pacientes?select=id,nome')) return { ok: true, json: async () => existingPatients };
    if (url.includes('/rest/v1/pacientes_origem?select')) return { ok: true, json: async () => existingMappings };
    return { ok: true, json: async () => [] };
  };
}

const escritasEmPacientes = calls => calls.filter(c => /\/rest\/v1\/pacientes(\?|$)/.test(c.url) && c.method !== 'GET');

test('importação da planilha não escreve em paciente já cadastrado e conclui a importação', async () => {
  const calls = [];
  global.fetch = fetchStub({
    existingPatients: [{ id: 'paciente-1', nome: 'Cláudia Souza Lima' }],
    // A planilha continua com o nome curto -- o vínculo é pela chave estável
    // (chave_origem), não pelo nome atual do cadastro.
    existingMappings: [{ chave_origem: 'claudia', paciente_id: 'paciente-1' }],
    calls,
  });
  const result = await applySheetImport({ supabaseUrl: 'https://example.supabase.co', supabaseKey: 'key', sheetUrl: 'https://docs.google.com/x' });
  assert.deepEqual(escritasEmPacientes(calls), [], 'nenhuma escrita em pacientes (nome, rótulo ou status)');
  assert.equal(result.mode, 'applied');
  const sessoes = calls.find(c => c.url.includes('/rest/v1/sessoes?on_conflict=source_key'));
  assert.ok(sessoes, 'as sessões da planilha continuam sendo importadas');
  assert.equal(JSON.parse(sessoes.body)[0].paciente_id, 'paciente-1');
});

test('paciente realmente novo na planilha ainda é criado (inativo) e vinculado', async () => {
  const calls = [];
  global.fetch = fetchStub({ existingPatients: [], existingMappings: [], calls });
  global.fetch = (inner => async (url, options = {}) => {
    if (url.includes('/rest/v1/pacientes?on_conflict=nome')) {
      calls.push({ url, method: 'POST', body: options.body });
      return { ok: true, json: async () => [{ id: 'novo-1', nome: 'Cláudia' }] };
    }
    return inner(url, options);
  })(global.fetch);
  await applySheetImport({ supabaseUrl: 'https://example.supabase.co', supabaseKey: 'key', sheetUrl: 'https://docs.google.com/x' });
  const criacao = calls.find(c => c.url.includes('/rest/v1/pacientes?on_conflict=nome'));
  assert.equal(JSON.parse(criacao.body)[0].ativo, false);
  assert.equal(escritasEmPacientes(calls).length, 1, 'só a criação do paciente novo');
});
