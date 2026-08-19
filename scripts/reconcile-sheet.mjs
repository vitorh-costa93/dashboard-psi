const SUPABASE_URL=process.env.SUPABASE_URL;
const SUPABASE_KEY=process.env.SUPABASE_SERVICE_KEY;
const SHEET_URL=process.env.SHEET_CSV_URL||'https://docs.google.com/spreadsheets/d/1rxeRgbqkaX6usYd8iSJYkNSqIlAeyJnDNxrIJJ7mPsI/gviz/tq?tqx=out:csv&gid=0';
if(!SUPABASE_URL||!SUPABASE_KEY)throw new Error('SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórias');

function parseCsv(text){const records=[];let row=[],field='',quoted=false;for(let i=0;i<text.length;i++){const char=text[i],next=text[i+1];if(char==='"'&&quoted&&next==='"'){field+='"';i++;}else if(char==='"')quoted=!quoted;else if(char===','&&!quoted){row.push(field);field='';}else if((char==='\n'||char==='\r')&&!quoted){if(char==='\r'&&next==='\n')i++;row.push(field);records.push(row);row=[];field='';}else field+=char;}if(field||row.length){row.push(field);records.push(row);}const headers=records.shift().map(x=>x.trim());return records.filter(r=>r.some(Boolean)).map(cols=>Object.fromEntries(headers.map((h,i)=>[h,(cols[i]||'').trim()])));}
const money=value=>Number(String(value||'').replace(/R\$\s*/g,'').replace(/\./g,'').replace(',','.'))||0;
const number=value=>Number(String(value||'').replace(',','.'))||0;
const round=value=>Math.round(value*100)/100;

async function all(table,select){const rows=[];for(let from=0;;from+=1000){const response=await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${select}`,{headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,Range:`${from}-${from+999}`}});if(!response.ok)throw new Error(`${table}: ${response.status}`);const page=await response.json();rows.push(...page);if(page.length<1000)break;}return rows;}

const sheet=parseCsv(await (await fetch(SHEET_URL)).text()).filter(x=>x.Data&&x.Paciente);
const [sessions,patients,packages,insurances]=await Promise.all([all('sessoes','sessoes_cobradas,sessao_consumida,valor_total,valor_final'),all('pacientes_origem','paciente_id'),all('pacotes','id'),all('convenios','id')]);
const source={sessions:sheet.length,patients:new Set(sheet.map(x=>x.Paciente.trim().toLowerCase())).size,packages:sheet.filter(x=>number(x['Sessões cobradas'])>0).length,insurances:new Set(sheet.map(x=>x['Convênio'].trim().toLowerCase()).filter(Boolean)).size,charged:round(sheet.reduce((sum,x)=>sum+number(x['Sessões cobradas']),0)),consumed:sheet.reduce((sum,x)=>sum+((x.Comparecimento==='Sim'||x.Motivo==='Sem justificativa - Cobrado')?1:0),0),total:round(sheet.reduce((sum,x)=>sum+(money(x['Valor total'])||number(x['Sessões cobradas'])*money(x['Valor da sessão'])),0)),final:round(sheet.reduce((sum,x)=>sum+money(x['Valor final']),0))};
const database={sessions:sessions.length,patients:new Set(patients.map(x=>x.paciente_id)).size,packages:packages.length,insurances:insurances.length,charged:round(sessions.reduce((sum,x)=>sum+Number(x.sessoes_cobradas),0)),consumed:round(sessions.reduce((sum,x)=>sum+Number(x.sessao_consumida),0)),total:round(sessions.reduce((sum,x)=>sum+Number(x.valor_total),0)),final:round(sessions.reduce((sum,x)=>sum+Number(x.valor_final),0))};
const differences=Object.fromEntries(Object.keys(source).map(key=>[key,round(database[key]-source[key])]).filter(([,value])=>value!==0));
console.log(JSON.stringify({source,database,differences,ok:Object.keys(differences).length===0}));
if(Object.keys(differences).length)process.exitCode=1;

