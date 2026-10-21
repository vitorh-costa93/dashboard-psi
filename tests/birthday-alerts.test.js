import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const context=vm.createContext({});
for(const name of ['iniciais','pacienteAtivo','aniversariantesDaSemana']){
  const start=html.indexOf('function '+name+'(');
  const end=html.indexOf('\n}',start);
  const source=name==='aniversariantesDaSemana'?html.slice(start,end+2):html.slice(start,html.indexOf('\n',start));
  vm.runInContext(source,context);
}
const patient=(id,date,extra={})=>({id,nome:'Paciente '+id,ativo:true,status_operacional:'ativo',data_nascimento:date,...extra});
const birthdays=(patients,start,end)=>context.aniversariantesDaSemana(patients,new Date(start+'T00:00:00'),new Date(end+'T00:00:00'));

test('inclui segunda e domingo, ordena e independe de sessões ou pacotes',()=>{
  const result=birthdays({a:patient('a','1990-10-25'),b:patient('b','2000-10-19'),c:patient('c','1998-10-26')},'2026-10-19','2026-10-25');
  assert.deepEqual(Array.from(result,p=>p.id),['b','a']);
});
test('usa cadastro ativo e ignora datas ausentes, inválidas e Wellz',()=>{
  const result=birthdays({a:patient('a',null),b:patient('b','2000-10-20',{ativo:false}),c:patient('c','2000-10-20',{status_operacional:'pausado'}),d:patient('d','2000-10-20',{nome:'Wellz'}),e:patient('e','2000-02-31')},'2026-10-19','2026-10-25');
  assert.equal(result.length,0);
});
test('inclui aniversários dos dois anos na semana da virada',()=>{
  const result=birthdays({a:patient('a','2000-01-01'),b:patient('b','1990-12-31')},'2026-12-28','2027-01-03');
  assert.deepEqual(Array.from(result,p=>p.id),['b','a']);
  assert.equal(result[1].data.getFullYear(),2027);
});
test('29 de fevereiro só aparece quando a data existe no ano',()=>{
  const patients={a:patient('a','2000-02-29')};
  assert.equal(birthdays(patients,'2027-02-22','2027-02-28').length,0);
  assert.equal(birthdays(patients,'2028-02-28','2028-03-05').length,1);
});

test('renderiza aniversariante sem histórico financeiro e atualiza resumo',async()=>{
  const elements=Object.fromEntries(['alerts-content','ar-dev','ar-ren','ar-ani','ar-pro'].map(id=>[id,{innerHTML:'',textContent:''}]));
  const today=new Date(),start=new Date(today);
  start.setDate(today.getDate()+(today.getDay()===0?-6:1-today.getDay()));
  const birth='2000-'+String(start.getMonth()+1).padStart(2,'0')+'-'+String(start.getDate()).padStart(2,'0');
  Object.assign(context,{
    document:{getElementById:id=>elements[id]},
    _pacientesById:{a:patient('a',birth,{nome:'Ana <teste>'})},_rows:[],
    buscarAgendaSemana:async()=>({datasEstaSemana:new Map(),migrados:new Set()}),
    nomesPacientesAtivosNoCadastro:()=>new Set(),
    escHtml:s=>s.replaceAll('<','&lt;').replaceAll('>','&gt;'),
    definirAlertasAberto:()=>{},localStorage:{getItem:()=>null}
  });
  const from=html.indexOf('async function calcularAlertas()');
  vm.runInContext(html.slice(from,html.indexOf('\nfunction definirAlertasAberto',from)),context);
  await context.calcularAlertas();
  assert.match(elements['alerts-content'].innerHTML,/Aniversariantes da semana/);
  assert.match(elements['alerts-content'].innerHTML,/Ana &lt;teste&gt;/);
  assert.match(elements['ar-ani'].innerHTML,/1 aniversariante/);
  assert.doesNotMatch(elements['ar-dev'].innerHTML,/nada pendente/);
  context._pacientesById={};
  await context.calcularAlertas();
  assert.match(elements['alerts-content'].innerHTML,/Nenhum aniversariante nesta semana/);
  assert.equal(elements['ar-ani'].innerHTML,'');
});
