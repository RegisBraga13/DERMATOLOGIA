// Casca em cache para abrir a tela sem rede; /api/* nunca entra no cache.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
