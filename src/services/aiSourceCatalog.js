// O servidor define quais acervos podem responder a cada etapa. Uma falha ao
// carregar este catálogo deixa a escolha indisponível, sem trocar de fonte.
let sources = null;
let pending = null;
let failed = false;

export async function loadAiSourceCatalog() {
  if (sources) return sources;
  if (pending) return pending;
  pending = (async () => {
    const response = await fetch("/api/ai-sources", { cache: "no-store" });
    if (!response.ok) throw new Error("Não foi possível carregar as fontes de IA.");
    const data = await response.json();
    const items = data?.sources;
    if (!Array.isArray(items) || items.length === 0) throw new Error("Catálogo de fontes de IA inválido.");
    const ids = new Set();
    for (const item of items) {
      if (!item || typeof item.id !== "string" || !/^[a-z][a-z0-9_-]*$/.test(item.id)
          || typeof item.label !== "string" || !item.label.trim()
          || !Array.isArray(item.kinds) || item.kinds.some(kind => typeof kind !== "string")
          || ids.has(item.id)) {
        throw new Error("Catálogo de fontes de IA inválido.");
      }
      ids.add(item.id);
    }
    sources = items.map(item => ({ id: item.id, label: item.label, kinds: [...item.kinds] }));
    failed = false;
    return sources;
  })();
  try { return await pending; }
  catch (error) { failed = true; throw error; }
  finally { pending = null; }
}

export function aiSourcesFor(kind) {
  return (sources || []).filter(item => item.kinds.includes(kind));
}

export function aiSourcesUnavailable() {
  return failed;
}
