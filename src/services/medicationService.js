import { compactText, normalizeText } from "../clinical/textFormat.js";
import { medications } from "../data/medications.js";

export async function buildMedicationAutofill(typedName = "") {
  const rxnav = await fetchRxNavMedication(typedName);
  const searchName = typedName.trim();
  const label = await fetchOpenFdaLabel(searchName) || (rxnav.name ? await fetchOpenFdaLabel(rxnav.name) : null);
  const sourceStatus = [
    "Sem correspondência no catálogo brasileiro local; exibindo fonte internacional complementar.",
    rxnav.name ? `RxNav/NLM: ${rxnav.name}${rxnav.rxcui ? ` (RxCUI ${rxnav.rxcui})` : ""}` : "RxNav/NLM: sem correspondência direta",
    label ? "openFDA: resumo de rotulagem encontrado" : "openFDA: sem correspondência direta"
  ].join(" | ");
  const activeIngredient = firstOpenFdaValue(label, "generic_name") || firstOpenFdaValue(label, "substance_name") || rxnav.name || searchName;
  const presentationHighlight = fieldFromLabel(label, "dosage_forms_and_strengths", 180) || "Confirmar apresentação disponível no Brasil.";
  const recommendedDose = fieldFromLabel(label, "dosage_and_administration", 220) || "Dose não disponível automaticamente; consultar fonte brasileira.";
  const mainEffects = fieldFromLabel(label, "adverse_reactions", 220) || "Efeitos principais não encontrados automaticamente.";

  return {
    medicationGeneric: searchName,
    medicationNameText: searchName,
    medicationActiveIngredient: activeIngredient,
    medicationPresentationHighlight: presentationHighlight,
    medicationRecommendedDose: recommendedDose,
    medicationMainEffects: mainEffects,
    medicationPresentation: medicationOnlinePresentationText(searchName, rxnav, label),
    medicationSafety: medicationOnlineSafetyText(label),
    medicationBestUse: medicationOnlineBestUseText(searchName, label),
    medicationPriceResearch: "",
    medicationOnlineStatus: sourceStatus
  };
}

export function localMedicationSuggestions(term = "") {
  const query = normalizeText(term);
  if (query.length < 2) return [];
  return medications
    .filter(item => normalizeText(`${item.generic} ${item.brands}`).includes(query))
    .slice(0, 8)
    .map(item => ({ name: item.generic, detail: `${item.brands} · ${item.className}` }));
}

async function fetchRxNavMedication(term) {
  try {
    const url = `https://rxnav.nlm.nih.gov/REST/drugs.json?name=${encodeURIComponent(term)}`;
    const response = await fetch(url);
    if (!response.ok) return fetchRxNavApproximateMedication(term);
    const data = await response.json();
    const candidate = data?.drugGroup?.conceptGroup
      ?.flatMap(group => group.conceptProperties || [])
      ?.find(item => item.name && item.rxcui);
    if (!candidate) return fetchRxNavApproximateMedication(term);
    return {
      name: candidate?.name || "",
      rxcui: candidate?.rxcui || ""
    };
  } catch {
    return fetchRxNavApproximateMedication(term);
  }
}

async function fetchRxNavApproximateMedication(term) {
  try {
    const url = `https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(term)}&maxEntries=1`;
    const response = await fetch(url);
    if (!response.ok) return {};
    const data = await response.json();
    const candidate = data?.approximateGroup?.candidate?.[0];
    return {
      name: candidate?.name || "",
      rxcui: candidate?.rxcui || ""
    };
  } catch {
    return {};
  }
}

async function fetchOpenFdaLabel(term) {
  const queries = [
    `openfda.generic_name:"${term}"`,
    `openfda.brand_name:"${term}"`,
    `openfda.substance_name:"${term}"`
  ];
  for (const query of queries) {
    try {
      const url = `https://api.fda.gov/drug/label.json?search=${encodeURIComponent(query)}&limit=1`;
      const response = await fetch(url);
      if (!response.ok) continue;
      const data = await response.json();
      if (data?.results?.[0]) return data.results[0];
    } catch {
      continue;
    }
  }
  return null;
}

function medicationOnlinePresentationText(name, rxnav, label) {
  return [
    `Apresentações/formas: ${fieldFromLabel(label, "dosage_forms_and_strengths", 260) || "confirmar em fonte brasileira."}`,
    `Posologia resumida: ${fieldFromLabel(label, "dosage_and_administration", 320) || "não disponível automaticamente."}`,
    "A dose deve ser individualizada pelo médico."
  ].join("\n");
}

function medicationOnlineBestUseText(name, label) {
  return [
    `Indicações resumidas: ${fieldFromLabel(label, "indications_and_usage", 320) || "não encontradas automaticamente."}`,
    "Confirmar indicação aprovada no Brasil e adequação ao paciente."
  ].join("\n");
}

function medicationOnlineSafetyText(label) {
  return [
    `Principais efeitos adversos: ${fieldFromLabel(label, "adverse_reactions", 280) || "não encontrados automaticamente."}`,
    `Alertas: ${fieldFromLabel(label, "warnings_and_cautions", 240) || fieldFromLabel(label, "warnings", 240) || "não encontrados automaticamente."}`,
    `Contraindicações: ${fieldFromLabel(label, "contraindications", 220) || "não encontradas automaticamente."}`,
    `Interações: ${fieldFromLabel(label, "drug_interactions", 240) || "não encontradas automaticamente."}`
  ].join("\n");
}

function firstOpenFdaValue(label, key) {
  const value = label?.openfda?.[key];
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function fieldFromLabel(label, key, maxLength = 360) {
  const value = label?.[key];
  const text = Array.isArray(value) ? value.join("\n") : value || "";
  return compactText(text, maxLength);
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
