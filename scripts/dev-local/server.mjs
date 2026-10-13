// SOMENTE TESTE LOCAL: sobe o app em http://localhost:3100 sem autenticação, sem Supabase e com OpenAI simulada.
// Uso: node scripts/dev-local/server.mjs  (PDF usa o Chrome instalado; ajuste CHROME_PATH se preciso)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
process.env.AUTH_STUB = path.join(here, 'auth-stub.mjs');
process.env.OPENAI_KEY = 'fake-local';
process.env.CHROMIUM_STUB = path.join(here, 'chromium-stub.mjs');
process.env.CHROME_PATH ??= 'C:/Program Files/Google/Chrome/Application/chrome.exe';
register(pathToFileURL(path.join(here, 'hooks.mjs')));
const sharp = (await import(pathToFileURL(path.join(root, 'node_modules/sharp/lib/index.js')).href)).default;

// OpenAI simulada: texto gera valores a partir do json_schema; imagem devolve um PNG gradiente.
let n = 0;
const fill = (s) => s?.type === 'object' ? Object.fromEntries(Object.entries(s.properties || {}).map(([k, v]) => [k, fill(v)]))
  : s?.type === 'array' ? Array.from({ length: Math.max(s.minItems || 1, Math.min(s.maxItems || 6, 6)) }, (_, i) => fill(s.items))
  : s?.type === 'number' || s?.type === 'integer' ? 1 : s?.type === 'boolean' ? true : `Texto simulado ${++n}`;
async function png() {
  const c = [['#f6d365', '#fda085'], ['#a1c4fd', '#c2e9fb'], ['#d4fc79', '#96e6a1']][n++ % 3];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><defs><linearGradient id="g"><stop offset="0" stop-color="${c[0]}"/><stop offset="1" stop-color="${c[1]}"/></linearGradient></defs><rect width="1024" height="1024" fill="url(#g)"/><text x="512" y="512" font-size="64" text-anchor="middle" font-family="sans-serif">IMAGEM SIMULADA ${n}</text></svg>`;
  return (await sharp(Buffer.from(svg)).png().toBuffer()).toString('base64');
}
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (!u.startsWith('https://api.openai.com/')) return realFetch(url, opts);
  const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
  await new Promise(r => setTimeout(r, 400));
  if (u.includes('/images/')) return json({ data: [{ b64_json: await png() }], usage: { input_tokens: 1, output_tokens: 1 } });
  if (u.includes('/chat/completions')) {
    let schema; try { schema = JSON.parse(opts.body).response_format?.json_schema?.schema; } catch {}
    const content = schema ? JSON.stringify(fill(schema)) : 'Resposta simulada';
    return json({ choices: [{ message: { content } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
  }
  return json({});
};

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.css': 'text/css' };
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const raw = Buffer.concat(chunks).toString();
      req.query = Object.fromEntries(url.searchParams);
      try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; }
      res.status = (c) => { res.statusCode = c; return res; };
      res.send = (b) => { res.end(b); return res; };
      res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); return res; };
      const file = path.join(root, url.pathname.replace(/\/$/, '') + '.js');
      const mod = await import(pathToFileURL(file).href);
      return await mod.default(req, res);
    }
    let p = url.pathname === '/' ? '/index.html' : url.pathname;
    const buf = await readFile(path.join(root, decodeURIComponent(p)));
    res.setHeader('Content-Type', types[path.extname(p)] || 'application/octet-stream'); res.end(buf);
  } catch (e) { res.statusCode = e.code === 'ENOENT' ? 404 : 500; res.end(String(e.message)); }
}).listen(3100, () => console.log('dev-local em http://localhost:3100'));
