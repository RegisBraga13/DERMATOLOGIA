// Cache so da CASCA do app (HTML/CSS/JS estaticos) -- nunca de /api/*. Uma
// resposta clinica ou de IA servida do cache pareceria atual sem ser, e isso
// e pior que o app avisar "sem sinal". A casca em cache so garante que a
// TELA abre offline; prontuario e sintese continuam exigindo rede.
const CACHE_NAME = "prontuario-shell-v7";
const CORE_SHELL = [
  "/",
  "/index.html",
  "/src/App.js",
  "/src/styles/theme.css",
  "/src/styles/responsive.css"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

// Stale-while-revalidate: responde do cache na hora (abre offline sem
// esperar timeout de rede) e atualiza o cache em segundo plano quando ha
// sinal, para o codigo nao ficar preso na primeira versao para sempre.
self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then(response => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => null);
      return cached || (await network) || Response.error();
    })
  );
});
