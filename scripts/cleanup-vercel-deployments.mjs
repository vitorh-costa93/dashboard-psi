#!/usr/bin/env node
// Apaga deploys antigos retidos na Vercel, mantendo so o de producao atual
// + as ultimas N-1 entregas mais recentes (margem de seguranca pra rollback
// rapido). O plano Hobby nao tem nenhum controle nativo de retencao de
// deploy -- sem isso, cada deploy fica guardado pra sempre e vai empurrando
// o uso de "Deployment Storage" pro limite gratuito de 10GB (foi o que
// gerou o alerta que motivou este script: 216 deploys acumulados em ~26
// dias de trabalho ativo).
//
// Rodado semanalmente via .github/workflows/cleanup-vercel-deployments.yml.
// Precisa de VERCEL_TOKEN com permissao sobre o projeto (guardado como
// secret do GitHub, nunca no repo).

const TOKEN = process.env.VERCEL_TOKEN;
const PROJECT_ID = process.env.VERCEL_PROJECT_ID || 'prj_Eztc3pNA9P7KYhTEJIhnymVIpeOa';
const TEAM_ID = process.env.VERCEL_TEAM_ID || 'team_5TOFRVNzimmU6aZE8ZvDyNwV';
const PRODUCTION_DOMAIN = process.env.VERCEL_PRODUCTION_DOMAIN || 'dashboard-psi-tau.vercel.app';
const MANTER = Number(process.env.DEPLOYMENTS_TO_KEEP || 5);

if (!TOKEN) {
  console.error('VERCEL_TOKEN não configurado.');
  process.exit(1);
}

async function vercelFetch(path, options = {}) {
  const url = new URL(`https://api.vercel.com${path}`);
  if (TEAM_ID) url.searchParams.set('teamId', TEAM_ID);
  const r = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`${options.method || 'GET'} ${path} -> ${r.status}: ${body.slice(0, 300)}`);
  }
  return r.status === 204 ? null : r.json();
}

async function listarTodosDeployments() {
  const deployments = [];
  let until;
  for (;;) {
    const params = new URLSearchParams({ projectId: PROJECT_ID, limit: '100' });
    if (until) params.set('until', String(until));
    const data = await vercelFetch(`/v6/deployments?${params}`);
    deployments.push(...data.deployments);
    if (!data.pagination?.next) break;
    until = data.pagination.next;
  }
  return deployments;
}

async function idDeploymentAtualDeProducao() {
  // Deployments lookup by any assigned domain -- retorna o deploy que esta
  // de fato servindo o dominio de producao agora, independente de qual
  // "target" ele carrega.
  const data = await vercelFetch(`/v13/deployments/${PRODUCTION_DOMAIN}`);
  return data.id || data.uid;
}

async function main() {
  const [todos, producaoId] = await Promise.all([listarTodosDeployments(), idDeploymentAtualDeProducao()]);
  todos.sort((a, b) => b.createdAt - a.createdAt);

  const manter = new Set([producaoId]);
  for (const d of todos) {
    if (manter.size >= MANTER) break;
    manter.add(d.uid);
  }

  const apagar = todos.filter((d) => !manter.has(d.uid));
  console.log(`Total: ${todos.length} | Mantendo: ${manter.size} | Apagando: ${apagar.length}`);

  let falhas = 0;
  for (const d of apagar) {
    try {
      await vercelFetch(`/v13/deployments/${d.uid}`, { method: 'DELETE' });
    } catch (e) {
      falhas++;
      console.error(`Falha ao apagar ${d.uid} (${d.url}): ${e.message}`);
    }
  }
  console.log(`Concluído. ${apagar.length - falhas} apagados, ${falhas} falhas.`);
  if (falhas > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
