import test from 'node:test';
import assert from 'node:assert/strict';
import {TARIFAS, ehSexta, linhasDashboard, linhasDetalhadas, quantidade, sextasDoMes, valorSemana} from '../lib/wellz.js';

test('valor da semana soma quantidade x tarifa de cada tipo', () => {
  assert.equal(valorSemana({faltas: 2, acolh_antes: 1, acolh_apos: 1, real_antes: 3, real_apos: 2}), 2 * 10 + 25 + 35 + 3 * 50 + 2 * 60);
  assert.equal(valorSemana({}), 0);
});

test('sextas do mes respeitam o inicio do lancamento semanal', () => {
  assert.deepEqual(sextasDoMes('2026-09', '2026-09-01'), ['2026-09-04', '2026-09-11', '2026-09-18', '2026-09-25']);
  assert.deepEqual(sextasDoMes('2026-08', '2026-09-01'), []);
  assert.equal(ehSexta('2026-09-25'), true);
  assert.equal(ehSexta('2026-09-24'), false);
});

test('quantidade rejeita negativos e decimais', () => {
  assert.equal(quantidade('3'), 3);
  assert.throws(() => quantidade(-1));
  assert.throws(() => quantidade(1.5));
});

test('linhas do dashboard: faltas viram "Não", realizados "Sim" e o valor bate', () => {
  const rows = linhasDashboard([{semana_ref: '2026-09-25', faltas: 2, acolh_antes: 0, acolh_apos: 1, real_antes: 1, real_apos: 0}], []);
  assert.equal(rows.length, 4);
  assert.equal(rows.filter(r => r['Comparecimento'] === 'Não').length, 2);
  assert.equal(rows.reduce((s, r) => s + r['Sessões cobradas'] * r['Valor da sessão'], 0), 2 * TARIFAS.faltas + TARIFAS.acolh_apos + TARIFAS.real_antes);
  assert.ok(rows.every(r => r['Paciente'] === 'Wellz' && r['Wellz'] && r['CNPJ?'] === 'Sim'));
});

test('historico mensal soma exatamente o valor e nao conta sessao nem falta', () => {
  const rows = linhasDashboard([], [{mes: '2025-11-01', valor: 1120}, {mes: '2026-08-01', valor: 1335}]);
  const soma = mes => rows.filter(r => r['Data'].slice(3) === mes).reduce((s, r) => s + r['Valor histórico'], 0);
  assert.equal(Math.round(soma('11/2025') * 100), 112000);
  assert.equal(Math.round(soma('08/2026') * 100), 133500);
  assert.ok(rows.every(r => r['Só valor'] && r['Sessões cobradas'] === 0 && r['Comparecimento'] === ''));
});

test('detalhado: uma linha por semana (sessoes sem faltas), filtro por mes e historico', () => {
  const semanas = [{semana_ref: '2026-09-25', faltas: 1, acolh_antes: 1, acolh_apos: 0, real_antes: 2, real_apos: 3}];
  const hist = [{mes: '2026-08-01', valor: 1335}];
  const set = linhasDetalhadas(semanas, hist, 'id-wellz', {month: '2026-09'});
  assert.equal(set.length, 1);
  assert.equal(set[0].sessoes_cobradas, 6);
  assert.equal(set[0].valor_final, 10 + 25 + 2 * 50 + 3 * 60);
  assert.ok(set[0].wellz && set[0].pacientes.nome === 'Wellz');
  const ago = linhasDetalhadas(semanas, hist, 'id-wellz', {month: '2026-08'});
  assert.equal(ago.length, 1);
  assert.equal(ago[0].valor_final, 1335);
});
