import { chips, textarea } from "../ui/controls.js";
import { escapeHtml } from "../ui/html.js";
import {
  DERMATOLOGY_ANAMNESIS_FIELDS, DERMATOLOGY_HISTORY_FIELDS,
  DERMATOLOGY_PHYSICAL_EXAM_FIELDS, DERMATOLOGY_ASSESSMENT_FIELDS,
  DERMATOLOGY_PLAN_FIELDS, DERMATOLOGY_SYMPTOM_OPTIONS,
  DERMATOLOGY_ONSET_OPTIONS, DERMATOLOGY_EXPOSURE_OPTIONS,
  DERMATOLOGY_ALARM_OPTIONS, LESION_MORPHOLOGY,
  LESION_DISTRIBUTIONS, LESION_ARRANGEMENTS, LESION_COLORS,
  LESION_SURFACE, LESION_PALPATION
} from "../specialties/dermatologia/index.js";

const section = (title, fields, form, prefix) => `<div class="clinical-card"><h4>${title}</h4>${fields.map(([key, label]) =>
  textarea(`${prefix}${key}`, label, form[`${prefix}${key}`] || "", "", 2)).join("")}</div>`;
const choices = (title, name, options, form) => chips(name, title, options, form[name] || []);

export function dermatologyFormValues(record = {}) {
  const legacy = record.dermatology || {};
  const values = { ...record };
  const sections = [
    ["anamnese", "dermA_", DERMATOLOGY_ANAMNESIS_FIELDS],
    ["antecedentes", "dermH_", DERMATOLOGY_HISTORY_FIELDS],
    ["exameFisico", "dermE_", DERMATOLOGY_PHYSICAL_EXAM_FIELDS],
    ["avaliacao", "dermD_", DERMATOLOGY_ASSESSMENT_FIELDS],
    ["conduta", "dermP_", DERMATOLOGY_PLAN_FIELDS]
  ];
  for (const [section, prefix, fields] of sections) {
    for (const [key] of fields) {
      const target = `${prefix}${key}`;
      if (values[target] === undefined) values[target] = legacy[section]?.[key] || "";
    }
  }
  const oldSelections = [
    ["dermSintomas", legacy.anamnese?.sintomasSelecionados],
    ["dermInicio", legacy.anamnese?.inicioSelecionado],
    ["dermExposicoes", legacy.anamnese?.exposicoesSelecionadas],
    ["dermMorfologia", legacy.exameFisico?.morfologiaSelecionada],
    ["dermDistribuicao", legacy.exameFisico?.distribuicaoSelecionada],
    ["dermArranjo", legacy.exameFisico?.arranjoSelecionado],
    ["dermCor", legacy.exameFisico?.corSelecionada],
    ["dermSuperficie", legacy.exameFisico?.superficieSelecionada],
    ["dermPalpacao", legacy.exameFisico?.palpacaoSelecionada],
    ["dermAlarmes", legacy.avaliacao?.sinaisAlarmeSelecionados]
  ];
  for (const [key, selected] of oldSelections) {
    if (values[key] === undefined) values[key] = Array.isArray(selected) ? selected : [];
  }
  return values;
}

export function dermatologyConsultationPage(page, form = {}, patient = {}) {
  form = dermatologyFormValues(form);
  if (page === "anamnese") return section("Queixa e história", DERMATOLOGY_ANAMNESIS_FIELDS, form, "dermA_")
    + choices("Sintomas", "dermSintomas", DERMATOLOGY_SYMPTOM_OPTIONS, form)
    + choices("Padrão temporal", "dermInicio", DERMATOLOGY_ONSET_OPTIONS, form)
    + choices("Exposições", "dermExposicoes", DERMATOLOGY_EXPOSURE_OPTIONS, form)
    + section("Antecedentes", DERMATOLOGY_HISTORY_FIELDS, form, "dermH_");
  if (page === "psiquico") return section("Inspeção cutânea", DERMATOLOGY_PHYSICAL_EXAM_FIELDS, form, "dermE_")
    + choices("Morfologia", "dermMorfologia", LESION_MORPHOLOGY, form)
    + choices("Distribuição", "dermDistribuicao", LESION_DISTRIBUTIONS, form);
  if (page === "neurologico") return choices("Arranjo", "dermArranjo", LESION_ARRANGEMENTS, form)
    + choices("Cor", "dermCor", LESION_COLORS, form)
    + choices("Superfície", "dermSuperficie", LESION_SURFACE, form)
    + choices("Palpação", "dermPalpacao", LESION_PALPATION, form)
    + textarea("dermExameComplementar", "Unhas, cabelos, mucosas e dermatoscopia", form.dermExameComplementar || "", "", 4);
  if (page === "refinamento") return section("Revisão clínica", [
    ["evolucao", "Evolução e mudança das lesões"], ["exposicao", "Relação temporal com exposições"],
    ["alarme", "Sinais de alarme investigados"], ["exames", "Exames e biópsia considerados"]
  ], form, "dermR_");
  if (page === "diagnostico") return choices("Sinais de alarme", "dermAlarmes", DERMATOLOGY_ALARM_OPTIONS, form)
    + section("Avaliação diagnóstica", DERMATOLOGY_ASSESSMENT_FIELDS, form, "dermD_");
  if (page === "tratamento") return section("Tratamento e orientações", DERMATOLOGY_PLAN_FIELDS, form, "dermP_");
  if (page === "evolucao") return textarea("dermNarrativa", "História clínica dermatológica", form.dermNarrativa || "", "", 12);
  if (page === "resumo") return dermatologySummary(form, patient);
  if (page === "medicamentos") return section("Terapias em uso", [
    ["topicos", "Tratamentos tópicos"], ["sistemicos", "Tratamentos sistêmicos"],
    ["procedimentos", "Procedimentos"]
  ], form, "dermT_");
  if (page === "escalas") return textarea("dermMedidas", "Medidas e instrumentos dermatológicos utilizados", form.dermMedidas || "", "", 5);
  if (page === "documentos") return textarea("dermDocumentos", "Documentos e orientações emitidos", form.dermDocumentos || "", "", 5);
  return "";
}

export function dermatologyReturnPage(page, form = {}, previous = {}) {
  form = dermatologyFormValues(form);
  if (page === "evolucao-retorno") return section("Evolução desde o atendimento anterior", [
    ["resposta", "Resposta à conduta anterior"], ["sintomas", "Sintomas atuais"],
    ["lesoes", "Mudança nas lesões"], ["exame", "Exame cutâneo atual"],
    ["eventos", "Eventos adversos e novas exposições"]
  ], form, "dermRet_") + `<p class="field-hint">Atendimento anterior: ${escapeHtml(previous.label || "sem identificação")}</p>`;
  if (page === "texto-retorno") return section("Ajuste de conduta", DERMATOLOGY_PLAN_FIELDS, form, "dermP_")
    + textarea("dermNarrativa", "Evolução dermatológica", form.dermNarrativa || "", "", 8);
  return dermatologyConsultationPage(page, form);
}

export function dermatologySummary(form = {}, patient = {}) {
  form = dermatologyFormValues(form);
  const rows = Object.entries(form).filter(([key, value]) => key.startsWith("derm") && value && (!Array.isArray(value) || value.length));
  return `<div class="clinical-card"><h4>${escapeHtml(patient.nome || "Paciente")}</h4>${rows.length ? rows.map(([key, value]) =>
    `<p><strong>${escapeHtml(key.replace(/^derm/, ""))}:</strong> ${escapeHtml(Array.isArray(value) ? value.join(", ") : value)}</p>`).join("") : "<p>Nenhum achado dermatológico registrado.</p>"}</div>`;
}

export function dermatologyReportText(form = {}) {
  form = dermatologyFormValues(form);
  const fields = [
    ["Queixa", "dermA_queixaPrincipal"], ["História", "dermA_historiaDoencaAtual"],
    ["Inspeção cutânea", "dermE_localizacao"], ["Morfologia", "dermMorfologia"],
    ["Diagnóstico", "dermD_diagnosticoPrincipal"], ["Conduta", "dermP_tratamento"],
    ["Evolução", "dermNarrativa"]
  ];
  return fields.filter(([, key]) => form[key] && (!Array.isArray(form[key]) || form[key].length))
    .map(([label, key]) => `${label}: ${Array.isArray(form[key]) ? form[key].join(", ") : form[key]}`)
    .join("\n\n") || "Nenhum dado dermatológico registrado.";
}
