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
  assert.match(html, /id="agenda-paciente-overlay"/);
  assert.match(html, /abrirCadastroPaciente\(\)/);
  assert.match(html, />\+ Novo paciente</);
  assert.match(html, /agenda-section-wrap/);
  assert.match(html, /@media\(max-width:1120px\)/);
  assert.match(html, /agenda-table th:nth-child\(3\)/);
  assert.match(html, /overflow-x:hidden/);
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

test('salvamento em lote da Agenda é atômico e informa a linha inválida', async () => {
  const sql = await read('supabase/migrations/20260917110000_agenda_batch_settlement.sql');
  const api = await read('api/operational.js');
  const html = await read('index.html');
  assert.match(sql, /finalizar_agenda_em_lote/);
  assert.match(sql, /Primeira passagem: não toca em dados/);
  assert.match(sql, /Linha %:/);
  assert.match(sql, /public\.finalizar_agenda_atendimento/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.finalizar_agenda_em_lote/);
  assert.match(api, /b\.action==='settle_appointments_batch'/);
  assert.match(api, /rpc\/finalizar_agenda_em_lote/);
  assert.match(html, /action:'settle_appointments_batch'/);
  assert.match(html, /statusEl&&statusEl\.value!=='agendado'/);
  assert.doesNotMatch(html.match(/async function salvarAlteracoesAgenda\(\)\{[\s\S]*?\n/)[0], /action:'settle_appointment',/);
});

test('lançamentos administrativos de saldo não entram na tabela consolidada de atendimentos', async () => {
  const html = await read('index.html');
  const api = await read('api/operational.js');
  assert.match(html, /!String\(x\.source_key\|\|''\)\.startsWith\('movimento-saldo:'\)/);
  assert.match(api, /select=id,paciente_id,source_key,data_sessao/);
  assert.doesNotMatch(html.match(/async function loadData\(\)\{[\s\S]*?\n\}/)[0], /sincronizarPacientesPlanilha/);
});

test('API bloqueia o antigo upsert de pacientes por nome', async () => {
  const api = await read('api/data.js');
  assert.match(api, /table === 'pacientes' && action === 'upsert'/);
  assert.match(api, /sincronização legada de pacientes foi desativada/);
});

test('cadastro de paciente padroniza faixa etária Adulta e reflete modalidade no Dashboard', async () => {
  const html = await read('index.html');
  const api = await read('api/operational.js');
  const sql = await read('supabase/migrations/20261117093000_pacientes_modalidade_e_faixa_adulta.sql');
  assert.match(html, /id="perfil-faixa">[^<]*<option value="">—<\/option><option>Criança<\/option><option>Adolescente<\/option><option>Adulta<\/option>/);
  assert.match(html, /id="agenda-faixa">[^<]*<option value="">—<\/option><option>Criança<\/option><option>Adolescente<\/option><option>Adulta<\/option>/);
  assert.match(html, /id="perfil-modalidade">[^<]*<option value="">Não informada<\/option><option>Online<\/option><option>Presencial<\/option>/);
  assert.match(html, /id="agenda-modalidade">[^<]*<option value="">Não informada<\/option><option>Online<\/option><option>Presencial<\/option>/);
  assert.match(html, /if\(c\.modalidade\)p\._modalidade=c\.modalidade/);
  assert.match(api, /normalizarFaixa/);
  assert.match(api, /x\.pacientes\?\.modalidade\|\|x\.modalidade/);
  assert.match(api, /r\.pacientes\?\.modalidade\|\|r\.modalidade/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS modalidade text/);
  assert.match(sql, /SET faixa_etaria = 'Adulta'/);
});

test('tabela detalhada remove Convênio, inclui contador dinâmico de linhas e exporta imagem', async () => {
  const html = await read('index.html');
  const blocoTabela = html.match(/<div id="dashsub-atend">[\s\S]*?<\/table>/)[0];
  assert.doesNotMatch(blocoTabela, />Convênio</);
  assert.match(blocoTabela, /<th[^>]*>#<\/th>/);
  assert.match(blocoTabela, /onclick="exportarImagemSessoesDetalhado\(\)"/);
  assert.match(blocoTabela, /id="dsess-tfoot"/);
  assert.match(blocoTabela, /id="dsess-total-comp"/);
  assert.match(blocoTabela, /id="dsess-total-pagas"/);
  assert.match(html, /data-label="#"[^>]*>\$\{idx\+1\}<\/td>/);
  assert.match(html, /function exportarImagemSessoesDetalhado\(\)/);
});

test('Fases 2-5: header sync, tooltips KPI, CNPJ, Agenda telefone/remarcar e Espaço de criação', async () => {
  const html = await read('index.html');
  const api = await read('api/operational.js');
  const sql = await read('supabase/migrations/20261123150000_pacientes_telefone.sql');
  assert.match(html, /id="header-sync-pill"/);
  assert.match(html, /class="kpi-info-btn"/);
  assert.match(html, /id="dsess-so-aberto"/);
  assert.match(html, /id="dsess-img-valores"/);
  assert.match(html, /onclick="copiarTextoCnpj\(\)"/);
  assert.match(html, /id="perfil-telefone"/);
  assert.match(html, /id="agenda-telefone"/);
  assert.match(html, /id="agenda-cnpj"/);
  assert.match(html, /function aplicarLogoAtividade\(/);
  assert.match(html, /id="f-busca-img"/);
  assert.match(html, /function atualizarSlidePPT\(/);
  assert.match(html, /function copiarLegendaHashtagsPost\(/);
  assert.match(html, /function moverFotoSlide\(/);
  assert.match(html, /id="pront-filtro-texto"/);
  assert.match(html, /function puxarSessoesDocumento\(/);
  assert.match(html, /function duplicarDocumentoAtual\(/);
  assert.match(html, /function visualizarPSMPDF\(/);
  assert.match(api, /b\.action==='reschedule_appointment'/);
  assert.match(api, /b\.action==='delete_appointment'/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS telefone text/);
});

test('Dashboard simplificado exibe 3 KPIs principais e accordion abaixo da tabela', async () => {
  const html = await read('index.html');
  const dash = html.match(/id="page-dashboard"[\s\S]*?<!-- \/page-dashboard -->/)[0];
  const idxTabela = dash.indexOf('id="dsess-table"');
  const idxAccordion = dash.indexOf('id="dash-more-analytics"');
  assert.ok(idxTabela > 0 && idxAccordion > idxTabela);
  assert.match(dash, /class="kpi-row"[\s\S]*?id="kpi-fat"[\s\S]*?id="kpi-pac"[\s\S]*?id="kpi-falta"/);
  assert.doesNotMatch(dash.slice(0, idxTabela), /id="kpi-tkt"|id="kpi-ret"/);
  assert.match(dash.slice(idxAccordion), /id="kpi-tkt"[\s\S]*?id="kpi-ret"/);
});
