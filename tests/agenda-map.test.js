import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function render(rules,wellz={}){
  const elements={'agenda-map':{style:{},innerHTML:''},'agenda-map-nota':{textContent:''}};
  const ctx=vm.createContext({document:{getElementById:id=>elements[id]},
    hojeSemHora:()=>new Date(2026,9,21),MAPA_AGENDA_JANELA_DIAS:90,DIA_MS:86400000,
    nomesPacientesAtivosNoCadastro:()=>new Set(['Ana']),_regrasAgendaSlots:rules,
    _rows:[{_paciente:'Ana',_data:new Date(2026,9,19),_comparecimento:'Sim',_horario:'Seg 09:00'}],
    horaDoHorario:()=>9,WELLZ_HORARIOS_FIXOS:wellz,LIMITE_ATENDIMENTOS_DIA:7,
    iniciais:s=>s,escHtml:s=>s.replaceAll('<','&lt;'),vazioHtml:s=>s});
  const start=html.indexOf('function renderMapaAgenda(){');
  vm.runInContext(html.slice(start,html.indexOf('\n// ── Pacientes por gênero',start)),ctx);
  ctx.renderMapaAgenda();
  return elements;
}
const rule=(nome,frequencia)=>({dia:1,hora:9,nome,frequencia});
test('quinzenal sozinho ganha cor, texto e explicação de vaga alternada',()=>{
  const el=render([rule('Ana','quinzenal')]);
  assert.match(el['agenda-map'].innerHTML,/class="hc ho hq"/);
  assert.match(el['agenda-map'].innerHTML,/Ana · 15d \+ vaga/);
  assert.match(el['agenda-map'].innerHTML,/vaga para revezar na semana alternada/);
  assert.doesNotMatch(html,/id="agenda-map-nota"/);
});
test('semanal e dois quinzenais no mesmo horário não indicam vaga',()=>{
  for(const rules of [[rule('Ana','semanal')],[rule('Ana','quinzenal'),rule('Bia','quinzenal')]]){
    const result=render(rules)['agenda-map'].innerHTML;
    assert.doesNotMatch(result,/hc ho hq|15d \+ vaga/);
    assert.match(result,/class="hc ho"/);
  }
});
test('Wellz prevalece e histórico sem recorrência não sugere vaga',()=>{
  const wellz=render([rule('Ana','quinzenal')],{1:[9]})['agenda-map'].innerHTML;
  assert.match(wellz,/class="hc hw"/);
  assert.doesNotMatch(wellz,/hc ho hq/);
  assert.doesNotMatch(render(null)['agenda-map'].innerHTML,/hc ho hq/);
});
test('legenda descreve ocupação e não níveis de faltas',()=>{
  const legend=html.slice(html.indexOf('<h3>Mapa da agenda'),html.indexOf('id="agenda-map"'));
  assert.match(legend,/Livre/);
  assert.match(legend,/Ocupado/);
  assert.match(legend,/Quinzenal · vaga para revezar/);
  assert.doesNotMatch(legend,/Sem faltas|Poucas|Média|Alta/);
});

test('total conta sete horários mesmo com oito pacientes e deduplica Wellz',()=>{
  const rules=[9,10,13,14,16,17,18].map(hora=>({...rule('Ana','semanal'),dia:3,hora}));
  rules.push({...rule('Bia','quinzenal'),dia:3,hora:16});
  const result=render(rules,{3:[17,18]})['agenda-map'].innerHTML;
  assert.match(result,/title="7 horários ocupados \/ limite de 7">7\/7/);
  assert.doesNotMatch(result,/>8\/7|>10\/7/);
});
