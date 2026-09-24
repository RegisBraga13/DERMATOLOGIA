import { normalizeText } from "../clinical/textFormat.js";
import { medications } from "../data/medications.js";

export function localMedicationSuggestions(term = "") {
  const query = normalizeText(term);
  if (query.length < 2) return [];
  return medications
    .filter(item => normalizeText(`${item.generic} ${item.brands}`).includes(query))
    .slice(0, 8)
    .map(item => ({ name: item.generic, detail: `${item.brands} · ${item.className}` }));
}

export function parseMedicationResponse(text = "") {
  const clean = String(text || "").trim();
  const medication = clean.match(/MEDICAMENTO:\s*([\s\S]*?)(?:\n\s*DOSE INICIAL E PROGRESSAO:|$)/i);
  const dose = clean.match(/DOSE INICIAL E PROGRESSAO:\s*([\s\S]*?)(?:\n\s*PRINCIPAIS EFEITOS COLATERAIS:|$)/i);
  const safety = clean.match(/PRINCIPAIS EFEITOS COLATERAIS:\s*([\s\S]*?)(?:\n\s*OBSERVACOES:|$)/i);
  const notes = clean.match(/OBSERVACOES:\s*([\s\S]*)$/i);
  return {
    medicationNameText: medication?.[1]?.trim() || "",
    medicationPresentation: dose?.[1]?.trim() || "",
    medicationSafety: safety?.[1]?.trim() || "",
    medicationBestUse: notes?.[1]?.trim() || ""
  };
}
