


const SHEET_ID="1rxeRgbqkaX6usYd8iSJYkNSqIlAeyJnDNxrIJJ7mPsI",GID="0";
const COLORS=['#8b9e6e','#7a9fb5','#c4a882','#c97b6e','#a89bbf','#7fb3a8','#d4a5a5','#b5c9a1'];
Chart.defaults.font.family="'Source Sans 3',sans-serif";
Chart.defaults.color='#888';
let charts={},_rows=[],_ativosArr=[];
let _pacientesMap = {}; // nome -> {id, nome, ativo, ultima_chave, ultimo_label}


function dC(id){if(charts[id]){charts[id].destroy();delete charts[id];}}

function parseCSV(text){
  const lines=text.trim().split('\n');
  const headers=lines[0].split(',').map(h=>h.replace(/^"|"$/g,'').trim());
  return lines.slice(1).map(line=>{
    const cols=[];let cur='',inQ=false;
    for(let c of line){if(c==='"'){inQ=!inQ;}else if(c===','&&!inQ){cols.push(cur);cur='';}else cur+=c;}
    cols.push(cur);
    const obj={};headers.forEach((h,i)=>{obj[h]=(cols[i]||'').replace(/^"|"$/g,'').trim();});
    return obj;
  });
}

function pVal(v){if(!v)return 0;return parseFloat(String(v).replace(/R\$\s*/g,'').replace(/\./g,'').replace(',','.').trim())||0;}
function pData(v){if(!v)return null;const p=String(v).split('/');if(p.length===3)return new Date(+p[2],+p[1]-1,+p[0]);return null;}
function anoMes(d){if(!d||isNaN(d))return'';return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}
function mesLabel(ym){if(!ym)return'';const[y,m]=ym.split('-');const n=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];return n[+m-1]+'.';}
function iniciais(nome){return String(nome).split(' ').filter(Boolean).map(p=>p[0]).join('');}
function countBy(arr,fn){const m={};arr.forEach(r=>{const v=fn(r);if(v)m[v]=(m[v]||0)+1;});return m;}

function setComp(id,atual,ant,suffix){
  const el=document.getElementById(id);
  if(ant===null||ant===undefined){el.textContent='—';el.className='kpi-comp neu';return;}
  if(ant===0&&atual===0){el.textContent='—';el.className='kpi-comp neu';return;}
  if(ant===0){el.textContent='▲ +100% '+suffix;el.className='kpi-comp up';return;}
  const pct=((atual-ant)/Math.abs(ant)*100).toFixed(1);
  const up=atual>=ant;
  el.textContent=(up?'▲ +':'▼ ')+pct+'% '+suffix;
  el.className='kpi-comp '+(up?'up':'dn');
}

// Diferença absoluta em pontos percentuais (para KPIs que já são %)
// Lógica invertida: diminuir é bom (verde), aumentar é ruim (vermelho)
function setCompPP(id,atual,ant,suffix){
  const el=document.getElementById(id);
  if(ant===null||ant===undefined){el.textContent='—';el.className='kpi-comp neu';return;}
  const diff=(atual-ant).toFixed(1);
  const subiu=atual>ant;
  el.textContent=(subiu?'▲ +':'▼ ')+diff+'% '+suffix;
  el.className='kpi-comp '+(subiu?'dn':'up');
}

async function loadData(){
  document.getElementById('loading').style.display='flex';
  document.getElementById('dashboard').style.display='none';
  document.getElementById('error-msg').style.display='none';
  try{
    const url=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${GID}`;
    const res=await fetch(url);if(!res.ok)throw new Error('HTTP '+res.status);
    const text=await res.text();
    const raw=parseCSV(text).filter(r=>r['Data']&&r['Data'].trim());
    raw.forEach(r=>{
      r._data           =pData(r['Data']);
      r._anoMes         =anoMes(r._data);
      r._paciente       =(r['Paciente']||'').trim();
      r._iniciais       =iniciais(r._paciente);
      r._genero         =(r['Gênero']||'').trim();
      r._faixaEtaria    =(r['Faixa Etária']||'').trim();
      r._modalidade     =(r['Modalidade']||'').trim();
      r._horario        =(r['Horário']||'').trim();
      r._ativo          =(r['Ativo']||'').trim();
      r._comparecimento =(r['Comparecimento']||'').trim();
      r._motivo         =(r['Motivo']||'').trim();
      r._valorSessao    =pVal(r['Valor da sessão']);
      r._sessoesCob     =parseFloat(r['Sessões cobradas'])||0;
      r._compSim        =(r._comparecimento==='Sim'||r._motivo==='Sem justificativa - Cobrado')?1:0;
      r._valorTotal     =r._sessoesCob*r._valorSessao;
      r._falta          =r._comparecimento==='Não'?1:0;
    });
    _rows=raw;
    const ativosMap={};
    raw.filter(r=>r._ativo==='Ativo').forEach(r=>{ativosMap[r._paciente]=r;});
    _ativosArr=Object.values(ativosMap);
    await sincronizarPacientesPlanilha(raw);
    if (window._prontInit) {
      await carregarPacientes();
      preencherDropdownProntuarios();
      await carregarProntuarios();
    }
    processAndRender();
    document.getElementById('loading').style.display='none';
    document.getElementById('dashboard').style.display='block';
    document.getElementById('last-update').textContent='Atualizado '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  }catch(e){
    console.error(e);
    document.getElementById('loading').style.display='none';
    document.getElementById('error-msg').style.display='block';
  }
}


async function sincronizarPacientesPlanilha(rows) {
  const map = {};
  rows.forEach(r => {
    const nome=(r._paciente||'').trim();
    if(!nome)return;
    const label=(r._horario ? r._horario+' | ' : '')+(r._iniciais||nome);
    if(!map[nome]) map[nome]={nome,ativo:false,ultima_chave:nome,ultimo_label:label};
    if(r._ativo==='Ativo') {
      map[nome].ativo=true;
      map[nome].ultimo_label=label;
    } else if(!map[nome].ativo) {
      map[nome].ultimo_label=label;
    }
  });
  const payload=Object.values(map);
  if(!payload.length)return;
  try{
    const up=await fetch('/api/data?table=pacientes&action=upsert',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
    });
    if(!up.ok)throw new Error('Falha ao sincronizar pacientes');
    const saved=await up.json();
    _pacientesMap={};
    (Array.isArray(saved)?saved:[saved]).forEach(p=>{_pacientesMap[p.nome]=p;});
  }catch(e){console.warn('Não foi possível sincronizar pacientes:',e);}
}

function processAndRender(){
  const rows=_rows;
  const meses=[...new Set(rows.map(r=>r._anoMes).filter(Boolean))].sort();

  // Mês atual determinado pelo relógio do navegador, não pelos dados
  const hoje=new Date();
  const diaHoje=hoje.getDate();
  const mesAtual=anoMes(hoje);

  // Mês anterior e YoY a partir do calendário real
  function mesAnterior(ym){const[y,m]=ym.split('-');const d=new Date(+y,+m-2,1);return anoMes(d);}
  function mesYoy(ym){if(!ym)return null;const[y,m]=ym.split('-');return(+y-1)+'-'+m;}
  const mesAnt=mesAnterior(mesAtual);
  const mesYoY=mesYoy(mesAtual);

  function aggMes(ym, ateDia=null){
    let r=rows.filter(x=>x._anoMes===ym);
    // Se ateDia definido, filtra só até aquele dia do mês
    if(ateDia!==null) r=r.filter(x=>x._data&&x._data.getDate()<=ateDia);
    return{fat:r.reduce((s,x)=>s+x._valorTotal,0),pac:new Set(r.map(x=>x._paciente)).size,faltas:r.filter(x=>x._falta).length,total:r.length};
  }

  // Mês atual: todos os dados (mês em curso)
  const cur=aggMes(mesAtual);
  // Comparações limitadas ao mesmo dia do mês para ser justo
  const curAteDia=aggMes(mesAtual, diaHoje);
  const prevAteDia=mesAnt?aggMes(mesAnt, diaHoje):null;
  const pyoyAteDia=mesYoY?aggMes(mesYoY, diaHoje):null;
  const curFatAteDia=curAteDia.fat;
  const prevFatAteDia=prevAteDia?prevAteDia.fat:null;
  const pyoyFatAteDia=pyoyAteDia?pyoyAteDia.fat:null;
  // Pacientes: comparação normal (mês completo)
  const prev=mesAnt?aggMes(mesAnt):null;
  const pyoy=mesYoY?aggMes(mesYoY):null;

  // ── KPI: Faturamento ──
  document.getElementById('kpi-fat').textContent='R$ '+cur.fat.toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:0});

  // ── KPI: Pacientes — qtd distinta de horários dos ativos ──
  const horariosDistintos=new Set(_ativosArr.map(r=>r._horario).filter(Boolean)).size;
  document.getElementById('kpi-pac').textContent=cur.pac+' ('+horariosDistintos+' horas)';

  // ── KPI: Faltas — até o dia de hoje ──
  const pctFalta=curAteDia.total?(curAteDia.faltas/curAteDia.total*100).toFixed(0)+'%':'0%';
  document.getElementById('kpi-falta').textContent=pctFalta;

  // Comparativos
  const momSuffix=mesAnt?'vs. '+mesLabel(mesAnt)+' de '+mesAnt.split('-')[0]:'';
  const yoySuffix=mesYoY?'vs. '+mesLabel(mesYoY)+' de '+mesYoY.split('-')[0]:'';
  if(prevAteDia){
    setComp('kpi-fat-mom',curFatAteDia,prevFatAteDia,momSuffix);
    setComp('kpi-pac-mom',cur.pac,prev?prev.pac:null,momSuffix);
    const cp=curAteDia.total?curAteDia.faltas/curAteDia.total*100:0;
    const pp=prevAteDia.total?prevAteDia.faltas/prevAteDia.total*100:0;
    setCompPP('kpi-falta-mom',cp,pp,momSuffix);
  }
  if(pyoyAteDia){
    setComp('kpi-fat-yoy',curFatAteDia,pyoyFatAteDia,yoySuffix);
    setComp('kpi-pac-yoy',cur.pac,pyoy?pyoy.pac:null,yoySuffix);
    const cp=curAteDia.total?curAteDia.faltas/curAteDia.total*100:0;
    const yp=pyoyAteDia.total?pyoyAteDia.faltas/pyoyAteDia.total*100:0;
    setCompPP('kpi-falta-yoy',cp,yp,yoySuffix);
  }

  // ── Gráficos histórico ──
  const labels=meses.map(mesLabel);
  const fatArr=meses.map(m=>rows.filter(r=>r._anoMes===m).reduce((s,r)=>s+r._valorTotal,0));
  const pacArr=meses.map(m=>new Set(rows.filter(r=>r._anoMes===m).map(r=>r._paciente)).size);
  const fltArr=meses.map(m=>rows.filter(r=>r._anoMes===m&&r._falta).length);
  renderBar('chart-fat',labels,fatArr,'R$','#c8bc96');
  renderBar('chart-pac',labels,pacArr,'Pac','#c8bc96');
  renderBar('chart-falta',labels,fltArr,'Flt','#c8bc96');

  // ── Saldo (badge, formato v1) ──
  const pacAtivos=new Set(rows.filter(r=>r._ativo==='Ativo').map(r=>r._paciente));
  const saldoMap={},horarioMap={};
  rows.filter(r=>pacAtivos.has(r._paciente)).forEach(r=>{
    const k=r._paciente;
    if(!saldoMap[k])saldoMap[k]={iniciais:r._iniciais,sessoes:0,comp:0};
    horarioMap[k]=r._horario||horarioMap[k]||'';
    saldoMap[k].sessoes+=r._sessoesCob;
    saldoMap[k].comp+=r._compSim;
  });
  const saldoArr=Object.entries(saldoMap)
    .map(([k,v])=>({iniciais:v.iniciais,horario:horarioMap[k]||'',saldo:v.sessoes-v.comp}))
    .sort((a,b)=>a.saldo-b.saldo);
  const tb=document.getElementById('tabela-saldo');tb.innerHTML='';
  saldoArr.forEach(({iniciais,horario,saldo})=>{
    const cls=saldo<0?'badge-red':saldo===0?'badge-yellow':'badge-green';
    tb.innerHTML+=`<tr>
      <td><strong>${iniciais}</strong></td>
      <td style="color:var(--muted);font-size:.77rem;">${horario}</td>
      <td><span class="badge ${cls}">${saldo}</span></td>
    </tr>`;
  });

  // ── Donut ──
  updateDonut();

  // ── % Faltas por paciente ativo ──
  // faltas = Comparecimento === 'Não'
  // total  = Comparecimento !== '' (não nulo)
  const faltasPac={};
  rows.filter(r=>pacAtivos.has(r._paciente)).forEach(r=>{
    const k=r._paciente;
    if(!faltasPac[k])faltasPac[k]={iniciais:r._iniciais||k,horario:r._horario||'',faltas:0,total:0};
    faltasPac[k].horario=r._horario||faltasPac[k].horario;
    if(r._comparecimento!=='')faltasPac[k].total+=1;
    if(r._falta)faltasPac[k].faltas+=1;
  });
  const faltaPacArr=Object.entries(faltasPac)
    .filter(([,v])=>v.total>0)
    .map(([,v])=>({label:(v.horario?v.horario+' | ':'')+v.iniciais,pct:v.faltas/v.total*100,faltas:v.faltas,total:v.total}))
    .sort((a,b)=>b.pct-a.pct);
  const ml=document.getElementById('motivos-list');ml.innerHTML='';
  faltaPacArr.forEach(({label,pct,faltas,total})=>{
    const pctFmt=pct.toFixed(1)+'%';
    const barColor=pct>=30?'#c0392b':pct>=15?'#e07070':'#c8bc96';
    ml.innerHTML+=`<div class="motivo-row" title="${faltas} faltas de ${total} atendimentos">
      <span class="motivo-nome">${label}</span>
      <div style="flex:1;height:6px;background:#f0ece6;border-radius:3px;margin:0 8px;align-self:center;">
        <div style="width:${Math.min(pct,100)}%;height:100%;background:${barColor};border-radius:3px;"></div>
      </div>
      <span class="motivo-qty">${pctFmt}</span>
    </div>`;
  });
  calcularAlertas();
}

function calcularAlertas() {
  const el=document.getElementById('alerts-content');
  if(!el)return;

  const hoje=new Date(); hoje.setHours(0,0,0,0);
  const inicioSemana=new Date(hoje);
  const diaSemana=hoje.getDay();
  const desloc=diaSemana===0?-6:1-diaSemana;
  inicioSemana.setDate(hoje.getDate()+desloc);
  const fimSemana=new Date(inicioSemana); fimSemana.setDate(inicioSemana.getDate()+6);

  const ultimoDia=new Date(hoje.getFullYear(),hoje.getMonth()+1,0);
  const inicioUltimaSemana=new Date(ultimoDia); inicioUltimaSemana.setDate(ultimoDia.getDate()-6);
  const ultimaSemana=hoje>=inicioUltimaSemana;

  const historicoCompras={};
  _rows.forEach(r=>{
    const k=r._paciente;
    if(!k || r._sessoesCob<=0)return;
    if(!historicoCompras[k])historicoCompras[k]=[];
    historicoCompras[k].push({qtd:r._sessoesCob,data:r._data||new Date(0)});
  });

  const ativos={};
  _rows.filter(r=>r._ativo==='Ativo').forEach(r=>{
    const k=r._paciente; if(!k)return;
    if(!ativos[k]) ativos[k]={iniciais:r._iniciais||k,horario:r._horario||'',sessoes:0,comp:0,compras:historicoCompras[k]||[]};
    ativos[k].horario=r._horario||ativos[k].horario;
    ativos[k].sessoes+=r._sessoesCob;
    ativos[k].comp+=r._compSim;
  });

  function pacoteHabitual(compras){
    if(!compras.length)return 0;
    const freq=new Map();
    compras.forEach(x=>freq.set(x.qtd,(freq.get(x.qtd)||0)+1));
    const max=Math.max(...freq.values());
    const candidatas=[...freq.entries()].filter(([,n])=>n===max).map(([q])=>q);
    // Em empate, usamos o pacote mais recente entre os candidatos.
    const recentes=compras.filter(x=>candidatas.includes(x.qtd)).sort((a,b)=>b.data-a.data);
    return recentes[0]?.qtd||0;
  }

  const diaIdx={dom:0,domingo:0,seg:1,segunda:1,ter:2,terça:2,terca:2,qua:3,quarta:3,qui:4,quinta:4,sex:5,sexta:5,sab:6,sábado:6,sabado:6};
  function horarioDia(h){
    const x=(h||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    for(const[k,v]of Object.entries(diaIdx))if(x.startsWith(k))return v;
    return null;
  }
  function proximaOcorrencia(h){
    const idx=horarioDia(h); if(idx===null)return null;
    const d=new Date(hoje); let diff=idx-d.getDay(); if(diff<=0)diff+=7;
    d.setDate(d.getDate()+diff); return d;
  }
  function fmt(d){return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});}

  const renovacoes=[],dividas=[];
  Object.values(ativos).forEach(p=>{
    const pacote=pacoteHabitual(p.compras);
    // Quem normalmente compra uma única sessão não entra no alerta de renovação.
    if(pacote<=1)return;
    const saldo=p.sessoes-p.comp;
    const prox=proximaOcorrencia(p.horario);
    if(prox && saldo>=0){
      const renovacao=new Date(prox); renovacao.setDate(renovacao.getDate()+saldo*7);
      if(renovacao>=inicioSemana&&renovacao<=fimSemana) renovacoes.push({label:`${p.iniciais} | ${p.horario}`,data:renovacao});
    }
    // Pendências só aparecem na última semana do mês.
    if(ultimaSemana&&saldo<0)dividas.push({label:`${p.iniciais} | ${p.horario}`,qtd:Math.abs(saldo)});
  });

  renovacoes.sort((a,b)=>a.data-b.data); dividas.sort((a,b)=>b.qtd-a.qtd);
  let html='';
  if(renovacoes.length){
    html+='<div class="alert-group"><div class="alert-group-title">📦 Renovações esta semana</div>';
    html+=renovacoes.map(x=>`<div class="alert-item"><span>${x.label}</span><span class="alert-badge alert-green">${fmt(x.data)}</span></div>`).join('');
    html+='</div>';
  }
  if(ultimaSemana&&dividas.length){
    html+='<div class="alert-group"><div class="alert-group-title">⚠️ Sessões pendentes</div>';
    html+=dividas.map(x=>`<div class="alert-item"><span>${x.label}</span><span class="alert-badge alert-red">deve ${x.qtd} sessão${x.qtd!==1?'ões':''}</span></div>`).join('');
    html+='</div>';
  }
  if(!html)html='<div class="alert-empty">Nenhuma renovação ou pendência relevante para este período.</div>';
  el.innerHTML=html;
}

function updateDonut(){
  const sel=document.getElementById('profile-select').value;
  const fn=sel==='genero'?r=>r._genero:sel==='faixa'?r=>r._faixaEtaria:r=>r._modalidade;
  const data=countBy(_ativosArr,fn);
  dC('chart-donut');
  const labels=Object.keys(data),vals=Object.values(data);
  const total=vals.reduce((a,b)=>a+b,0);
  charts['chart-donut']=new Chart(document.getElementById('chart-donut').getContext('2d'),{
    type:'doughnut',
    data:{labels,datasets:[{data:vals,backgroundColor:COLORS.slice(0,labels.length),borderWidth:2,borderColor:'#fff',hoverOffset:6}]},
    options:{
      responsive:true,cutout:'68%',
      layout:{padding:{left:10,right:10,top:40,bottom:40}},
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:ctx=>` ${ctx.label}: ${ctx.parsed} (${(ctx.parsed/total*100).toFixed(2)}%)`}}
      }
    },
    plugins:[{
      id:'outerLabels',
      afterDraw(chart){
        const{ctx,data,chartArea}=chart;
        const meta=chart.getDatasetMeta(0);
        ctx.save();
        const canvasW=chart.width, canvasH=chart.height;
        meta.data.forEach((arc,i)=>{
          const angle=(arc.startAngle+arc.endAngle)/2;
          const or=arc.outerRadius;
          const lineLen=16;
          const xEdge=arc.x+Math.cos(angle)*or;
          const yEdge=arc.y+Math.sin(angle)*or;
          const xLine=arc.x+Math.cos(angle)*(or+lineLen);
          const yLine=arc.y+Math.sin(angle)*(or+lineLen);
          const isRight=Math.cos(angle)>=0;
          const pct=(data.datasets[0].data[i]/data.datasets[0].data.reduce((a,b)=>a+b,0)*100).toFixed(2);
          const label=data.labels[i];
          const qty=data.datasets[0].data[i];
          const line1=label;
          const line2=`${qty} (${pct}%)`;

          // Mede largura do texto mais longo
          ctx.font='bold 10px Source Sans 3';
          const w1=ctx.measureText(line1).width;
          ctx.font='10px Source Sans 3';
          const w2=ctx.measureText(line2).width;
          const maxW=Math.max(w1,w2);

          // Posição X do texto: clamp para não sair do canvas
          let xText=xLine+(isRight?4:-4);
          if(isRight) xText=Math.min(xText, canvasW-maxW-4);
          else        xText=Math.max(xText, maxW+4);

          // Linha
          ctx.strokeStyle=COLORS[i%COLORS.length];
          ctx.lineWidth=1.2;
          ctx.beginPath();ctx.moveTo(xEdge,yEdge);ctx.lineTo(xLine,yLine);ctx.stroke();

          // Labels
          ctx.textAlign=isRight?'left':'right';
          ctx.textBaseline='middle';
          ctx.font='bold 10px Source Sans 3';
          ctx.fillStyle='#2a2a2a';
          ctx.fillText(line1,xText,yLine-7);
          ctx.font='10px Source Sans 3';
          ctx.fillStyle='#888';
          ctx.fillText(line2,xText,yLine+7);
        });
        ctx.restore();
      }
    }]
  });
}

function renderBar(id,labels,data,yLabel,color){
  dC(id);
  charts[id]=new Chart(document.getElementById(id).getContext('2d'),{
    type:'bar',
    data:{labels,datasets:[{data,backgroundColor:color,borderRadius:2}]},
    options:{
      responsive:true,maintainAspectRatio:true,
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:ctx=>yLabel==='R$'?' R$ '+ctx.parsed.y.toLocaleString('pt-BR',{minimumFractionDigits:0}):(` ${ctx.parsed.y}`)}}
      },
      scales:{
        x:{grid:{display:false},ticks:{font:{size:9},maxRotation:45}},
        y:{grid:{color:'#f0ece6'},ticks:{font:{size:9}}}
      }
    }
  });
}

// ══════════════════════════════════════════════════════════
// SUB-TABS (dentro de Atividades)
// ══════════════════════════════════════════════════════════
function switchSubTab(name) {
  document.querySelectorAll('.sub-page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sub-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('subpage-' + name).classList.add('active');
  document.getElementById('subtab-btn-' + name).classList.add('active');
  if (name === 'docs' && !window._pptInit) {
    window._pptInit = true;
    renderPPTBiblioteca();
  }
  if (name === 'posts' && !window._postsInit) {
    window._postsInit = true;
    initPosts();
  }
}

// ══════════════════════════════════════════════════════════
// MÓDULO ATIVIDADES (persistido no Supabase)
// ══════════════════════════════════════════════════════════
let _atividades  = [];
let _currentImg  = null;
let _currentView = 'grid';
let _modalId     = null;
let _lastPrompt  = '';

async function initAtividades() {
  document.getElementById('biblioteca-container').innerHTML =
    '<div class="inline-loading"><div class="inline-spinner"></div> Carregando biblioteca...</div>';
  try {
    const res = await fetch('/api/data?table=atividades');
    _atividades = res.ok ? await res.json() : [];
  } catch(e) {
    console.error(e);
    _atividades = [];
  }
  renderBiblioteca();
}

async function gerarAtividade() {
  const tipo  = document.getElementById('g-tipo').value;
  const faixa = document.getElementById('g-faixa').value;
  const tema  = document.getElementById('g-tema').value;
  const desc  = document.getElementById('g-desc').value.trim();

  if (!desc) { toast('Descreva o que você quer criar.'); return; }

  const tipoPrompt = tipo === 'Colorir'
    ? 'coloring page, black and white line art, thick clean outlines, no shading, white background, printable'
    : tipo === 'Rotina'
    ? 'visual routine chart with numbered steps, clear icons, children illustration style, colorful'
    : 'therapeutic children illustration, warm colors, friendly characters';

  const prompt = `${tipoPrompt}, ${desc}, for ${faixa||'children'} age group, theme: ${tema||'therapy'}, child-friendly, professional therapeutic material, high quality`;
  _lastPrompt = prompt;

  setGenerating(true, 'Gerando imagem...');
  try {
    const imgB64 = await gerarImagem(prompt);
    _currentImg = { b64: imgB64, prompt };
    mostrarPreview(imgB64);
    setGenerating(false, '');
    document.getElementById('btn-regen').disabled       = false;
    document.getElementById('btn-edit-prompt').disabled = false;
  } catch(e) {
    console.error(e);
    setGenerating(false, '');
    toast('Erro ao gerar: ' + (e.message || 'tente novamente'));
  }
}

async function gerarImagem(prompt) {
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ type: 'image', prompt })
  });
  if (!res.ok) {
    const err = await res.json().catch(()=>({}));
    throw new Error(err?.error || 'Erro ao gerar imagem');
  }
  const data = await res.json();
  if (!data.b64) throw new Error('Nenhuma imagem retornada');
  return data.b64;
}

async function regenerar() {
  if (!_lastPrompt) return;
  setGenerating(true, 'Regenerando...');
  try {
    const b64 = await gerarImagem(_lastPrompt);
    _currentImg = { b64, prompt: _lastPrompt };
    mostrarPreview(b64);
    setGenerating(false, '');
  } catch(e) {
    setGenerating(false, '');
    toast('Erro: ' + (e.message || 'tente novamente'));
  }
}

function editarPrompt() {
  const novo = prompt('Edite o prompt antes de regenerar:', _lastPrompt);
  if (novo !== null && novo.trim()) {
    _lastPrompt = novo.trim();
    regenerar();
  }
}

function mostrarPreview(b64) {
  document.getElementById('preview-wrap').innerHTML =
    `<img src="data:image/png;base64,${b64}" alt="Atividade gerada" style="max-width:100%;"/>`;
  document.getElementById('preview-card').style.display = 'block';
  document.getElementById('preview-card').scrollIntoView({behavior:'smooth', block:'start'});
}

function descartarPreview() {
  document.getElementById('preview-card').style.display = 'none';
  _currentImg = null;
  document.getElementById('btn-regen').disabled       = true;
  document.getElementById('btn-edit-prompt').disabled = true;
  document.getElementById('g-titulo').value = '';
}

function setGenerating(on, msg) {
  const btn = document.getElementById('btn-gen');
  btn.disabled = on;
  btn.innerHTML = on
    ? `<span class="inline-spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;"></span> Gerando...`
    : '<span>✦</span> Gerar imagem';
  document.getElementById('gen-status').textContent = msg;
}

async function salvarAtividade() {
  if (!_currentImg) return;
  const titulo = document.getElementById('g-titulo').value.trim() || 'Atividade sem título';
  const payload = {
    titulo,
    tipo:     document.getElementById('g-tipo').value  || 'Outro',
    faixa:    document.getElementById('g-faixa').value || '—',
    tema:     document.getElementById('g-tema').value  || '—',
    img_b64:  _currentImg.b64,
    prompt:   _currentImg.prompt,
    criado_em: new Date().toISOString(),
  };

  try {
    const res = await fetch('/api/data?table=atividades', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Falha ao salvar');
    const saved = await res.json();
    _atividades.unshift(Array.isArray(saved) ? saved[0] : saved);

    // Limpa TUDO — formulário completo, não só o preview
    limparFormAtividade();
    renderBiblioteca();
    toast('✅ Atividade salva na biblioteca!');
  } catch(e) {
    console.error(e);
    toast('Erro ao salvar: ' + e.message);
  }
}

function limparFormAtividade() {
  document.getElementById('g-tipo').value  = '';
  document.getElementById('g-faixa').value = '';
  document.getElementById('g-tema').value  = '';
  document.getElementById('g-desc').value  = '';
  document.getElementById('g-titulo').value = '';
  document.getElementById('preview-card').style.display = 'none';
  _currentImg  = null;
  _lastPrompt  = '';
  document.getElementById('btn-regen').disabled       = true;
  document.getElementById('btn-edit-prompt').disabled = true;
}

function exportarPDF(b64, titulo) {
  const imgSrc = b64
    ? `data:image/png;base64,${b64}`
    : document.querySelector('#preview-wrap img')?.src;
  if (!imgSrc) { toast('Nenhuma imagem para exportar.'); return; }

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>${titulo||'Atividade'}</title>
    <style>*{margin:0;padding:0;box-sizing:border-box;}body{display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff;}img{max-width:100%;max-height:100vh;object-fit:contain;display:block;}@media print{body{margin:0;}img{width:100%;height:auto;}}</style>
  </head><body><img src="${imgSrc}" onload="window.print();"/></body></html>`);
  win.document.close();
}

function exportarPDFModal() {
  const ativ = _atividades.find(a => a.id === _modalId);
  if (ativ) exportarPDF(ativ.img_b64, ativ.titulo);
}

function clearFilters() {
  ['f-tipo','f-faixa','f-tema'].forEach(id=>{document.getElementById(id).selectedIndex=0;});
  renderBiblioteca();
}

function setView(v) {
  _currentView = v;
  document.getElementById('vt-grid').className = 'view-tab'+(v==='grid'?' active':'');
  document.getElementById('vt-list').className = 'view-tab'+(v==='list'?' active':'');
  renderBiblioteca();
}

function renderBiblioteca() {
  const fTipo  = document.getElementById('f-tipo').value;
  const fFaixa = document.getElementById('f-faixa').value;
  const fTema  = document.getElementById('f-tema').value;

  let filtered = _atividades;
  if (fTipo)  filtered = filtered.filter(a=>a.tipo===fTipo);
  if (fFaixa) filtered = filtered.filter(a=>a.faixa===fFaixa);
  if (fTema)  filtered = filtered.filter(a=>a.tema===fTema);

  const n = [fTipo,fFaixa,fTema].filter(Boolean).length;
  document.getElementById('count-badge').textContent = n>0?n+' filtro'+(n>1?'s':'')+' ativo'+(n>1?'s':''):'';
  document.getElementById('lib-count').textContent = filtered.length>0?`(${filtered.length})` : '';

  const container = document.getElementById('biblioteca-container');
  if (filtered.length === 0) {
    container.innerHTML = `<div class="biblioteca-empty"><div class="icon">🎨</div><p>${_atividades.length===0
      ? 'Nenhuma atividade ainda.<br>Crie a primeira usando o gerador acima!'
      : 'Nenhuma atividade encontrada com esses filtros.'}</p></div>`;
    return;
  }
  container.innerHTML = _currentView === 'grid'
    ? `<div class="grid-view">${filtered.map(cardGrid).join('')}</div>`
    : `<div class="list-view">${filtered.map(cardList).join('')}</div>`;
}

function cardGrid(a) {
  const img = a.img_b64
    ? `<img class="ativ-card-img" src="data:image/png;base64,${a.img_b64}" alt="${a.titulo}"/>`
    : `<div class="ativ-card-img-placeholder">🎨</div>`;
  return `<div class="ativ-card" onclick="openModal('${a.id}')">
    ${img}
    <div class="ativ-card-body">
      <div class="ativ-card-title">${a.titulo}</div>
      <div class="ativ-card-tags">
        <span class="tag tipo">${a.tipo}</span>
        <span class="tag faixa">${a.faixa}</span>
        <span class="tag tema">${a.tema}</span>
      </div>
    </div>
    <div class="ativ-card-actions" onclick="event.stopPropagation()">
      <button class="btn-xs pdf" onclick="exportarPDF('${a.img_b64}','${a.titulo}')">⬇ PDF</button>
      <button class="btn-xs del" onclick="deletarAtividade('${a.id}')">Excluir</button>
    </div>
  </div>`;
}

function cardList(a) {
  const img = a.img_b64
    ? `<img class="ativ-row-thumb" src="data:image/png;base64,${a.img_b64}" alt="${a.titulo}"/>`
    : `<div class="ativ-row-thumb-placeholder">🎨</div>`;
  return `<div class="ativ-row">
    ${img}
    <div class="ativ-row-info" onclick="openModal('${a.id}')" style="cursor:pointer;">
      <div class="ativ-row-title">${a.titulo}</div>
      <div class="ativ-card-tags">
        <span class="tag tipo">${a.tipo}</span>
        <span class="tag faixa">${a.faixa}</span>
        <span class="tag tema">${a.tema}</span>
      </div>
    </div>
    <div class="ativ-row-actions">
      <button class="btn-xs pdf" onclick="exportarPDF('${a.img_b64}','${a.titulo}')">⬇ PDF</button>
      <button class="btn-xs del" onclick="deletarAtividade('${a.id}')">Excluir</button>
    </div>
  </div>`;
}

function openModal(id) {
  const a = _atividades.find(x=>x.id===id);
  if (!a) return;
  _modalId = id;
  document.getElementById('modal-title').textContent = a.titulo;
  document.getElementById('modal-img').src = `data:image/png;base64,${a.img_b64}`;
  document.getElementById('modal-tags').innerHTML =
    `<span class="tag tipo">${a.tipo}</span><span class="tag faixa">${a.faixa}</span><span class="tag tema">${a.tema}</span>`;
  document.getElementById('modal-overlay').classList.add('open');
}
function closeModal(e) { if (e.target === document.getElementById('modal-overlay')) closeModalBtn(); }
function closeModalBtn() { document.getElementById('modal-overlay').classList.remove('open'); _modalId = null; }
function deletarModal() { if (_modalId) { deletarAtividade(_modalId); closeModalBtn(); } }

async function deletarAtividade(id) {
  if (!confirm('Excluir esta atividade da biblioteca?')) return;
  try {
    await fetch(`/api/data?table=atividades&id=${id}`, { method: 'DELETE' });
    _atividades = _atividades.filter(a=>a.id!==id);
    renderBiblioteca();
    toast('Atividade excluída.');
  } catch(e) {
    toast('Erro ao excluir: ' + e.message);
  }
}

// ══════════════════════════════════════════════════════════
// MÓDULO PPT (apresentações geradas por IA)
// ══════════════════════════════════════════════════════════
let _pptData        = null; // { titulo, slides: [{titulo, conteudo}] }
let _pptMeta         = {};
let _apresentacoes   = [];

async function gerarPPT() {
  const publico = document.getElementById('ppt-publico').value;
  const tema    = document.getElementById('ppt-tema').value;
  const desc    = document.getElementById('ppt-desc').value.trim();

  if (!desc) { toast('Descreva o conteúdo da apresentação.'); return; }

  const btn = document.getElementById('btn-gen-ppt');
  btn.disabled = true;
  document.getElementById('ppt-status').textContent = 'Gerando conteúdo com IA...';

  try {
    const res = await fetch('/api/ppt-content', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ descricao: desc, publico, tema })
    });
    if (!res.ok) {
      const err = await res.json().catch(()=>({}));
      throw new Error(err?.error || 'Erro ao gerar conteúdo');
    }
    const data = await res.json();
    _pptData = data;
    _pptMeta = { publico, tema };

    document.getElementById('ppt-preview-titulo').textContent = '📊 ' + data.titulo;
    document.getElementById('ppt-titulo-salvar').value = data.titulo;
    const list = document.getElementById('ppt-slides-list');
    list.innerHTML = data.slides.map((s,i) => `
      <div class="ppt-slide-preview">
        <h4>Slide ${i+1}: ${s.titulo}</h4>
        <ul>${s.conteudo.map(p=>`<li>${p}</li>`).join('')}</ul>
      </div>
    `).join('');

    document.getElementById('ppt-preview').style.display = 'block';
    document.getElementById('ppt-preview').scrollIntoView({behavior:'smooth', block:'start'});
    document.getElementById('ppt-status').textContent = '';
  } catch(e) {
    console.error(e);
    document.getElementById('ppt-status').textContent = '';
    toast('Erro: ' + e.message);
  }
  btn.disabled = false;
}

function descartarPPT() {
  _pptData = null;
  document.getElementById('ppt-preview').style.display = 'none';
  limparFormPPT();
}

function limparFormPPT() {
  document.getElementById('ppt-publico').value = '';
  document.getElementById('ppt-tema').value    = '';
  document.getElementById('ppt-desc').value    = '';
  document.getElementById('ppt-titulo-salvar').value = '';
}

async function salvarPPTBiblioteca() {
  if (!_pptData) return;
  const titulo = document.getElementById('ppt-titulo-salvar').value.trim() || _pptData.titulo;

  const payload = {
    titulo,
    publico: _pptMeta.publico || '—',
    tema:    _pptMeta.tema    || '—',
    slides_json: JSON.stringify(_pptData.slides),
    criado_em: new Date().toISOString(),
  };

  try {
    const res = await fetch('/api/data?table=prontuarios&sub=apresentacoes', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    // Usa a mesma tabela 'atividades' com um campo tipo='apresentacao' para simplificar schema único
  } catch(e) {}

  // Salva via endpoint genérico de atividades, usando tipo especial
  try {
    const res2 = await fetch('/api/data?table=atividades', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        titulo,
        tipo: 'Apresentação',
        faixa: _pptMeta.publico || '—',
        tema: _pptMeta.tema || '—',
        prompt: JSON.stringify(_pptData.slides),
        criado_em: new Date().toISOString(),
      })
    });
    if (!res2.ok) throw new Error('Falha ao salvar apresentação');
    const saved = await res2.json();
    _apresentacoes.unshift(Array.isArray(saved) ? saved[0] : saved);
    descartarPPT();
    renderPPTBiblioteca();
    toast('✅ Apresentação salva na biblioteca!');
  } catch(e) {
    toast('Erro ao salvar: ' + e.message);
  }
}

function exportarPPTX() {
  if (!_pptData) return;
  gerarArquivoPPTX(_pptData, _pptData.titulo);
}

function gerarArquivoPPTX(pptData, nomeArquivo) {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'CUSTOM', width: 10, height: 5.63 });
  pptx.layout = 'CUSTOM';

  // Slide de título
  const slideTitulo = pptx.addSlide();
  slideTitulo.background = { color: 'D6CCB0' };
  slideTitulo.addText(pptData.titulo, {
    x: 0.5, y: 2, w: 9, h: 1.5,
    fontSize: 32, bold: true, color: '3A3020',
    fontFace: 'Georgia', align: 'center',
  });
  slideTitulo.addText('🌻 Psicóloga Jaqueline C. Vieira', {
    x: 0.5, y: 3.5, w: 9, h: 0.5,
    fontSize: 14, color: '5A5040', align: 'center',
  });

  // Slides de conteúdo
  pptData.slides.forEach(s => {
    const slide = pptx.addSlide();
    slide.background = { color: 'F5F2EB' };
    slide.addText(s.titulo, {
      x: 0.5, y: 0.4, w: 9, h: 0.8,
      fontSize: 24, bold: true, color: '3A3020', fontFace: 'Georgia',
    });
    slide.addText(
      s.conteudo.map(p => ({ text: p, options: { bullet: true, breakLine: true } })),
      { x: 0.6, y: 1.4, w: 8.8, h: 3.8, fontSize: 18, color: '2A2A2A', valign: 'top' }
    );
  });

  pptx.writeFile({ fileName: `${(nomeArquivo||'apresentacao').replace(/[^a-zA-Z0-9]/g,'_')}.pptx` });
}

function clearPPTFilters() {
  ['f-ppt-publico','f-ppt-tema'].forEach(id=>{document.getElementById(id).selectedIndex=0;});
  renderPPTBiblioteca();
}

async function renderPPTBiblioteca() {
  const container = document.getElementById('ppt-biblioteca-container');
  container.innerHTML = '<div class="inline-loading"><div class="inline-spinner"></div> Carregando...</div>';

  try {
    const res = await fetch('/api/data?table=atividades');
    const all = res.ok ? await res.json() : [];
    _apresentacoes = all.filter(a => a.tipo === 'Apresentação');
  } catch(e) {
    _apresentacoes = [];
  }

  const fPub  = document.getElementById('f-ppt-publico').value;
  const fTema = document.getElementById('f-ppt-tema').value;
  let filtered = _apresentacoes;
  if (fPub)  filtered = filtered.filter(a => a.faixa === fPub);
  if (fTema) filtered = filtered.filter(a => a.tema  === fTema);

  const n = [fPub,fTema].filter(Boolean).length;
  document.getElementById('ppt-count-badge').textContent = n>0?n+' filtro'+(n>1?'s':'')+' ativo'+(n>1?'s':''):'';
  document.getElementById('ppt-lib-count').textContent = filtered.length>0?`(${filtered.length})`:'';

  if (filtered.length === 0) {
    container.innerHTML = `<div class="biblioteca-empty"><div class="icon">📊</div><p>${_apresentacoes.length===0
      ? 'Nenhuma apresentação ainda.<br>Gere a primeira usando o formulário acima!'
      : 'Nenhuma apresentação encontrada com esses filtros.'}</p></div>`;
    return;
  }

  container.innerHTML = `<div class="grid-view">${filtered.map(a => `
    <div class="ativ-card" style="cursor:default;">
      <div class="ativ-card-img-placeholder">📊</div>
      <div class="ativ-card-body">
        <div class="ativ-card-title">${a.titulo}</div>
        <div class="ativ-card-tags">
          <span class="tag tipo">${a.faixa}</span>
          <span class="tag tema">${a.tema}</span>
        </div>
      </div>
      <div class="ativ-card-actions">
        <button class="btn-xs pdf" onclick='baixarPPTSalvo(${JSON.stringify(a.prompt)}, ${JSON.stringify(a.titulo)})'>⬇ .pptx</button>
        <button class="btn-xs del" onclick="deletarApresentacao('${a.id}')">Excluir</button>
      </div>
    </div>
  `).join('')}</div>`;
}

function baixarPPTSalvo(slidesJson, titulo) {
  try {
    const slides = JSON.parse(slidesJson);
    gerarArquivoPPTX({ titulo, slides }, titulo);
  } catch(e) {
    toast('Erro ao gerar arquivo: ' + e.message);
  }
}

async function deletarApresentacao(id) {
  if (!confirm('Excluir esta apresentação?')) return;
  try {
    await fetch(`/api/data?table=atividades&id=${id}`, { method: 'DELETE' });
    renderPPTBiblioteca();
    toast('Apresentação excluída.');
  } catch(e) {
    toast('Erro: ' + e.message);
  }
}

// ══════════════════════════════════════════════════════════
// MÓDULO POSTS
// ══════════════════════════════════════════════════════════
let _postAtual=null;
let _postTrends=[];
function escHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

async function initPosts(){
  await carregarPostsSalvos();
  const brand=document.getElementById('post-brand-preview');
  if(brand){
    brand.innerHTML='<div class="post-logo-preview"><img src="/assets/logo-jaqueline-dark.png" alt="Logo Jaqueline Vieira"/><span style="font-size:.72rem;color:var(--muted)">Logo aplicada automaticamente às artes</span></div>';
  }
  buscarTendencias(false);
}

async function buscarTendencias(force=false){
  const btn=document.getElementById('btn-trends'), status=document.getElementById('trends-status');
  btn.disabled=true;
  try{
    if(!force){
      const cached=JSON.parse(localStorage.getItem('psi_trend_radar')||'null');
      if(cached && cached.at && (Date.now()-cached.at)<6*60*60*1000 && Array.isArray(cached.suggestions)){
        _postTrends=cached.suggestions; renderTendencias();
        status.textContent='Radar atualizado recentemente';
        btn.disabled=false; return;
      }
    }
    status.textContent='Buscando assuntos recentes...';
    const r=await fetch('/api/trends');
    const data=await r.json();
    if(!r.ok)throw new Error(data.error||'Erro ao buscar tendências');
    _postTrends=data.suggestions||[];
    localStorage.setItem('psi_trend_radar',JSON.stringify({at:Date.now(),suggestions:_postTrends}));
    renderTendencias();
    status.textContent=`Atualizado ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`;
  }catch(e){
    status.textContent='';
    toast('Não foi possível buscar tendências: '+e.message);
  }finally{btn.disabled=false;}
}

function renderTendencias(){
  const el=document.getElementById('trends-container');
  if(!_postTrends.length){
    el.innerHTML='<div class="biblioteca-empty"><div class="icon">🌿</div><p>Nenhuma oportunidade relevante encontrada agora.</p></div>';
    return;
  }
  el.innerHTML=`<div class="post-grid">${_postTrends.map((x,i)=>`
    <div class="post-suggestion">
      <h4>${escHtml(x.titulo)}</h4>
      <div class="post-meta">
        <span class="post-tag">${escHtml(x.faixa||'Ciclo vital')}</span>
        <span class="post-tag">${escHtml(x.formato||'Carrossel')}</span>
        <span class="post-tag">Potencial ${escHtml(x.potencial||'Médio')}</span>
      </div>
      <p style="font-size:.8rem;line-height:1.5;">${escHtml(x.resumo||'')}</p>
      <p style="font-size:.76rem;color:var(--muted);margin-top:7px;"><strong>Por que agora:</strong> ${escHtml(x.por_que||'')}</p>
      <p style="font-size:.76rem;line-height:1.45;margin-top:7px;"><strong>Ângulo:</strong> ${escHtml(x.angulo||'')}</p>
      <div class="post-source">Fonte: ${escHtml(x.fonte?.source||'')} · ${escHtml(x.fonte?.title||'')}</div>
      <div class="gen-actions"><button class="btn-secondary" onclick="usarSugestaoPost(${i})">✦ Criar este post</button></div>
    </div>`).join('')}</div>`;
}

function usarSugestaoPost(i){
  const x=_postTrends[i];
  if(!x)return;
  document.getElementById('post-tema').value=x.titulo||'';
  document.getElementById('post-formato').value=x.formato||'Carrossel';
  document.getElementById('post-contexto').value=x.resumo||x.por_que||'';
  document.getElementById('post-publico').value = x.faixa==='Infância' ? 'Crianças' : x.faixa==='Adolescência' ? 'Adolescentes' : x.faixa==='Adultos' ? 'Adultos' : x.faixa==='Idosos' ? 'Idosos' : x.faixa==='Família' ? 'Famílias' : 'Ciclo vital';
  document.getElementById('post-preview-card').style.display='none';
  gerarPost();
}

async function gerarPost(){
  const tema=document.getElementById('post-tema').value.trim();
  if(!tema){toast('Informe um tema.');return;}
  const status=document.getElementById('post-status'),btn=document.getElementById('btn-post-generate');
  btn.disabled=true;status.textContent='Gerando conteúdo...';
  try{
    const r=await fetch('/api/post-content',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        tema,formato:document.getElementById('post-formato').value,
        publico:document.getElementById('post-publico').value,
        contexto:document.getElementById('post-contexto').value.trim(),
        faixa:(_postTrends.find(x=>x.titulo===tema)?.faixa)||document.getElementById('post-publico').value
      })
    });
    const data=await r.json();if(!r.ok)throw new Error(data.error||'Erro');
    const trendSelecionada=_postTrends.find(x=>x.titulo===tema);
    _postAtual={...data,tema,formato:document.getElementById('post-formato').value,
      publico:document.getElementById('post-publico').value,faixa:trendSelecionada?.faixa||document.getElementById('post-publico').value,img_b64:null,
      fonte_tendencia:trendSelecionada?.fonte?.link||''};
    renderPostPreview();
    status.textContent='Conteúdo gerado — revise antes de salvar.';
  }catch(e){status.textContent='';toast('Erro ao gerar post: '+e.message);}
  finally{btn.disabled=false;}
}

function renderPostPreview(){
  if(!_postAtual)return;
  document.getElementById('post-preview-title').textContent=_postAtual.titulo||'Prévia do post';
  document.getElementById('post-slides').innerHTML=(_postAtual.slides||[]).map((x,i)=>`<div class="post-slide"><strong>${i+1}.</strong> ${x}</div>`).join('');
  document.getElementById('post-legenda').textContent=_postAtual.legenda||'';
  document.getElementById('post-hashtags').textContent=(_postAtual.hashtags||[]).join(' ');
  document.getElementById('post-cta').textContent=_postAtual.cta||'';
  document.getElementById('post-preview-card').style.display='block';
  document.getElementById('post-preview-card').scrollIntoView({behavior:'smooth',block:'start'});
}

const BRAND_SAGE='#899776';
const BRAND_DEEP='#687257';
const BRAND_CREAM='#F4F1E8';
const BRAND_SAND='#D8CDB8';
const BRAND_TERRACOTTA='#C5654E';
const BRAND_INK='#4F5845';
const BRAND_PALETTE=[BRAND_SAGE,BRAND_DEEP,BRAND_TERRACOTTA];
async function corDeMarcaParaArte(b64){
  // A arte pode influenciar a escolha, mas somente dentro da paleta da marca.
  // A decisão acontece UMA vez no primeiro slide e é reaproveitada no carrossel inteiro.
  try{
    const extracted=await extrairCorAcento(b64);
    const [r,g,b]=hexToRgb(extracted);
    const [h]=rgbToHsl(r,g,b);
    if((h>=345||h<=28) && r>g*1.08) return BRAND_TERRACOTTA;
    if(h>=55&&h<=155) return BRAND_SAGE;
    return BRAND_DEEP;
  }catch(_e){ return BRAND_SAGE; }
}
function rgbToHsl(r,g,b){
  r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b);let h=0,s=0,l=(max+min)/2;
  if(max!==min){const d=max-min;s=l>.5?d/(2-max-min):d/(max+min);switch(max){case r:h=((g-b)/d+(g<b?6:0))/6;break;case g:h=((b-r)/d+2)/6;break;case b:h=((r-g)/d+4)/6;break;}}
  return [h*360,s,l];
}
function hslToRgb(h,s,l){
  h/=360;let r,g,b;
  if(s===0){r=g=b=l;}else{const hue2rgb=(p,q,t)=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};const q=l<.5?l*(1+s):l+s-l*s,p=2*l-q;r=hue2rgb(p,q,h+1/3);g=hue2rgb(p,q,h);b=hue2rgb(p,q,h-1/3);}return [Math.round(r*255),Math.round(g*255),Math.round(b*255)];
}
function extrairCorAcento(b64){
  return new Promise((resolve)=>{
    const img=new Image();
    img.onload=()=>{
      const c=document.createElement('canvas'),w=64,h=64;c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.drawImage(img,0,0,w,h);
      const data=ctx.getImageData(0,0,w,h).data;const bins=new Map();
      for(let i=0;i<data.length;i+=4){const a=data[i+3];if(a<180)continue;const [hh,ss,ll]=rgbToHsl(data[i],data[i+1],data[i+2]);
        if(ss<.18||ll<.22||ll>.72)continue;const hb=Math.round(hh/10)*10;const score=ss*(1-Math.abs(ll-.5));bins.set(hb,(bins.get(hb)||0)+score);
      }
      let best=[30,0];for(const [hue,score] of bins)if(score>best[1])best=[hue,score];
      const rgb=hslToRgb(best[1] ? best[0] : 25,best[1] ? .45 : .35,best[1] ? .43 : .40);
      resolve('#'+rgb.map(x=>x.toString(16).padStart(2,'0')).join(''));
    };img.onerror=()=>resolve(BRAND_SAGE);img.src='data:image/png;base64,'+b64;
  });
}
function analisarZonaLogo(b64, pos){
  return new Promise((resolve)=>{
    const img=new Image();
    img.onload=()=>{
      const c=document.createElement('canvas'),size=64;c.width=size;c.height=size;const ctx=c.getContext('2d');
      const w=img.naturalWidth||1024,h=img.naturalHeight||1024;
      const boxW=Math.round(w*.24), boxH=Math.round(h*.16), pad=Math.round(Math.min(w,h)*.025);
      let x=pad,y=pad;
      if(pos==='tr'){x=w-boxW-pad;y=pad;}
      if(pos==='br'){x=w-boxW-pad;y=h-boxH-pad;}
      if(pos==='bl'){x=pad;y=h-boxH-pad;}
      ctx.drawImage(img,x,y,boxW,boxH);
      const d=ctx.getImageData(0,0,size,size).data;
      let lumSum=0, lumSq=0, n=0;
      for(let i=0;i<d.length;i+=4){const lum=(0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2])/255;lumSum+=lum;lumSq+=lum*lum;n++;}
      const avg=lumSum/n, variance=Math.max(0,lumSq/n-avg*avg);
      const homogeneity=Math.max(0,1-Math.sqrt(variance)*4);
      resolve({avg,homogeneity});
    };
    img.onerror=()=>resolve({avg:.6,homogeneity:.5});
    img.src='data:image/png;base64,'+b64;
  });
}

function textoKontrastRatio(fgHex, lum){
  const fg=luminancia(hexToRgb(fgHex));
  const L1=Math.max(fg,lum), L2=Math.min(fg,lum);
  return (L1+.05)/(L2+.05);
}

function analisarZonaTexto(b64, zone){
  return new Promise((resolve)=>{
    const img=new Image();
    img.onload=()=>{
      const canvas=document.createElement('canvas');canvas.width=96;canvas.height=96;
      const ctx=canvas.getContext('2d');
      const w=img.naturalWidth||1024,h=img.naturalHeight||1024;
      const map={
        left:{x:.055,y:.13,w:.50,h:.72},
        right:{x:.445,y:.13,w:.50,h:.72},
        center:{x:.14,y:.15,w:.72,h:.68}
      };
      const z=map[zone]||map.left;
      ctx.drawImage(img,z.x*w,z.y*h,z.w*w,z.h*h,0,0,96,96);
      const d=ctx.getImageData(0,0,96,96).data;
      const lums=[];
      for(let i=0;i<d.length;i+=4){
        const a=d[i+3]/255;if(a<.9)continue;
        lums.push(luminancia([d[i],d[i+1],d[i+2]]));
      }
      lums.sort((a,b)=>a-b);
      const n=lums.length||1;
      const q10=lums[Math.max(0,Math.floor((n-1)*.10))] ?? .7;
      const q50=lums[Math.max(0,Math.floor((n-1)*.50))] ?? .7;
      const q90=lums[Math.max(0,Math.floor((n-1)*.90))] ?? .7;
      const avg=lums.reduce((a,v)=>a+v,0)/n;
      const variance=lums.reduce((a,v)=>a+(v-avg)**2,0)/n;
      const homogeneity=Math.max(0,1-Math.sqrt(variance)*4);
      // Avaliamos o pior decil para evitar escolher uma cor que só funciona na média.
      const darkWorst=textoKontrastRatio(BRAND_INK, q90);
      const lightWorst=textoKontrastRatio(BRAND_CREAM, q10);
      const darkMedian=textoKontrastRatio(BRAND_INK, q50);
      const lightMedian=textoKontrastRatio(BRAND_CREAM, q50);
      const darkScore=Math.min(darkWorst,darkMedian);
      const lightScore=Math.min(lightWorst,lightMedian);
      const preferred=darkScore>=lightScore?'dark':'light';
      resolve({zone,avg,q10,q50,q90,homogeneity,darkWorst,lightWorst,darkScore,lightScore,preferred,best:Math.max(darkScore,lightScore)});
    };
    img.onerror=()=>resolve({zone,avg:.75,q10:.65,q50:.75,q90:.85,homogeneity:.5,darkWorst:6,lightWorst:1.5,darkScore:6,lightScore:1.5,preferred:'dark',best:6});
    img.src='data:image/png;base64,'+b64;
  });
}

function analisarZonaLogo(b64, pos){
  return new Promise((resolve)=>{
    const img=new Image();
    img.onload=()=>{
      const c=document.createElement('canvas');c.width=80;c.height=80;const ctx=c.getContext('2d');
      const w=img.naturalWidth||1024,h=img.naturalHeight||1024;
      const z=.28, pad=.035;
      const map={tr:{x:1-pad-z,y:pad},br:{x:1-pad-z,y:1-pad-z},tl:{x:pad,y:pad},bl:{x:pad,y:1-pad-z}};
      const q=map[pos]||map.br;
      ctx.drawImage(img,q.x*w,q.y*h,z*w,z*h,0,0,80,80);
      const d=ctx.getImageData(0,0,80,80).data;const l=[];
      for(let i=0;i<d.length;i+=4){if(d[i+3]>220)l.push(luminancia([d[i],d[i+1],d[i+2]]));}
      l.sort((a,b)=>a-b);const n=l.length||1;const q10=l[Math.max(0,Math.floor((n-1)*.10))]??.7;const q50=l[Math.max(0,Math.floor((n-1)*.5))]??.7;const q90=l[Math.max(0,Math.floor((n-1)*.9))]??.7;
      const variance=l.reduce((a,v)=>a+(v-q50)**2,0)/n;
      resolve({pos,avg:q50,q10,q90,homogeneity:Math.max(0,1-Math.sqrt(variance)*4)});
    };
    img.onerror=()=>resolve({pos,avg:.75,q10:.65,q90:.85,homogeneity:.5});
    img.src='data:image/png;base64,'+b64;
  });
}

async function escolherLayoutEditorial(imagens){
  const textCandidates=['left','right','center'];
  let bestText=null;
  for(const zone of textCandidates){
    const stats=await Promise.all(imagens.map(b=>analisarZonaTexto(b,zone)));
    const darkMin=Math.min(...stats.map(z=>z.darkScore));
    const lightMin=Math.min(...stats.map(z=>z.lightScore));
    const darkAvg=stats.reduce((a,z)=>a+z.darkScore,0)/stats.length;
    const lightAvg=stats.reduce((a,z)=>a+z.lightScore,0)/stats.length;
    const avgHom=stats.reduce((a,z)=>a+z.homogeneity,0)/stats.length;
    // Primeiro tentamos garantir contraste WCAG-ish em todos os slides; só depois usamos estética.
    const darkPass=stats.every(z=>z.darkScore>=4.5);
    const lightPass=stats.every(z=>z.lightScore>=4.5);
    const viable=[];
    if(darkPass)viable.push({color:BRAND_INK,min:darkMin,avg:darkAvg});
    if(lightPass)viable.push({color:BRAND_CREAM,min:lightMin,avg:lightAvg});
    let choice;
    if(viable.length){
      choice=viable.sort((a,b)=>b.min-a.min || b.avg-a.avg)[0];
    }else{
      // Se nenhuma cor passa em todos, escolhemos a mais segura no pior slide.
      choice=darkMin>=lightMin?{color:BRAND_INK,min:darkMin,avg:darkAvg}:{color:BRAND_CREAM,min:lightMin,avg:lightAvg};
    }
    const negativeSpace=stats.reduce((a,z)=>a+z.homogeneity,0)/stats.length;
    const preference=zone==='left'?0.12:(zone==='right'?0.03:0);
    const score=Math.min(choice.min,12)*.62+Math.min(choice.avg,12)*.18+negativeSpace*.14+preference;
    if(!bestText||score>bestText.score)bestText={zone,score,stats,textColor:choice.color,minContrast:choice.min,avgContrast:choice.avg};
  }

  // A logo pode mudar de canto conforme a composição, mas dentro de um carrossel a escolha é única.
  const logoCandidates=['tr','br','tl','bl'];
  let bestLogo=null;
  for(const pos of logoCandidates){
    const zones=await Promise.all(imagens.map(b=>analisarZonaLogo(b,pos)));
    const darkScores=zones.map(z=>textoKontrastRatio(BRAND_DEEP,z.q90));
    const lightScores=zones.map(z=>textoKontrastRatio(BRAND_CREAM,z.q10));
    const darkMin=Math.min(...darkScores), lightMin=Math.min(...lightScores);
    const useDark=darkMin>=lightMin;
    const logoColor=useDark?BRAND_DEEP:BRAND_CREAM;
    const contrast=useDark?darkMin:lightMin;
    const hom=zones.reduce((a,z)=>a+z.homogeneity,0)/zones.length;
    const away=(bestText.zone==='left'&&(pos==='tr'||pos==='br'))||(bestText.zone==='right'&&(pos==='tl'||pos==='bl'))?0.22:0;
    const score=Math.min(contrast,12)*.68+hom*.18+away*.14;
    if(!bestLogo||score>bestLogo.score)bestLogo={position:pos,color:logoColor,score,contrast};
  }

  return {
    textZone:bestText.zone,
    textColor:bestText.textColor,
    logoPosition:bestLogo.position,
    logoColor:bestLogo.color,
    textContrast:bestText.minContrast,
    logoContrast:bestLogo.contrast
  };
}

async function aplicarLogoPost(b64, corPreferida, pageInfo=null, logoLayout=null){
  return new Promise((resolve,reject)=>{
    const base=new Image(),logo=new Image();
    base.onload=()=>{logo.onload=()=>{
      const canvas=document.createElement('canvas');canvas.width=base.naturalWidth||1024;canvas.height=base.naturalHeight||1024;const ctx=canvas.getContext('2d');
      ctx.drawImage(base,0,0,canvas.width,canvas.height);
      const targetW=Math.min(canvas.width*.23,230),targetH=targetW*(logo.naturalHeight/logo.naturalWidth),pad=Math.max(18,Math.round(canvas.width*.025));
      const pos=logoLayout?.logoPosition||'br';
      let x=pad,y=pad;
      if(pos==='tr'){x=canvas.width-targetW-pad;y=pad;}
      if(pos==='br'){x=canvas.width-targetW-pad;y=canvas.height-targetH-pad;}
      if(pos==='bl'){x=pad;y=canvas.height-targetH-pad;}
      const off=document.createElement('canvas');off.width=logo.naturalWidth;off.height=logo.naturalHeight;const octx=off.getContext('2d');octx.drawImage(logo,0,0);
      const px=octx.getImageData(0,0,off.width,off.height),hex=corPreferida||BRAND_DEEP,rr=parseInt(hex.slice(1,3),16),gg=parseInt(hex.slice(3,5),16),bb=parseInt(hex.slice(5,7),16);
      for(let i=0;i<px.data.length;i+=4){if(px.data[i+3]>0){px.data[i]=rr;px.data[i+1]=gg;px.data[i+2]=bb;}}octx.putImageData(px,0,0);
      ctx.drawImage(off,x,y,targetW,targetH);
      if(pageInfo?.current && pageInfo?.total){
        const label=`${pageInfo.current}/${pageInfo.total}`;ctx.save();
        ctx.font='600 '+Math.max(18,Math.round(canvas.width*.026))+'px "Source Sans 3", sans-serif';ctx.textAlign='left';ctx.textBaseline='bottom';
        const margin=Math.max(18,Math.round(canvas.width*.04));ctx.fillStyle=logoLayout?.textColor||BRAND_INK;ctx.fillText(label,margin,canvas.height-margin);ctx.restore();
      }
      resolve(canvas.toDataURL('image/png').split(',')[1]);
    };logo.onerror=reject;logo.src='/assets/logo-jaqueline-dark.png';};base.onerror=reject;base.src='data:image/png;base64,'+b64;
  });
}

function desenharVéuEditorial(ctx,canvas,zone,textColor){
  const zones={left:{x:.045,y:.12,w:.55,h:.76},right:{x:.405,y:.12,w:.55,h:.76},center:{x:.12,y:.13,w:.76,h:.72}};
  const z=zones[zone]||zones.left;
  const x=z.x*canvas.width,y=z.y*canvas.height,w=z.w*canvas.width,h=z.h*canvas.height;
  const grad=ctx.createLinearGradient(x,y,x+w,y);
  if(textColor===BRAND_CREAM){
    grad.addColorStop(0,'rgba(58,64,50,.88)');grad.addColorStop(.55,'rgba(58,64,50,.62)');grad.addColorStop(1,'rgba(58,64,50,.12)');
  }else{
    grad.addColorStop(0,'rgba(244,241,232,.96)');grad.addColorStop(.55,'rgba(244,241,232,.78)');grad.addColorStop(1,'rgba(244,241,232,.16)');
  }
  ctx.save();ctx.fillStyle=grad;ctx.fillRect(x,y,w,h);ctx.restore();
  return {x:x+w*.10,y:y+h*.15,w:w*.74};
}

function desenharTextoArte(b64,slideText,titulo,isCarousel,index,total,editorialLayout){
  return new Promise((resolve,reject)=>{
    const img=new Image();img.onload=async()=>{
      try{await document.fonts.ready;}catch(_e){}
      const canvas=document.createElement('canvas');canvas.width=img.naturalWidth||1024;canvas.height=img.naturalHeight||1024;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,canvas.width,canvas.height);
      const layout=editorialLayout||{textZone:'left',textColor:BRAND_INK,textContrast:5};
      const fg=layout.textColor||BRAND_INK;
      const accent=fg===BRAND_CREAM?BRAND_CREAM:BRAND_SAGE;
      const box=desenharVéuEditorial(ctx,canvas,layout.textZone,fg);
      const maxW=Math.round(box.w),marginX=box.x;ctx.textAlign='left';ctx.textBaseline='top';
      // A cor do texto é deliberadamente independente da cor da logo.
      // Verde/sage só entra como destaque quando mantém contraste suficiente.
      if(isCarousel&&index===0){
        const titleColor=textoKontrastRatio(BRAND_SAGE, layout.textColor===BRAND_CREAM ? .15 : .92)>=4.5?BRAND_SAGE:fg;
        ctx.fillStyle=titleColor;ctx.font=`700 ${Math.round(canvas.width*.064)}px "Newsreader", serif`;
        const titleLines=wrapText(ctx,titulo,maxW);let y=box.y;titleLines.slice(0,4).forEach(line=>{ctx.fillText(line,marginX,y);y+=Math.round(canvas.width*.074);});
        ctx.fillStyle=fg;ctx.font=`500 ${Math.round(canvas.width*.032)}px "Source Sans 3", sans-serif`;const sub=wrapText(ctx,slideText,maxW);y+=Math.round(canvas.width*.018);sub.slice(0,8).forEach(line=>{ctx.fillText(line,marginX,y);y+=Math.round(canvas.width*.043);});
      }else{
        ctx.fillStyle=fg;ctx.font=`600 ${Math.round(canvas.width*.048)}px "Newsreader", serif`;
        const lines=wrapText(ctx,slideText,maxW);let y=box.y;lines.slice(0,10).forEach(line=>{ctx.fillText(line,marginX,y);y+=Math.round(canvas.width*.057);});
      }
      resolve(canvas.toDataURL('image/png').split(',')[1]);
    };img.onerror=reject;img.src='data:image/png;base64,'+b64;
  });
}

async function salvarPost(){
  if(!_postAtual){toast('Gere um post primeiro.');return;}
  try{
    const payload={
      titulo:_postAtual.titulo||_postAtual.tema,tema:_postAtual.tema,
      formato:_postAtual.formato,publico:_postAtual.publico,
      legenda:_postAtual.legenda||'',hashtags:(_postAtual.hashtags||[]).join(' '),
      cta:_postAtual.cta||'',img_b64:_postAtual.img_b64||null,imagens_b64:_postAtual.imagens_b64||[],logo_cor:_postAtual.logo_cor||'',prompt:_postAtual.prompt||'',
      fonte_tendencia:_postAtual.fonte_tendencia||'',tendencia:(_postAtual.faixa?`[${_postAtual.faixa}] `:'')+ (document.getElementById('post-contexto').value||''),
      status:'rascunho',logo_posicao:_postAtual.logo_posicao||'',logo_contraste:_postAtual.logo_contraste||'',texto_posicao:_postAtual.texto_posicao||'',texto_cor:_postAtual.texto_cor||'',texto_contraste:_postAtual.texto_contraste||'',criado_em:new Date().toISOString()
    };
    const r=await fetch('/api/data?table=posts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(!r.ok)throw new Error('Falha ao salvar');
    await carregarPostsSalvos();
    limparPost();
    toast('✅ Post salvo como rascunho.');
  }catch(e){toast('Erro ao salvar post: '+e.message);}
}

async function carregarPostsSalvos(){
  const el=document.getElementById('posts-history');if(!el)return;
  try{
    const r=await fetch('/api/data?table=posts');const rows=r.ok?await r.json():[];
    if(!rows.length){el.innerHTML='<div class="alert-empty">Nenhum post salvo ainda.</div>';return;}
    el.innerHTML=rows.slice(0,12).map(p=>`<div class="alert-item">
      <span><strong>${p.titulo}</strong><br><small>${p.formato||'Post'} · ${new Date(p.criado_em).toLocaleDateString('pt-BR')}</small></span>
      <span class="alert-badge alert-yellow">${p.status||'rascunho'}</span>
    </div>`).join('');
  }catch(e){el.innerHTML='<div class="alert-empty">Salve o schema novo para ativar o histórico de posts.</div>';}
}

function limparPost(){
  _postAtual=null;
  ['post-tema','post-contexto'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('post-preview-card').style.display='none';
  document.getElementById('post-img-wrap').innerHTML='<div class="preview-placeholder">A arte será gerada depois que o conteúdo for aprovado.</div>';
}

// ══════════════════════════════════════════════════════════
// MÓDULO PRONTUÁRIOS (persistido no Supabase)
// ══════════════════════════════════════════════════════════
let _prontuarios = {}; // { paciente_id: { label, nome, ativo, sessoes: [...] } }
let _pacAtual    = null;
let _pacientesById = {};
let _recognition = null;
let _gravando    = false;

async function initProntuarios() {
  document.getElementById('pront-pac-grid').innerHTML =
    '<div class="inline-loading"><div class="inline-spinner"></div> Carregando prontuários...</div>';

  await carregarPacientes();
  preencherDropdownProntuarios();
  setDataHoje();
  await carregarProntuarios();
}

async function carregarPacientes() {
  try {
    const res = await fetch('/api/data?table=pacientes');
    if (!res.ok) throw new Error('Tabela de pacientes indisponível');
    const rows = await res.json();
    _pacientesById = {};
    rows.forEach(p => { _pacientesById[p.id] = p; });
  } catch(e) {
    console.warn(e);
    _pacientesById = {};
    // Fallback temporário: permite usar o dashboard mesmo antes do schema novo.
    (_ativosArr || []).forEach(r => {
      _pacientesById['legacy:'+r._paciente] = {
        id:'legacy:'+r._paciente, nome:r._paciente, ativo:true,
        ultima_chave:r._paciente,
        ultimo_label:(r._horario ? r._horario+' | ' : '')+(r._iniciais||r._paciente)
      };
    });
  }
}

function preencherDropdownProntuarios() {
  const sel = document.getElementById('pront-pac');
  sel.innerHTML = '<option value="">Selecione...</option>';
  const ativos = Object.values(_pacientesById).filter(p => p.ativo);
  const ordem = {'seg':0,'ter':1,'qua':2,'qui':3,'sex':4,'sab':5,'dom':6};
  function dia(h){h=(h||'').toLowerCase();for(const[d,o] of Object.entries(ordem))if(h.startsWith(d))return o;return 99;}
  function hora(h){const m=(h||'').match(/(\d{1,2})h(\d{0,2})/);return m?+m[1]*60+(+m[2]||0):9999;}
  ativos.sort((a,b)=>dia(a.ultimo_label)-dia(b.ultimo_label)||hora(a.ultimo_label)-hora(b.ultimo_label))
    .forEach(p => {
      const label=p.ultimo_label || p.nome;
      sel.innerHTML += `<option value="${p.id}" data-patient-key="${p.ultima_chave||p.nome}" data-label="${label}">${label}</option>`;
    });
}

async function carregarProntuarios() {
  try {
    const res = await fetch('/api/data?table=prontuarios');
    const rows = res.ok ? await res.json() : [];
    _prontuarios = {};

    const migracoes = [];
    rows.forEach(r => {
      let pid = r.paciente_id;
      if (!pid) {
        const p = Object.values(_pacientesById).find(x =>
          x.nome === r.paciente_key || x.ultima_chave === r.paciente_key
        );
        if (p && !String(p.id).startsWith('legacy:')) {
          pid = p.id;
          migracoes.push({id:r.id, paciente_id:pid});
        }
      }
      pid = pid || 'legacy:'+r.paciente_key;
      if (!_prontuarios[pid]) {
        const p = _pacientesById[pid];
        _prontuarios[pid] = {
          label: r.paciente_label,
          nome: p?.nome || r.paciente_key,
          ativo: p ? !!p.ativo : false,
          sessoes:[]
        };
      }
      _prontuarios[pid].sessoes.push({
        id:r.id, data:r.data_sessao, relato:r.relato,
        paciente_key:r.paciente_key
      });
    });
    Object.values(_prontuarios).forEach(p=>p.sessoes.sort((a,b)=>a.data.localeCompare(b.data)));

    // Migra registros antigos silenciosamente para o ID permanente.
    for (const m of migracoes) {
      await fetch(`/api/data?table=prontuarios&id=${encodeURIComponent(m.id)}`, {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({paciente_id:m.paciente_id})
      }).catch(()=>{});
    }

    renderGridPacientes();
    renderBuscaProntuario();
    if(Object.keys(_prontuarios).length && document.getElementById('pront-view').style.display!=='block') {
      document.getElementById('pront-empty').style.display='none';
    } else if(!Object.keys(_prontuarios).length) {
      mostrarEmpty();
    }
  } catch(e) {
    console.error(e);
    _prontuarios = {};
    renderGridPacientes();
    renderBuscaProntuario();
  }
}

function renderBuscaProntuario() {
  const sel=document.getElementById('pront-busca');
  if (!sel) return;
  sel.innerHTML='<option value="">Todos os pacientes com prontuário...</option>';
  Object.entries(_prontuarios)
    .sort((a,b)=>(a[1].label||a[0]).localeCompare(b[1].label||b[0]))
    .forEach(([id,p])=>{
      sel.innerHTML += `<option value="${id}">${p.label||p.nome}${p.ativo===false?' · inativo':''}</option>`;
    });
}


function renderGridPacientes() {
  const container = document.getElementById('pront-pac-grid');
  if (!container) return;
  const entries = Object.entries(_prontuarios);
  document.getElementById('pront-lib-count').textContent = entries.length ? `(${entries.length})` : '';
  if (!entries.length) { container.innerHTML = ''; mostrarEmpty(); return; }
  container.innerHTML = entries
    .sort((a,b)=>(a[1].label||a[0]).localeCompare(b[1].label||b[0]))
    .map(([id,p]) => {
      const n=p.sessoes.length;
      const ativo=id===_pacAtual;
      const inativo=p.ativo===false;
      return `<div class="pront-lib-card ${ativo?'ativo':''}" onclick="verProntuario('${id}')">
        <div style="font-weight:500;font-size:.85rem;margin-bottom:4px;">${p.label||p.nome}</div>
        <div style="font-size:.72rem;color:var(--muted);">${n} sessão${n!==1?'ões':''} registrada${n!==1?'s':''}${inativo?' · inativo':''}</div>
      </div>`;
    }).join('');
}

function buscarPacienteProntuario(){
  const key=document.getElementById('pront-busca').value;
  if(key) verProntuario(key); else { _pacAtual=null; mostrarEmpty(); renderGridPacientes(); }
}
function limparBuscaProntuario(){
  document.getElementById('pront-busca').value='';
  _pacAtual=null; mostrarEmpty(); renderGridPacientes();
}
function mostrarEmpty(){
  const view=document.getElementById('pront-view'); const empty=document.getElementById('pront-empty');
  if(view)view.style.display='none';
  if(empty){empty.style.display='block';empty.innerHTML='<div style="font-size:36px;margin-bottom:12px;">📋</div><p style="font-size:.85rem;line-height:1.6;">Selecione um prontuário abaixo ou registre uma nova sessão acima.</p>';}
}
function setDataHoje(){
  const h=new Date(); const el=document.getElementById('pront-data');
  if(el) el.value=h.getFullYear()+'-'+String(h.getMonth()+1).padStart(2,'0')+'-'+String(h.getDate()).padStart(2,'0');
}

async function salvarSessao(){
  const pid=document.getElementById('pront-pac').value;
  const data=document.getElementById('pront-data').value;
  const relato=document.getElementById('pront-relato').value.trim();
  if(!pid){toast('Selecione um paciente.');return;}
  if(!data){toast('Selecione a data da sessão.');return;}
  if(!relato){toast('Digite ou grave o relato da sessão.');return;}
  const p=_pacientesById[pid];
  if(!p){toast('Paciente não encontrado. Atualize o dashboard e tente novamente.');return;}
  const sel=document.getElementById('pront-pac'); const opt=sel.options[sel.selectedIndex];
  const label=(opt?.getAttribute('data-label')||opt?.text||p.ultimo_label||p.nome||'').trim();
  if(!label){toast('Paciente sem identificação válida.');return;}
  const existente=_prontuarios[pid]?.sessoes.find(s=>s.data===data);
  try{
    if(existente){
      if(!confirm('Já existe um registro para essa data. Substituir?')) return;
      const r=await fetch(`/api/data?table=prontuarios&id=${encodeURIComponent(existente.id)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({relato,paciente_id:pid,paciente_label:label})});
      if(!r.ok)throw new Error('Falha ao atualizar o registro');
    }else{
      const r=await fetch('/api/data?table=prontuarios',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({paciente_id:pid,paciente_key:p.ultima_chave||p.nome,paciente_label:label,data_sessao:data,relato,criado_em:new Date().toISOString()})});
      if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.error?.message||e.error||'Falha ao salvar');}
    }
    await carregarProntuarios();
    // Após salvar, o formulário e a seleção voltam ao estado inicial para o próximo registro.
    limparFormPront();
    document.getElementById('pront-busca').value='';
    _pacAtual=null;
    renderGridPacientes();
    mostrarEmpty();
    toast('✅ Sessão salva! O formulário está pronto para o próximo registro.');
  }catch(e){console.error(e);toast('Erro ao salvar: '+e.message);}
}

function verProntuario(id){
  _pacAtual=id; const p=_prontuarios[id]; if(!p)return;
  document.getElementById('pront-view').style.display='block';
  document.getElementById('pront-empty').style.display='none';
  document.getElementById('pront-view-titulo').textContent='📋 '+(p.label||p.nome||'Prontuário')+(p.ativo===false?' · inativo':'');
  const tbody=document.getElementById('pront-tabela'); tbody.innerHTML='';
  [...p.sessoes].sort((a,b)=>b.data.localeCompare(a.data)).forEach((s,i)=>{
    const [y,m,d]=s.data.split('-');
    tbody.innerHTML+=`<tr style="border-bottom:1px solid var(--border);${i%2===1?'background:#fafaf8':''}">
      <td style="padding:10px 14px;color:var(--muted);font-size:.78rem;white-space:nowrap;vertical-align:top;">${d}/${m}/${y}</td>
      <td style="padding:10px 14px;line-height:1.6;vertical-align:top;">${String(s.relato||'').replace(/\n/g,'<br>')}</td>
      <td style="padding:10px 14px;vertical-align:top;text-align:right;"><button onclick="deletarSessao('${s.id}','${id}')" title="Excluir registro" style="font-size:.72rem;color:var(--danger);background:#fdecea;border:1px solid #f5c6c2;border-radius:4px;padding:2px 7px;cursor:pointer;white-space:nowrap;">✕ excluir</button></td>
    </tr>`;
  });
  document.getElementById('pront-busca').value=id;
  renderGridPacientes();
}
function selecionarPaciente(){
  const id=document.getElementById('pront-pac').value;
  if(!id){_pacAtual=null;mostrarEmpty();renderGridPacientes();return;}
  if(_prontuarios[id]) verProntuario(id);
  else { _pacAtual=id; document.getElementById('pront-view').style.display='none'; document.getElementById('pront-empty').style.display='block'; document.getElementById('pront-empty').innerHTML='<div style="font-size:36px;margin-bottom:12px;">📋</div><p style="font-size:.85rem;line-height:1.6;">Nenhuma sessão registrada para este paciente ainda.<br>Preencha o relato acima e clique em <strong>Salvar sessão</strong>.</p>'; renderGridPacientes(); }
}
function limparFormPront(){
  document.getElementById('pront-pac').value='';
  document.getElementById('pront-relato').value='';
  document.getElementById('rec-status').textContent='';
  document.getElementById('btn-gravar').innerHTML='🎙 Gravar relato';
  setDataHoje();
  _gravando=false;
}
async function deletarSessao(id,pid){
  if(!confirm('Excluir este registro?'))return;
  try{
    const r=await fetch(`/api/data?table=prontuarios&id=${encodeURIComponent(id)}`,{method:'DELETE'});
    if(!r.ok)throw new Error('Falha ao excluir');
    await carregarProntuarios();
    if(_prontuarios[pid]) verProntuario(pid); else { _pacAtual=null; mostrarEmpty(); }
    toast('Registro excluído.');
  }catch(e){toast('Erro ao excluir: '+e.message);}
}

// ── Gravação → transcrição// ── Gravação → transcrição via Web Speech API ─────────────────────────────────
async function toggleGravacao() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast('Reconhecimento de voz não suportado. Use Chrome ou Safari.'); return; }
  if (_gravando) { _recognition.stop(); return; }

  _recognition = new SR();
  _recognition.lang            = 'pt-BR';
  _recognition.continuous      = true;
  _recognition.interimResults  = true;
  _recognition.maxAlternatives = 1;

  const relato    = document.getElementById('pront-relato');
  const textoBase = relato.value;
  let   acumulado = '';

  _recognition.onstart = () => {
    _gravando = true;
    document.getElementById('btn-gravar').innerHTML = '⏹ Parar gravação';
    document.getElementById('rec-status').textContent = '● Gravando — fale agora...';
  };
  _recognition.onresult = e => {
    let interim = '', final = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      e.results[i].isFinal ? (final += e.results[i][0].transcript + ' ') : (interim += e.results[i][0].transcript);
    }
    acumulado += final;
    const sep = textoBase && acumulado ? '\n' : '';
    relato.value = textoBase + sep + acumulado + interim;
    if (interim) document.getElementById('rec-status').textContent = '● ' + interim;
  };
  _recognition.onerror = e => {
    _gravando = false;
    document.getElementById('btn-gravar').innerHTML = '🎙 Gravar relato';
    document.getElementById('rec-status').textContent = '';
    toast('Erro no microfone: ' + e.error);
  };
  _recognition.onend = () => {
    _gravando = false;
    document.getElementById('btn-gravar').innerHTML = '🎙 Gravar relato';
    document.getElementById('rec-status').textContent = acumulado ? '✅ Transcrição concluída' : '';
    if (acumulado) relato.value = textoBase + (textoBase ? '\n' : '') + acumulado.trim();
  };
  _recognition.start();
}

// ── Exportar PDF ──────────────────────────────────────────────────────────────
function exportarProntPDF() {
  const p = _pacAtual && _prontuarios[_pacAtual];
  if (!p) return;
  const linhas = [...p.sessoes].sort((a,b)=>a.data.localeCompare(b.data)).map(s => {
    const [y,m,d] = s.data.split('-');
    return `<tr>
      <td style="padding:8px 12px;border:1px solid #ddd;white-space:nowrap;vertical-align:top;color:#555;font-size:12px;">${d}/${m}/${y}</td>
      <td style="padding:8px 12px;border:1px solid #ddd;line-height:1.6;font-size:12px;">${s.relato.replace(/\n/g,'<br>')}</td>
    </tr>`;
  }).join('');

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Prontuário — ${p.label}</title>
    <style>body{font-family:'Georgia',serif;margin:40px;color:#2a2a2a;}h1{font-size:16px;margin-bottom:4px;}.sub{font-size:11px;color:#888;margin-bottom:20px;}table{width:100%;border-collapse:collapse;}th{background:#d6ccb0;padding:8px 12px;text-align:left;font-size:11px;border:1px solid #ddd;}@media print{body{margin:20px;}}</style>
  </head><body>
    <h1>🌻 Prontuário — ${p.label}</h1>
    <p class="sub">Psicóloga Jaqueline C. Vieira &nbsp;|&nbsp; CRP 06/191478 &nbsp;|&nbsp; Gerado em ${new Date().toLocaleDateString('pt-BR')}</p>
    <table><thead><tr><th style="width:100px;">Data</th><th>Relato da sessão</th></tr></thead><tbody>${linhas}</tbody></table>
    <script>window.onload=()=>{window.print();}<\/script>
  </body></html>`);
  win.document.close();
}

// ── Exportar Word ─────────────────────────────────────────────────────────────
function exportarProntDOCX() {
  const p = _pacAtual && _prontuarios[_pacAtual];
  if (!p) return;
  const linhas = [...p.sessoes].sort((a,b)=>a.data.localeCompare(b.data)).map(s => {
    const [y,m,d] = s.data.split('-');
    return `<tr>
      <td style="border:1px solid #ccc;padding:6pt;width:80pt;vertical-align:top;">${d}/${m}/${y}</td>
      <td style="border:1px solid #ccc;padding:6pt;vertical-align:top;">${s.relato.replace(/\n/g,'<br>')}</td>
    </tr>`;
  }).join('');

  const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
  <head><meta charset='utf-8'><title>Prontuário</title>
  <style>body{font-family:Calibri,sans-serif;font-size:11pt;margin:2cm;}h1{font-size:14pt;color:#3a3020;}p{font-size:9pt;color:#888;}table{width:100%;border-collapse:collapse;margin-top:16pt;}th{background:#d6ccb0;padding:6pt;font-size:10pt;border:1px solid #ccc;text-align:left;}</style>
  </head><body>
    <h1>🌻 Prontuário — ${p.label}</h1>
    <p>Psicóloga Jaqueline C. Vieira | CRP 06/191478 | Gerado em ${new Date().toLocaleDateString('pt-BR')}</p>
    <table><thead><tr><th style="width:80pt;">Data</th><th>Relato da sessão</th></tr></thead><tbody>${linhas}</tbody></table>
  </body></html>`;

  const blob = new Blob([html], { type: 'application/msword' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `prontuario_${(p.label||_pacAtual).replace(/[^a-zA-Z0-9]/g,'_')}.doc`;
  a.click();
  URL.revokeObjectURL(url);
}

// ══════════════════════════════════════════════════════════
// Toast + Tab switching (comum)
// ══════════════════════════════════════════════════════════
function toast(msg, dur=3000) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'), dur);
}

function switchTab(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.getElementById('tab-btn-' + name).classList.add('active');
  if (name === 'atividades' && !window._ativInit) {
    window._ativInit = true;
    initAtividades();
  }
  if (name === 'prontuarios' && !window._prontInit) {
    window._prontInit = true;
    initProntuarios();
  }
}

window.onload = loadData;
