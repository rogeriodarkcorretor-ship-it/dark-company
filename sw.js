// Service worker mínimo — necessário para o navegador permitir
// "Instalar" o app (o que cria o ícone no PC / tela inicial).
const CACHE = 'dark-company-shell-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
