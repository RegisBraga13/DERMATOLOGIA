import { MENTAL_EXAM_KEYS, optionDisplayLabels, PROFESSIONAL_TERM_REPLACEMENTS } from "./vocabulary.js";

export function arrayValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

export function optionDisplayLabel(option = "") {
  return optionDisplayLabels[option] || option;
}

export function compactText(value, maxLength = 900) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

export function professionalList(value) {
  return formatPlainList(arrayValue(value).map(item => lowerFirst(professionalClinicalTerms(item))));
}

export function professionalListWithOther(value, otherValue = "") {
  return formatPlainList([
    ...arrayValue(value).filter(item => normalizeText(item) !== "outro"),
    otherValue
  ].filter(Boolean).map(item => lowerFirst(professionalClinicalTerms(item))));
}

export function formatPlainList(items = []) {
  const cleanItems = uniqueValues(items.map(item => String(item || "").trim()).filter(Boolean));
  if (cleanItems.length <= 1) return cleanItems[0] || "";
  if (cleanItems.length === 2) return `${cleanItems[0]} e ${cleanItems[1]}`;
  return `${cleanItems.slice(0, -1).join(", ")} e ${cleanItems.at(-1)}`;
}

export function professionalClinicalTerms(value = "") {
  return PROFESSIONAL_TERM_REPLACEMENTS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    String(value || "")
  );
}

export function capitalizeFirst(value = "") {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : "";
}

export function cleanClinicalLine(value = "") {
  return stripFinalPeriod(value)
    .replace(/^\s*(QP|HDA)\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

export function stripFinalPeriod(value = "") {
  return String(value || "").trim().replace(/[.\s]+$/g, "");
}

export function mentalExamKeys() {
  return MENTAL_EXAM_KEYS;
}

export function clinicalPhrase(value = "") {
  const cleaned = stripFinalPeriod(value)
    .replace(/\s+/g, " ")
    .replace(/^(aparencia|aparência|atitude|contato|consciencia|consciência|atencao|atenção|orientacao|orientação|memoria|memória|sensopercepcao|sensopercepção|linguagem|humor|afeto|psicomotricidade|vontade|juizo critico|juízo crítico|insight)\s*:\s*/i, "")
    .replace(/^(memoria|memória)\s+/i, "")
    .replace(/^(sensopercepcao|sensopercepção|linguagem|humor|afeto|consciencia|consciência|atencao|atenção|orientacao|orientação)\s+/i, "")
    .replace(/^(paciente\s+)?/i, "")
    .trim();
  return lowerFirst(cleaned);
}

export function formatClinicalList(items = []) {
  const cleanItems = uniqueValues(items.map(clinicalPhrase).filter(Boolean));
  if (cleanItems.length <= 1) return cleanItems[0] || "";
  if (cleanItems.length === 2) return `${cleanItems[0]} e ${cleanItems[1]}`;
  return `${cleanItems.slice(0, -1).join(", ")} e ${cleanItems.at(-1)}`;
}

export function lowerFirst(value = "") {
  const text = String(value).trim();
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : "";
}

export function joinValues(value) {
  return Array.isArray(value) ? value.filter(Boolean).join(", ") : value || "";
}

export function normalizeText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function calculateAge(dateValue) {
  if (!dateValue) return "";
  const birth = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return "";
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const hadBirthday = today.getMonth() > birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  if (!hadBirthday) age -= 1;
  return age >= 0 ? age : "";
}

export function normalizedSingleChoiceValue(name, value) {
  const selected = arrayValue(value)[0] || "";
  const aliases = {
    evolucaoClinicaRetorno: {
      "Remissao ou melhora": "Melhora clínica",
      "Melhora clinica": "Melhora clínica",
      Estavel: "Estabilidade clínica",
      "Estabilidade clinica": "Estabilidade clínica",
      Piora: "Piora clínica",
      "Piora clinica": "Piora clínica"
    },
    sonoRetorno: {
      Insonia: "Insônia",
      "Reducao da necessidade de sono": "Redução da necessidade de sono"
    },
    humorAnsiedadeRetorno: {
      Eutimico: "Eutímico",
      Irritavel: "Irritável",
      "Crise de panico": "Crise de pânico"
    },
    adesao: {
      "Nao iniciou ou interrompeu": "Não iniciou ou interrompeu"
    }
  };
  return aliases[name]?.[selected] || selected;
}
