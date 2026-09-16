import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const read = file => readFile(new URL(file, root), 'utf8');

test('patient balance movements are auditable and transactional', async () => {
  const sql = await read('supabase/migrations/20260916120000_patient_session_movements.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.movimentos_saldo_sessoes/);
  assert.match(sql, /zerar_saldo_sessoes/);
  assert.match(sql, /transferir_sessoes_paciente/);
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.transferir_sessoes_paciente/);
});

test('agenda exposes the requested patient and batch-saving controls', async () => {
  const html = await read('index.html');
  assert.match(html, /id="agenda-nascimento"/);
  assert.match(html, /id="agenda-responsavel"/);
  assert.match(html, /id="perfil-transfer-wrap"/);
  assert.match(html, /transferirSessoesPerfil/);
  assert.match(html, /salvarAlteracoesAgenda/);
  assert.match(html, /id="anamnese-modelo-link"/);
  assert.match(html, /gerarLinkAnamnese/);
});

test('operational API delegates transfers and the database clears inactive balances', async () => {
  const api = await read('api/operational.js');
  const trigger = await read('supabase/migrations/20260916130000_zero_balance_on_patient_inactivation.sql');
  assert.match(trigger, /AFTER INSERT OR UPDATE OF status_operacional/);
  assert.match(trigger, /PERFORM public\.zerar_saldo_sessoes\(NEW\.id\)/);
  assert.match(api, /b\.action==='transfer_sessions'/);
  assert.match(api, /rpc\/transferir_sessoes_paciente/);
  assert.match(api, /allSessionBalances/);
});
