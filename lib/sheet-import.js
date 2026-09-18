// Imports the operational spreadsheet (patients/sessions/insurance/packages)
// into Supabase. Shared by scripts/import-sheet.mjs (manual/local dry-run)
// and api/import-sheet.js (scheduled, always applies).
import {createHash} from 'node:crypto';

const ORIGIN = 'google-sheet-gid-0';

function parseCsv(text) {
  const records=[]; let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){
    const char=text[i],next=text[i+1];
    if(char==='"'&&quoted&&next==='"'){field+='"';i++;}
    else if(char==='"')quoted=!quoted;
    else if(char===','&&!quoted){row.push(field);field='';}
    else if((char==='\n'||char==='\r')&&!quoted){if(char==='\r'&&next==='\n')i++;row.push(field);records.push(row);row=[];field='';}
    else field+=char;
  }
  if(field||row.length){row.push(field);records.push(row);}
  const headers=records.shift().map(x=>x.trim());
  return records.filter(r=>r.some(Boolean)).map(cols=>Object.fromEntries(headers.map((h,i)=>[h,(cols[i]||'').trim()])));
}

const normalize=value=>String(value||'').normalize('NFD').replace(/[̀-ͯ]/g,'').trim().replace(/\s+/g,' ').toLowerCase();
const money=value=>Number(String(value||'').replace(/R\$\s*/g,'').replace(/\./g,'').replace(',','.'))||0;
const number=value=>Number(String(value||'').replace(',','.'))||0;
function isoDate(value){const match=String(value||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return match?`${match[3]}-${match[2]}-${match[1]}`:null;}
const hash=value=>createHash('sha256').update(value).digest('hex');

async function rest(supabaseUrl, supabaseKey, path, options={}) {
  const response=await fetch(`${supabaseUrl}/rest/v1/${path}`,{...options,headers:{apikey:supabaseKey,Authorization:`Bearer ${supabaseKey}`,'Content-Type':'application/json',Prefer:'return=representation',...(options.headers||{})}});
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(`${response.status} ${JSON.stringify(data)}`);
  return data;
}

async function batches(supabaseUrl, supabaseKey, path, rows, size=200) {
  const output=[];
  for(let i=0;i<rows.length;i+=size)output.push(...await rest(supabaseUrl,supabaseKey,path,{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(rows.slice(i,i+size))}));
  return output;
}

export async function fetchSheetSummary(sheetUrl) {
  const response=await fetch(sheetUrl);
  if(!response.ok)throw new Error(`Planilha indisponível: ${response.status}`);
  const source=parseCsv(await response.text()).filter(row=>isoDate(row.Data)&&row.Paciente);
  const occurrence=new Map();
  const prepared=source.map(row=>{
    const patientKey=normalize(row.Paciente),date=isoDate(row.Data),base=`${patientKey}|${date}`;
    const ordinal=(occurrence.get(base)||0)+1;occurrence.set(base,ordinal);
    return {row,patientKey,date,sourceKey:hash(`${base}|${ordinal}`)};
  });
  const summary={sourceRows:prepared.length,patients:new Set(prepared.map(x=>x.patientKey)).size,insurances:new Set(prepared.map(x=>normalize(x.row['Convênio'])).filter(Boolean)).size,packages:prepared.filter(x=>number(x.row['Sessões cobradas'])>0).length};
  return {prepared,summary};
}

export async function applySheetImport({supabaseUrl, supabaseKey, sheetUrl}) {
  const {prepared,summary}=await fetchSheetSummary(sheetUrl);
  const R=(path,options)=>rest(supabaseUrl,supabaseKey,path,options);
  const B=(path,rows)=>batches(supabaseUrl,supabaseKey,path,rows);

  const [run]=await R('importacoes',{method:'POST',body:JSON.stringify({origem:ORIGIN,status:'running'})});
  try{
    const existingPatients=await R('pacientes?select=id,nome');
    const existingMappings=await R(`pacientes_origem?select=chave_origem,paciente_id&origem=eq.${ORIGIN}`);
    const patientByNormalized=new Map(existingPatients.map(p=>[normalize(p.nome),p]));
    const mapping=new Map(existingMappings.map(m=>[m.chave_origem,m.paciente_id]));
    const patientPayload=[];
    for(const item of prepared){
      if(mapping.has(item.patientKey)||patientByNormalized.has(item.patientKey))continue;
      patientPayload.push({nome:item.row.Paciente.trim(),ativo:false,ultima_chave:item.row.Paciente.trim(),ultimo_label:item.row.Paciente.trim()});
      patientByNormalized.set(item.patientKey,{pending:true});
    }
    if(patientPayload.length){
      const created=await B('pacientes?on_conflict=nome',patientPayload);
      created.forEach(p=>patientByNormalized.set(normalize(p.nome),p));
    }
    // O cadastro (tabela pacientes, editado na Agenda) é a única verdade sobre
    // o paciente: esta importação NÃO escreve em pacientes que já existem --
    // nem nome/rótulos (sobrescrevia o nome completo com o abreviado da
    // planilha, todo dia), nem "ativo"/status (a planilha não sabe de
    // pausas/inativações feitas no cadastro). Só cria pacientes realmente
    // novos (acima) e vincula cada linha da planilha ao paciente certo.
    // Cuidado ao reintroduzir um upsert aqui: nome é NOT NULL, então um
    // upsert parcial (só id/ativo) falha inteiro e derruba a importação.
    for(const item of prepared){
      const id=mapping.get(item.patientKey)||patientByNormalized.get(item.patientKey)?.id;
      if(!id)throw new Error('Paciente sem correspondência após upsert');
      mapping.set(item.patientKey,id);
    }
    await B('pacientes_origem?on_conflict=origem,chave_origem',[...mapping].map(([key,id])=>({origem:ORIGIN,chave_origem:key,paciente_id:id})));

    const insuranceNames=new Map();
    prepared.forEach(x=>{const key=normalize(x.row['Convênio']);if(key&&!insuranceNames.has(key))insuranceNames.set(key,x.row['Convênio'].trim());});
    const insurances=insuranceNames.size?await B('convenios?on_conflict=nome_normalizado',[...insuranceNames].map(([nome_normalizado,nome])=>({nome,nome_normalizado}))):[];
    const insuranceByKey=new Map(insurances.map(x=>[x.nome_normalizado,x.id]));

    const packages=prepared.filter(x=>number(x.row['Sessões cobradas'])>0).map(x=>({paciente_id:mapping.get(x.patientKey),source_key:x.sourceKey,quantidade:number(x.row['Sessões cobradas']),valor_unitario:money(x.row['Valor da sessão']),data_compra:x.date,last_seen_import_id:run.id,atualizado_em:new Date().toISOString()}));
    const savedPackages=packages.length?await B('pacotes?on_conflict=source_key',packages):[];
    const packageByKey=new Map(savedPackages.map(x=>[x.source_key,x.id]));
    const sessions=prepared.map(x=>{
      const attendance=x.row.Comparecimento.trim(),reason=x.row.Motivo.trim();
      const consumed=(attendance==='Sim'||reason==='Sem justificativa - Cobrado')?1:0;
      return {paciente_id:mapping.get(x.patientKey),convenio_id:insuranceByKey.get(normalize(x.row['Convênio']))||null,pacote_id:packageByKey.get(x.sourceKey)||null,source_key:x.sourceKey,data_sessao:x.date,genero:x.row['Gênero']||null,faixa_etaria:x.row['Faixa Etária']||null,modalidade:x.row.Modalidade||null,horario:x.row['Horário']||null,ativo_na_origem:x.row.Ativo==='Ativo',comparecimento:attendance||null,motivo:reason||null,valor_sessao:money(x.row['Valor da sessão']),sessoes_cobradas:number(x.row['Sessões cobradas']),sessao_consumida:consumed,valor_total:money(x.row['Valor total'])||number(x.row['Sessões cobradas'])*money(x.row['Valor da sessão']),valor_final:money(x.row['Valor final']),cnpj:normalize(x.row['CNPJ?'])==='sim',last_seen_import_id:run.id,atualizado_em:new Date().toISOString()};
    });
    await B('sessoes?on_conflict=source_key',sessions);
    const staleSessions=await R(`sessoes?select=id&last_seen_import_id=neq.${run.id}`);
    const stalePackages=await R(`pacotes?select=id&last_seen_import_id=neq.${run.id}`);
    const counts={...summary,staleSessions:staleSessions.length,stalePackages:stalePackages.length};
    await R(`importacoes?id=eq.${run.id}`,{method:'PATCH',body:JSON.stringify({status:'completed',contagens:counts,divergencias:[],concluido_em:new Date().toISOString()})});
    return {...counts,mode:'applied'};
  }catch(error){
    await R(`importacoes?id=eq.${run.id}`,{method:'PATCH',body:JSON.stringify({status:'failed',divergencias:[{reason:'import_failed'}],concluido_em:new Date().toISOString()})}).catch(()=>{});
    throw error;
  }
}
