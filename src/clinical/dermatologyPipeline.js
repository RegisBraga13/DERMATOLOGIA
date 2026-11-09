import {
  DERMATOLOGY_ANAMNESIS_FIELDS, DERMATOLOGY_HISTORY_FIELDS,
  DERMATOLOGY_PHYSICAL_EXAM_FIELDS, DERMATOLOGY_SYSTEMS_FIELDS
} from "../specialties/dermatologia/index.js";

export function chronological(items = []) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) =>
    String(a.date || "").localeCompare(String(b.date || "")) || String(a.id || "").localeCompare(String(b.id || "")));
}

const list = value => Array.isArray(value) ? value.join(", ") : String(value || "").trim();

export function dermatologySourceText(form = {}, patient = {}, priorEntries = []) {
  const lines = [];
  const add = (label, value) => { const text = list(value); if (text) lines.push(`${label}: ${text}`); };
  add("Fototipo de Fitzpatrick", patient.fototipoFitzpatrick);
  add("Transcrição de voz revisada", form.dermVoiceTranscript);
  for (const [prefix, fields] of [
    ["dermA_", DERMATOLOGY_ANAMNESIS_FIELDS],
    ["dermH_", DERMATOLOGY_HISTORY_FIELDS],
    ["dermE_", DERMATOLOGY_PHYSICAL_EXAM_FIELDS]
  ]) for (const [key, label] of fields) add(label, form[`${prefix}${key}`]);
  for (const [key, label] of DERMATOLOGY_SYSTEMS_FIELDS) add(label, form[`dermS_${key}`]);
  for (const [key, label] of [
    ["dermSintomas", "Sintomas"], ["dermInicio", "Padrão temporal"],
    ["dermExposicoes", "Exposições"], ["dermMorfologia", "Morfologia"],
    ["dermDistribuicao", "Distribuição"], ["dermArranjo", "Arranjo"],
    ["dermCor", "Cor"], ["dermSuperficie", "Superfície"],
    ["dermPalpacao", "Palpação"]
  ]) add(label, form[key]);
  add("Exame de anexos e dermatoscopia", form.dermExameComplementar);
  for (const item of form.dermLesions || []) add(`Lesão individualizada ${item.label || ""}`, [item.localizacao, item.dimensoes, item.evolucao].filter(Boolean).join("; "));
  const images = Array.isArray(form.dermImages) ? form.dermImages
    : form.dermApprovedDescription ? [{ date: String(form.createdAt || "").slice(0, 10), description: form.dermApprovedDescription }] : [];
  for (const item of chronological(images)) add(`Imagem de ${item.date || "data não informada"}`, item.description);
  for (const entry of priorEntries.filter(item => item.id !== form.id)) {
    const previousImages = Array.isArray(entry.dermImages) ? entry.dermImages
      : entry.dermApprovedDescription ? [{ date: String(entry.createdAt || "").slice(0, 10), description: entry.dermApprovedDescription }] : [];
    for (const item of chronological(previousImages)) add(`Imagem anterior de ${item.date || "data não informada"} (${entry.label || "atendimento anterior"})`, item.description);
  }
  for (const item of chronological(form.dermExams)) add(`Exame complementar de ${item.date || "data não informada"} (${item.type || "tipo não informado"})`, item.description);
  for (const [key, label] of [
    ["resposta", "Resposta ao atendimento anterior"], ["sintomas", "Sintomas no retorno"],
    ["lesoes", "Mudança das lesões no retorno"], ["exame", "Exame cutâneo no retorno"],
    ["eventos", "Eventos no retorno"]
  ]) add(label, form[`dermRet_${key}`]);
  add("Perguntas sobre lesões e respostas", form.dermLesionQuestionsApproved);
  add("Exame físico por aparelhos", form.dermSystemsExam);
  for (const [key, label] of [
    ["evolucao", "Evolução esclarecida"], ["exposicao", "Exposição esclarecida"],
    ["alarme", "Sinais de alarme investigados"], ["exames", "Exames e biópsia considerados"]
  ]) add(label, form[`dermR_${key}`]);
  add("Sinais de alarme", form.dermAlarmes);
  add("Perguntas de refinamento e respostas", form.dermRefinementApproved);
  return lines.join("\n");
}

export function historyIsCurrent(form = {}, patient = {}, priorEntries = []) {
  return Boolean(form.dermHistoryApproved && form.dermHistorySource === dermatologySourceText(form, patient, priorEntries));
}

export function hdIsCurrent(form = {}, patient = {}, priorEntries = []) {
  return historyIsCurrent(form, patient, priorEntries) && Boolean(form.dermHdApproved && form.dermHdSource === form.dermHistoryApproved);
}

export function planIsCurrent(form = {}, patient = {}, priorEntries = []) {
  return hdIsCurrent(form, patient, priorEntries) && Boolean(form.dermPlanApproved && form.dermPlanSource === form.dermHdApproved);
}
