// Service worker do PWA. Só cacheia a casca estática do app (HTML/ícones/manifest);
// nunca intercepta /api/* -- dados financeiros e clínicos têm que vir sempre
// direto do servidor, nunca de um cache que pode ficar desatualizado ou
// vazar dado de uma sessão pra outra.
const CACHE_NAME = 'dashboard-psi-shell-v1';
const SHELL_URLS = ['/', '/manifest.json', '/assets/pwa/icon-192.png', '/assets/pwa/icon-512.png'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Network-first: sempre tenta buscar a versão mais nova; só cai pro cache
  // (última versão vista) se estiver offline.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('/')))
  );
});
