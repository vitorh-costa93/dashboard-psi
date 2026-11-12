import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const helper=html.match(/function horarioPerfilPaciente\(nome,fallback=''\)\{[\s\S]*?\n\}/)[0];
test('identificação usa Ter 18h do perfil mesmo após sessão avulsa Qui 11h',()=>{
  const context=vm.createContext({_pacientesById:{a:{id:'a',nome:'Paciente Teste',ultimo_label:'Paciente Teste | Ter 18h'}}});
  vm.runInContext(helper,context);
  assert.equal(context.horarioPerfilPaciente('Paciente Teste','Qui 11h'),'Ter 18h');
  assert.equal(context.horarioPerfilPaciente('Sem cadastro','Qui 11h'),'Qui 11h');
  context._pacientesById.a.ultimo_label='Paciente Teste';
  assert.equal(context.horarioPerfilPaciente('Paciente Teste','Qui 11h'),'');
});
