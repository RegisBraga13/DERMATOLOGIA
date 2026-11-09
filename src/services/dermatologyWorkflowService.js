import { authHeaders } from "./supabaseService.js";
import { dermatologySourcesAreReady } from "../specialties/dermatologia/sources.js";

export function formatDermatologyQuestions(proposal = {}) {
  const questions = Array.isArray(proposal.questions) ? proposal.questions : [];
  return questions.map((item, index) => [
    `${index + 1}. ${item.red_flag ? "[SINAL DE ALARME] " : ""}${item.question || ""}`,
    item.reason ? `Motivo: ${item.reason}` : "",
    "Resposta: "
  ].filter(Boolean).join("\n")).join("\n\n");
}

export async function requestDermatologyStage(kind, source) {
  const requiredScope = kind === "hypotheses" ? "diagnostico" : kind === "plan" ? "conduta" : "";
  if (requiredScope && !dermatologySourcesAreReady(requiredScope)) {
    throw new Error("Geração por IA indisponível até validar fontes dermatológicas próprias.");
  }
  const response = await fetch("/api/dermatology-workflow", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ kind, source })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Falha ao gerar proposta clínica.");
  const proposal = result.proposal || {};
  if (kind.endsWith("questions")) return formatDermatologyQuestions(proposal);
  const text = String(proposal.text || "").trim();
  const uncertainty = String(proposal.uncertainties || "").trim();
  if (!text) throw new Error("A proposta clínica veio vazia.");
  return uncertainty ? `${text}\n\nIncertezas a conferir: ${uncertainty}` : text;
}
