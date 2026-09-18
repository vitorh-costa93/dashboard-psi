#!/usr/bin/env node
// Apaga deploys antigos retidos na Vercel, de TODOS os projetos do time,
// mantendo os N mais recentes (padrao 4) + o de producao + qualquer deploy
// servindo um dominio real (alias .vercel.app publico ou git-main). O plano Hobby nao tem nenhum controle nativo de retencao de
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
const MANTER = Number(process.env.DEPLOYMENTS_TO_KEEP || 4);

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

async function listarProjetos() {
  const data = await vercelFetch('/v9/projects?limit=100');
  return data.projects.map((p) => ({ id: p.id, name: p.name, producaoId: p.targets?.production?.id }));
}

async function listarDeployments(projectId) {
  const deployments = [];
  let until;
  for (;;) {
    const params = new URLSearchParams({ projectId, limit: '100' });
    if (until) params.set('until', String(until));
    const data = await vercelFetch(`/v6/deployments?${params}`);
    deployments.push(...data.deployments);
    if (!data.pagination?.next) break;
    until = data.pagination.next;
  }
  return deployments;
}

// Alias de branch de preview (-git-codex-..., -git-feat-...) NÃO protege nada;
// domínios reais (.vercel.app públicos, ex.: consultorio-jaqueline.vercel.app,
// que é o endereço dos links de formulário enviados a pacientes) e git-main sim.
// Esse alias específico é manual e pode apontar para um deploy que não é o
// mais recente -- apagá-lo derrubaria os links (DEPLOYMENT_NOT_FOUND).
async function deploymentsComDominioReal() {
  const data = await vercelFetch('/v4/aliases?limit=100');
  const protegido = (a) => !/-git-/.test(a.alias) || /-git-main-/.test(a.alias);
  return new Set(data.aliases.filter((a) => a.deployment?.id && protegido(a)).map((a) => a.deployment.id));
}

async function main() {
  const [projetos, comDominio] = await Promise.all([listarProjetos(), deploymentsComDominioReal()]);
  let falhas = 0;
  for (const projeto of projetos) {
    const todos = await listarDeployments(projeto.id);
    todos.sort((a, b) => b.created - a.created);
    const manter = new Set();
    if (projeto.producaoId) manter.add(projeto.producaoId);
    for (const d of todos) if (comDominio.has(d.uid)) manter.add(d.uid);
    for (const d of todos) {
      if (manter.size >= MANTER) break;
      manter.add(d.uid);
    }
    const apagar = todos.filter((d) => !manter.has(d.uid));
    console.log(`${projeto.name}: total ${todos.length} | mantendo ${manter.size} | apagando ${apagar.length}`);
    for (const d of apagar) {
      try {
        await vercelFetch(`/v13/deployments/${d.uid}`, { method: 'DELETE' });
      } catch (e) {
        falhas++;
        console.error(`Falha ao apagar ${d.uid} (${d.url}): ${e.message}`);
      }
    }
  }
  console.log(`Concluído. ${falhas} falhas.`);
  if (falhas > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
