import { VERSIONED_GROUPS } from "../clinical/versions.js";
import { escapeHtml } from "../ui/html.js";

// Consulta finalizada e as versoes que ela guardou (leva 3, 11/09/2026). Ver
// src/clinical/versions.js.

function dataHora(valor) {
  return valor ? new Date(valor).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";
}

function finalizado(entry = {}) {
  return entry.type === "return" ? "Retorno finalizado" : "Consulta finalizada";
}

function texto(valor) {
  const lista = Array.isArray(valor) ? valor : valor ? [valor] : [];
  return lista.map(item => String(item ?? "").trim()).filter(Boolean).join("; ");
}

/** A frase que vai no PDF: finalizado quando, e alterado depois quando. */
export function finalizationNote(entry = {}) {
  if (!entry.finalizadoEm) return "";
  const base = `${finalizado(entry)} em ${dataHora(entry.finalizadoEm)}.`;
  return entry.alteradoAposFinalizarEm
    ? `${base} Alterado depois, em ${dataHora(entry.alteradoAposFinalizarEm)}; a versão anterior está guardada no prontuário.`
    : base;
}

/** O estado do registro no cartao do prontuario. */
export function recordStatusLine(entry = {}) {
  return `<p class="field-hint">${escapeHtml(finalizationNote(entry) || "Não finalizado.")}</p>`;
}

/** O aviso no topo do atendimento reaberto depois de finalizado. */
export function finalizedNotice(entry = {}) {
  if (!entry.finalizadoEm) return "";
  const n = Array.isArray(entry.versoes) ? entry.versoes.length : 0;
  const guardadas = n ? ` ${n === 1 ? "Há 1 versão anterior guardada" : `Há ${n} versões anteriores guardadas`}.` : "";
  return `<div class="warning">${escapeHtml(finalizado(entry))} em ${escapeHtml(dataHora(entry.finalizadoEm))}. O que for alterado agora na história clínica, no diagnóstico ou no tratamento fica registrado, e a versão anterior é guardada no prontuário.${escapeHtml(guardadas)}</div>`;
}

/** As versoes anteriores, recolhidas, da mais recente para a mais antiga. */
export function versionsView(entry = {}) {
  const versoes = Array.isArray(entry.versoes) ? entry.versoes : [];
  if (!versoes.length) return "";
  return `<details class="record-versions">
    <summary>Versões anteriores (${versoes.length})</summary>
    ${[...versoes].reverse().map(versao => `<article class="timeline-item">
      <h4>Versão de ${escapeHtml(dataHora(versao.em))} — depois mudou: ${escapeHtml((versao.mudou || []).map(grupo => VERSIONED_GROUPS[grupo]?.rotulo || grupo).join(", "))}</h4>
      ${versionFields(versao.campos || {})}
    </article>`).join("")}
  </details>`;
}

function versionFields(campos) {
  const linhas = Object.values(VERSIONED_GROUPS)
    .flatMap(grupo => Object.entries(grupo.campos))
    .filter(([campo]) => texto(campos[campo]))
    .map(([campo, rotulo]) => `<p><strong>${escapeHtml(rotulo)}:</strong> ${escapeHtml(texto(campos[campo])).replaceAll("\n", "<br>")}</p>`);
  return linhas.join("") || `<p class="field-hint">Nada registrado nestes campos.</p>`;
}
