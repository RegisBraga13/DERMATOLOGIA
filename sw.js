// Cache so da CASCA do app (HTML/CSS/JS estaticos) -- nunca de /api/*. Uma
// resposta clinica ou de IA servida do cache pareceria atual sem ser, e isso
// e pior que o app avisar "sem sinal". A casca em cache so garante que a
// TELA abre offline; prontuario e sintese continuam exigindo rede.
const CACHE_NAME = "prontuario-shell-v8";
const CORE_SHELL = [
  "/",
  "/index.html",
  "/src/App.js",
  "/src/bootstrap.js",
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

// Com rede, entrega o código atual e os cabeçalhos de segurança atuais.
// Sem rede, usa a última casca salva; nenhuma resposta /api entra aqui.
self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          try { await cache.put(request, response.clone()); }
          catch { /* Cache cheio: entrega a resposta atual mesmo assim. */ }
        }
        return response;
      } catch {
        return await cache.match(request) || Response.error();
      }
    })
  );
});
