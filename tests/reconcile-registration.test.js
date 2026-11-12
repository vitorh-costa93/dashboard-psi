import test from 'node:test';
import assert from 'node:assert/strict';
import {profilePatch,reconcile} from '../scripts/reconcile-approved-registration.mjs';

test('recuperação cadastral normaliza campos e preserva informações ausentes',()=>{
  assert.deepEqual(profilePatch({nome_completo:' Paciente Teste ',cpf:'123.456.789-01',responsavel_nome:''}),{nome:'Paciente Teste',cpf_paciente:'12345678901'});
  assert.throws(()=>profilePatch({cpf:'123'}));
  assert.throws(()=>profilePatch({data_nascimento:'2000-02-31'}));
});

test('recuperação exige aprovação e verifica o perfil salvo sem expor conteúdo',async()=>{
  process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_KEY='sb_secret_test';process.env.CLINICAL_DATA_KEY=Buffer.alloc(32).toString('base64');
  const original=global.fetch;let writes=0,status='approved';
  global.fetch=async(url,options)=>{
    let data;
    if(url.includes('formularios_respostas?'))data=[{status,conteudo:{nome_completo:'Paciente Teste',cpf:'123.456.789-01'},formularios_convites:{paciente_id:'patient',formularios_modelos:{destino:'cadastro'}}}];
    else if(options.method==='PATCH'){writes++;assert.match(url,/atualizado_em=eq\./);data=[{id:'patient'}];}
    else if(url.includes('select=id,atualizado_em'))data=[{id:'patient',atualizado_em:'2026-11-12T10:00:00Z'}];
    else data=[{nome:'Paciente Teste',cpf_paciente:'12345678901'}];
    return {ok:true,json:async()=>data};
  };
  try{
    const id='11111111-1111-4111-8111-111111111111';
    await reconcile(id);assert.equal(writes,0);
    const result=await reconcile(id,true);assert.equal(writes,1);assert.equal(result.verificado,true);assert.ok(!JSON.stringify(result).includes('12345678901'));
    status='pending_review';await assert.rejects(reconcile(id,true));assert.equal(writes,1);
  }finally{global.fetch=original;}
});
