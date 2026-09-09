const FREQUENCIES=new Set(['semanal','quinzenal']);
export function normalizeTime(value){const m=String(value||'').match(/(\d{1,2})(?:h|:)(\d{2})?/i);return m?String(Number(m[1])).padStart(2,'0')+':'+(m[2]||'00'):'00:00';}
export function normalizeMonth(value){if(!/^\d{4}-\d{2}$/.test(String(value||'')))throw new Error('Mês inválido');const [y,m]=String(value).split('-').map(Number);if(m<1||m>12)throw new Error('Mês inválido');return `${y}-${String(m).padStart(2,'0')}`;}
export function monthBounds(value){const month=normalizeMonth(value),[y,m]=month.split('-').map(Number),last=new Date(Date.UTC(y,m,0)).getUTCDate();return{month,first:`${month}-01`,last:`${month}-${String(last).padStart(2,'0')}`};}
export function isoAddDays(value,days){const d=new Date(`${value}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
export function buildOccurrences(rule,month){
  if(!FREQUENCIES.has(rule.frequencia))return[];
  const{first,last}=monthBounds(month),weekday=Number(rule.dia_semana);
  if(!Number.isInteger(weekday)||weekday<1||weekday>7)return[];
  const start=rule.vigencia_inicio>first?rule.vigencia_inicio:first,end=rule.vigencia_fim&&rule.vigencia_fim<last?rule.vigencia_fim:last;
  if(start>end)return[];
  const d=new Date(`${start}T12:00:00Z`),current=d.getUTCDay()||7;
  d.setUTCDate(d.getUTCDate()+((weekday-current+7)%7));
  const anchor=new Date(`${rule.vigencia_inicio}T12:00:00Z`);
  // Quinzenal: alinhar `d` (1ª ocorrência do dia da semana dentro do mês) ao
  // ciclo de 14 dias ANTES de começar a somar `step` -- sem isso, num mês em
  // que essa 1ª ocorrência cai por acaso na semana "de folga" (7 dias fora
  // do ciclo), somar 14 repetidamente nunca alcança uma semana "cheia" e o
  // mês inteiro fica sem nenhuma data (bug real: sumia um paciente
  // quinzenal inteiro em meses que não fossem o mês de início da vigência).
  if(rule.frequencia==='quinzenal'){
    const rem=((Math.round((d-anchor)/86400000)%14)+14)%14;
    if(rem!==0)d.setUTCDate(d.getUTCDate()+(14-rem));
  }
  const step=rule.frequencia==='quinzenal'?14:7,out=[];
  while(d.toISOString().slice(0,10)<=end){
    const date=d.toISOString().slice(0,10),distance=Math.round((d-anchor)/86400000);
    if(rule.frequencia==='semanal'||distance>=0&&distance%14===0)out.push(date);
    d.setUTCDate(d.getUTCDate()+step);
  }
  return out;
}
export function inferRule(rows){const clean=(rows||[]).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.data_sessao)).sort((a,b)=>a.data_sessao.localeCompare(b.data_sessao));if(clean.length<2)return null;const days=new Map(),times=new Map();clean.forEach(r=>{const day=new Date(`${r.data_sessao}T12:00:00Z`).getUTCDay()||7;days.set(day,(days.get(day)||0)+1);const time=normalizeTime(r.horario);times.set(time,(times.get(time)||0)+1);});const mode=map=>[...map].sort((a,b)=>b[1]-a[1])[0]?.[0],weekday=Number(mode(days)),same=clean.filter(r=>(new Date(`${r.data_sessao}T12:00:00Z`).getUTCDay()||7)===weekday),diffs=[];for(let i=1;i<same.length;i++)diffs.push(Math.round((new Date(same[i].data_sessao)-new Date(same[i-1].data_sessao))/86400000));const recent=diffs.slice(-8),weekly=recent.filter(x=>x>=6&&x<=8).length,fortnightly=recent.filter(x=>x>=12&&x<=16).length;if(!weekly&&!fortnightly)return null;return{frequencia:fortnightly>=weekly?'quinzenal':'semanal',dia_semana:weekday,horario:String(mode(times)||same.at(-1)?.horario||'').slice(0,5),vigencia_inicio:same[0].data_sessao,confianca:Math.max(weekly,fortnightly)/Math.max(1,recent.length)};}
