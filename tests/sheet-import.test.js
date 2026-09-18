import assert from 'node:assert/strict';
import test from 'node:test';

const { applySheetImport } = await import('../lib/sheet-import.js');

const CSV = [
  'Data,Paciente,Ativo,Comparecimento,Motivo,Convênio,Horário,Sessões cobradas,Valor da sessão,Valor total,Valor final,Gênero,Faixa Etária,Modalidade,CNPJ?',
  '01/09/2026,Cláudia,Ativo,Sim,,,Qua 16h,1,100,100,100,F,Adulto,Online,Não',
].join('\n');

function fetchStub({ existingPatients, existingMappings, capture }) {
  return async (url, options) => {
    if (String(url).includes('docs.google.com')) {
      return { ok: true, text: async () => CSV };
    }
    if (url.includes('/rest/v1/importacoes') && options?.method === 'POST') {
      return { ok: true, json: async () => [{ id: 'run-1' }] };
    }
    if (url.includes('/rest/v1/importacoes')) {
      return { ok: true, json: async () => ({}) };
    }
    if (url.includes('/rest/v1/pacientes_origem') && (!options || options.method === undefined)) {
      return { ok: true, json: async () => existingMappings || [] };
    }
    if (url.includes('/rest/v1/pacientes?select=id,nome')) {
      return { ok: true, json: async () => existingPatients };
    }
    if (url.includes('/rest/v1/pacientes?on_conflict=id')) {
      capture.pacientesUpsert = JSON.parse(options.body);
      return { ok: true, json: async () => capture.pacientesUpsert };
    }
    if (url.includes('/rest/v1/pacientes?on_conflict=nome')) {
      return { ok: true, json: async () => [] };
    }
    if (url.includes('/rest/v1/pacientes_origem?on_conflict')) {
      return { ok: true, json: async () => [] };
    }
    if (url.includes('/rest/v1/convenios')) {
      return { ok: true, json: async () => [] };
    }
    if (url.includes('/rest/v1/sessoes')) {
      return { ok: true, json: async () => [] };
    }
    return { ok: true, json: async () => [] };
  };
}

test('importação da planilha não sobrescreve nome/ultima_chave/ultimo_label de paciente já cadastrado', async () => {
  const capture = {};
  global.fetch = fetchStub({
    existingPatients: [{ id: 'paciente-1', nome: 'Cláudia Souza Lima' }],
    // A planilha continua com o nome curto original -- o vínculo com o
    // paciente já cadastrado é feito por esta chave estável (chave_origem),
    // não pelo nome atual, que pode ter sido completado no cadastro.
    existingMappings: [{ chave_origem: 'claudia', paciente_id: 'paciente-1' }],
    capture,
  });
  await applySheetImport({ supabaseUrl: 'https://example.supabase.co', supabaseKey: 'key', sheetUrl: 'https://docs.google.com/x' });
  assert.ok(capture.pacientesUpsert, 'deveria ter chamado o upsert de pacientes');
  assert.equal(capture.pacientesUpsert.length, 1);
  const payload = capture.pacientesUpsert[0];
  assert.equal(payload.id, 'paciente-1');
  assert.equal(payload.ativo, true);
  assert.equal('nome' in payload, false, 'nome não deveria ser reenviado -- sobrescreveria o cadastro completo');
  assert.equal('ultima_chave' in payload, false);
  assert.equal('ultimo_label' in payload, false);
});
