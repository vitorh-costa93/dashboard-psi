// Wellz: plataforma online em que a psicóloga atende por repasse semanal.
// Em vez de um paciente por atendimento, existe um único "paciente" Wellz com
// uma linha por semana (referência: sexta-feira) e cinco quantidades. O valor
// é calculado aqui e só as quantidades são digitadas.
export const WELLZ_NOME = 'Wellz';

// Vale a partir daqui: antes disso só existe o valor mensal do histórico.
export const INICIO_SEMANAL = '2026-09-01';

export const TARIFAS = {faltas: 10, acolh_antes: 25, acolh_apos: 35, real_antes: 50, real_apos: 60};

export const TIPOS = [
  {key: 'faltas', label: 'Faltas', falta: true},
  {key: 'acolh_antes', label: 'Acolhimentos - Antes das 17h'},
  {key: 'acolh_apos', label: 'Acolhimentos - Após às 17h'},
  {key: 'real_antes', label: 'Realizados - Antes das 17h'},
  {key: 'real_apos', label: 'Realizados - Após às 17h'},
];

const pad = n => String(n).padStart(2, '0');
const brDate = iso => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const round2 = n => Math.round(n * 100) / 100;

export function quantidade(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 999) throw new Error('Quantidade inválida (use inteiros de 0 a 999)');
  return n;
}

export function valorSemana(contagens, tarifas = TARIFAS) {
  return round2(TIPOS.reduce((s, t) => s + (Number(contagens?.[t.key]) || 0) * tarifas[t.key], 0));
}

export function ehSexta(iso) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(iso)) && new Date(iso + 'T12:00:00Z').getUTCDay() === 5;
}

// Todas as sextas do mês ("YYYY-MM"), respeitando o início do lançamento semanal.
export function sextasDoMes(month, inicio = null) {
  const [y, m] = month.split('-').map(Number), out = [];
  for (let d = 1, n = new Date(Date.UTC(y, m, 0)).getUTCDate(); d <= n; d++) {
    const iso = `${y}-${pad(m)}-${pad(d)}`;
    if (ehSexta(iso) && (!inicio || iso >= inicio)) out.push(iso);
  }
  return out;
}

const ultimoDia = mes => { const [y, m] = mes.split('-').map(Number); return `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`; };

function linhaBase(paciente, iso) {
  return {
    'Data': brDate(iso), 'Paciente': paciente, 'Gênero': '', 'Faixa Etária': '', 'Modalidade': 'Online',
    'Convênio': WELLZ_NOME, 'Horário': '', 'Ativo': '', 'Motivo': '', 'CNPJ?': 'Sim', 'Wellz': true,
  };
}

// Linhas no formato do dashboard: uma por atendimento (falta ou realizado), para
// que faltas, sessões e valor recebido passem pelos mesmos cálculos de sempre.
// O histórico mensal vira linhas só de valor, divididas entre as sextas do mês
// (não contam como sessão nem como falta).
export function linhasDashboard(semanas, historico, tarifas = TARIFAS) {
  const rows = [];
  for (const s of semanas) {
    for (const t of TIPOS) {
      const valor = tarifas[t.key];
      for (let i = 0; i < (Number(s[t.key]) || 0); i++) {
        rows.push({
          ...linhaBase(WELLZ_NOME, s.semana_ref), 'Valor da sessão': valor, 'Sessões cobradas': 1,
          'Valor total': valor, 'Valor final': valor, 'Comparecimento': t.falta ? 'Não' : 'Sim', 'Comentário': t.label,
        });
      }
    }
  }
  for (const h of historico) {
    const mes = String(h.mes).slice(0, 7), sextas = sextasDoMes(mes), total = Number(h.valor) || 0;
    if (!sextas.length || !total) continue;
    let restante = round2(total);
    sextas.forEach((iso, i) => {
      const parte = i === sextas.length - 1 ? restante : round2(total / sextas.length);
      restante = round2(restante - parte);
      rows.push({
        ...linhaBase(WELLZ_NOME, iso), 'Valor da sessão': 0, 'Sessões cobradas': 0, 'Valor total': parte, 'Valor final': parte,
        'Valor histórico': parte, 'Só valor': true, 'Comparecimento': '', 'Comentário': 'Histórico mensal Wellz',
      });
    });
  }
  return rows;
}

// Linhas resumidas para "Atendimentos — detalhado": uma por tipo e semana (com a
// quantidade) e uma por mês do histórico. Somente leitura.
export function linhasDetalhadas(semanas, historico, pacienteId, {month = '', tarifas = TARIFAS} = {}) {
  const dentro = iso => !month || String(iso).slice(0, 7) === month;
  const base = {paciente_id: pacienteId, horario: '', modalidade: 'Online', pacientes: {nome: WELLZ_NOME, ativo: true}, convenios: {nome: WELLZ_NOME}, wellz: true};
  const out = [];
  for (const s of semanas) {
    if (!dentro(s.semana_ref)) continue;
    for (const t of TIPOS) {
      const q = Number(s[t.key]) || 0;
      if (!q) continue;
      out.push({
        ...base, id: `wellz:${s.semana_ref}:${t.key}`, source_key: `wellz:${s.semana_ref}:${t.key}`, data_sessao: s.semana_ref,
        comparecimento: t.falta ? 'Não' : 'Sim', sessoes_cobradas: q, valor_sessao: tarifas[t.key],
        valor_final: round2(q * tarifas[t.key]), comentario: `${t.label} × ${q}`,
      });
    }
  }
  for (const h of historico) {
    const mes = String(h.mes).slice(0, 7);
    if (month && mes !== month) continue;
    out.push({
      ...base, id: `wellz:${mes}:historico`, source_key: `wellz:${mes}:historico`, data_sessao: ultimoDia(mes),
      comparecimento: 'Histórico', sessoes_cobradas: 0, valor_sessao: 0, valor_final: Number(h.valor) || 0, comentario: 'Valor mensal recebido (histórico)',
    });
  }
  return out;
}
