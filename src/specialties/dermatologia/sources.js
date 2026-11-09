import { DERMATOLOGY_SOURCE_CATALOG } from "./index.js";

export function dermatologySources(catalog = DERMATOLOGY_SOURCE_CATALOG) {
  return (catalog || []).filter(source => source?.status === "active"
    && String(source.version || "").trim()
    && String(source.license || "").trim()
    && String(source.updatedAt || "").trim()
    && Array.isArray(source.scope) && source.scope.length > 0);
}

export function dermatologySourceForScope(scope, catalog = DERMATOLOGY_SOURCE_CATALOG) {
  return dermatologySources(catalog).filter(source => (source.scope || []).includes(scope));
}

export function dermatologySourcesAreReady(scope, catalog = DERMATOLOGY_SOURCE_CATALOG) {
  return dermatologySourceForScope(scope, catalog).length > 0;
}

export function dermatologySourceStatus(catalog = DERMATOLOGY_SOURCE_CATALOG) {
  const all = catalog || [];
  const active = dermatologySources(all).length;
  return active ? `${active} fonte(s) dermatológica(s) ativa(s)` : "Fontes RAG e guidelines ainda não foram habilitadas";
}
