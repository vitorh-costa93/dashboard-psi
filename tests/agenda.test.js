import test from'node:test';import assert from'node:assert/strict';import{buildOccurrences,inferRule,marcarSessoesPagas,monthBounds,normalizeMonth}from'../lib/agenda.js';
test('valida mês e limites',()=>{assert.equal(normalizeMonth('2026-09'),'2026-09');assert.deepEqual(monthBounds('2026-02'),{month:'2026-02',first:'2026-02-01',last:'2026-02-28'});assert.throws(()=>normalizeMonth('2026-13'));});
test('gera semanal na vigência',()=>assert.deepEqual(buildOccurrences({frequencia:'semanal',dia_semana:3,vigencia_inicio:'2026-09-07'},'2026-09'),['2026-09-09','2026-09-16','2026-09-23','2026-09-30']));
test('quinzenal usa âncora',()=>assert.deepEqual(buildOccurrences({frequencia:'quinzenal',dia_semana:3,vigencia_inicio:'2026-09-02'},'2026-09'),['2026-09-02','2026-09-16','2026-09-30']));
test('linha extra não muda padrão quinzenal histórico',()=>{const rows=['2026-07-08','2026-07-22','2026-08-05','2026-08-19','2026-09-02','2026-09-16','2026-09-23','2026-09-30'].map(data_sessao=>({data_sessao,horario:'17:00'}));const rule=inferRule(rows);assert.equal(rule.frequencia,'quinzenal');assert.equal(rule.vigencia_inicio,'2026-07-08');});
// Bug real: em um mês em que a 1ª ocorrência do dia da semana dentro do mês
// cai por acaso na semana "de folga" (7 dias fora do ciclo de 14 a partir da
// vigência), o mês inteiro ficava sem nenhuma data -- corrigido alinhando a
// 1ª ocorrência ao ciclo antes de somar o passo de 14 dias.
test('quinzenal continua o ciclo em meses seguintes, mesmo fora do mês de início',()=>{
  const rule={frequencia:'quinzenal',dia_semana:4,vigencia_inicio:'2026-09-10'};
  assert.deepEqual(buildOccurrences(rule,'2026-09'),['2026-09-10','2026-09-24']);
  assert.deepEqual(buildOccurrences(rule,'2026-10'),['2026-10-08','2026-10-22']);
});
// Troca de semanal p/ quinzenal a partir de 17/09 (caso Yasmin Garcia):
// a semana de 24/09 é de folga e não deve ter ocorrência.
test('quinzenal a partir de 17/09 pula a semana de folga',()=>{
  const rule={frequencia:'quinzenal',dia_semana:4,vigencia_inicio:'2026-09-17'};
  assert.deepEqual(buildOccurrences(rule,'2026-09'),['2026-09-17']);
  assert.deepEqual(buildOccurrences(rule,'2026-10'),['2026-10-01','2026-10-15','2026-10-29']);
});
test('vigência em dia diferente do dia da regra mantém o dia da semana (Aline)',()=>{
  const rule={frequencia:'quinzenal',dia_semana:2,vigencia_inicio:'2026-09-17'};
  const dias=buildOccurrences(rule,'2026-10').map(d=>new Date(d+'T12:00:00Z').getUTCDay());
  assert.ok(dias.length&&dias.every(d=>d===2));
});
test('marcarSessoesPagas cobre sessão anterior com pagamento em bloco posterior e ignora faltas',()=>{
  const hist=[
    {id:'s1',paciente_id:'p1',data_sessao:'2026-04-17',horario:'09:30',comparecimento:'Sim',sessoes_cobradas:0},
    {id:'s2',paciente_id:'p1',data_sessao:'2026-04-24',horario:'09:30',comparecimento:'Sim',sessoes_cobradas:2},
    {id:'s3',paciente_id:'p1',data_sessao:'2026-05-08',horario:'09:30',comparecimento:'Não',sessoes_cobradas:0},
    {id:'s4',paciente_id:'p1',data_sessao:'2026-05-15',horario:'09:30',comparecimento:'Sim',sessoes_cobradas:0}
  ];
  const res=marcarSessoesPagas(hist);
  assert.deepEqual(res.map(x=>x.paga),[true,true,null,false]);
  // Filtrando só o mês de abril, s1 continua paga pelo pagamento de s2
  // e filtrando só maio, s4 continua em aberto mesmo sem s1/s2 na lista filtrada.
  const soMaio=marcarSessoesPagas(hist.slice(2),hist);
  assert.deepEqual(soMaio.map(x=>x.paga),[null,false]);
});
