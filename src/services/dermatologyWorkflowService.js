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

export async function requestDermatologyStage(kind, source, options = {}) {
  const sourceMode = kind === "hypotheses" ? options.sourceMode || "ai" : "ai";
  if (kind === "hypotheses" && sourceMode === "rag" && !dermatologySourcesAreReady("diagnostico")) {
    throw new Error("O RAG dermatológico ainda não tem fontes validadas para diagnóstico.");
  }
  const response = await fetch("/api/dermatology-workflow", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({
      kind,
      source,
      sourceMode,
      ragQuery: options.ragQuery || "",
      externalEvidence: options.externalEvidence || "",
      externalUrl: options.externalUrl || ""
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Falha ao gerar proposta clínica.");
  const proposal = result.proposal || {};
  if (kind.endsWith("questions")) return formatDermatologyQuestions(proposal);
  const text = String(proposal.text || "").trim();
  const uncertainty = String(proposal.uncertainties || "").trim();
  if (!text) throw new Error("A proposta clínica veio vazia.");
  const sources = Array.isArray(proposal.sources) ? proposal.sources : [];
  const sourceText = sources.map(item => {
    const title = String(item?.title || "Fonte consultada").trim();
    const url = String(item?.url || "").trim();
    const score = Number.isFinite(Number(item?.score)) ? ` (relevância ${Math.round(Number(item.score) * 100)}%)` : "";
    const filename = String(item?.filename || "").trim();
    const hash = String(item?.sha256 || "").trim();
    const validatedAt = String(item?.validated_at || "").trim();
    return `- ${title}${score}${url ? ` — ${url}` : ""}${filename ? ` — ${filename}` : ""}${hash ? ` — SHA-256 ${hash}` : ""}${validatedAt ? ` — revisão declarada em ${validatedAt}` : ""}`;
  });
  return [text, uncertainty ? `Incertezas a conferir: ${uncertainty}` : "",
    sourceText.length ? `Fontes para conferência médica:\n${sourceText.join("\n")}` : ""].filter(Boolean).join("\n\n");
}
