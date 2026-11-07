import { chips, selectField, textarea, voiceTextarea } from "../ui/controls.js";
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
  if (!Array.isArray(values.dermLesions)) values.dermLesions = Array.isArray(legacy.lesions) ? legacy.lesions : [];
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

function lesionEditor(form) {
  const lesions = form.dermLesions || [];
  return `<div class="clinical-card"><h4>Lesões individualizadas</h4>${lesions.map((lesion, index) =>
    `<div class="clinical-card"><h5>Lesão ${index + 1}</h5>
    ${textarea(`dermLesion__${index}__label`, "Identificação da lesão", lesion.label || "", "Ex.: placa no antebraço", 1)}
    ${textarea(`dermLesion__${index}__localizacao`, "Localização", lesion.localizacao || "", "", 2)}
    ${chips(`dermLesion__${index}__morfologia`, "Morfologia", LESION_MORPHOLOGY, lesion.morfologia || [])}
    ${chips(`dermLesion__${index}__distribuicao`, "Distribuição", LESION_DISTRIBUTIONS, lesion.distribuicao || [])}
    ${selectField(`dermLesion__${index}__cor`, "Cor", LESION_COLORS, lesion.cor || "")}
    ${selectField(`dermLesion__${index}__superficie`, "Superfície", LESION_SURFACE, lesion.superficie || "")}
    ${textarea(`dermLesion__${index}__bordas`, "Bordas", lesion.bordas || "", "", 1)}
    ${textarea(`dermLesion__${index}__dimensoes`, "Dimensões", lesion.dimensoes || "", "", 2)}
    ${textarea(`dermLesion__${index}__sintomas`, "Sintomas locais", lesion.sintomas || "", "", 1)}
    ${textarea(`dermLesion__${index}__evolucao`, "Evolução", lesion.evolucao || "", "", 2)}
    ${textarea(`dermLesion__${index}__fotoReferencia`, "Referência da fotografia (sem anexar a imagem)", lesion.fotoReferencia || "", "", 1)}
    <button type="button" class="secondary" data-action="remove-derm-lesion" data-index="${index}">Remover lesão</button></div>`).join("")}
    <button type="button" class="secondary" data-action="add-derm-lesion">Adicionar lesão</button></div>`;
}

export function dermatologyConsultationPage(page, form = {}, patient = {}) {
  form = dermatologyFormValues(form);
  if (page === "anamnese") return (form.anamnesisInputMode === "microphone"
    ? `<div class="clinical-card"><h4>Transcrição da consulta</h4>
      <p class="field-hint">Grave a conversa e revise o texto antes de salvar. Os campos clínicos abaixo permanecem editáveis.</p>
      ${voiceTextarea("dermTranscricao", "Transcrição integral da conversa", form.dermTranscricao || "")}</div>`
    : "") + section("Queixa e história", DERMATOLOGY_ANAMNESIS_FIELDS, form, "dermA_")
    + choices("Sintomas", "dermSintomas", DERMATOLOGY_SYMPTOM_OPTIONS, form)
    + choices("Padrão temporal", "dermInicio", DERMATOLOGY_ONSET_OPTIONS, form)
    + choices("Exposições", "dermExposicoes", DERMATOLOGY_EXPOSURE_OPTIONS, form)
    + section("Antecedentes", DERMATOLOGY_HISTORY_FIELDS, form, "dermH_");
  if (page === "psiquico") return section("Inspeção cutânea", DERMATOLOGY_PHYSICAL_EXAM_FIELDS, form, "dermE_")
    + choices("Morfologia", "dermMorfologia", LESION_MORPHOLOGY, form)
    + choices("Distribuição", "dermDistribuicao", LESION_DISTRIBUTIONS, form)
    + lesionEditor(form);
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
  if (page === "evolucao-retorno") {
    const priorLesions = dermatologyFormValues(previous).dermLesions;
    return (form.anamnesisInputMode === "microphone"
      ? `<div class="clinical-card"><h4>Transcrição do retorno</h4>
        <p class="field-hint">Grave a conversa e revise o texto antes de salvar. Os campos de evolução abaixo permanecem editáveis.</p>
        ${voiceTextarea("dermRetTranscricao", "Transcrição integral da conversa", form.dermRetTranscricao || "")}</div>`
      : "") + section("Evolução desde o atendimento anterior", [
    ["resposta", "Resposta à conduta anterior"], ["sintomas", "Sintomas atuais"],
    ["lesoes", "Mudança nas lesões"], ["exame", "Exame cutâneo atual"],
    ["eventos", "Eventos adversos e novas exposições"]
  ], form, "dermRet_") + `<p class="field-hint">Atendimento anterior: ${escapeHtml(previous.label || "sem identificação")}</p>`
      + (priorLesions.length ? `<div class="clinical-card"><h4>Lesões do atendimento anterior</h4><p>Histórico para comparação; não representa exame realizado hoje.</p>
        ${priorLesions.map((lesion, index) => `<p>${escapeHtml(lesion.label || `Lesão ${index + 1}`)}: ${escapeHtml(lesionDescription(lesion) || "sem descrição")}</p>`).join("")}
        ${form.dermLesions.length ? "" : '<button type="button" class="secondary" data-action="copy-derm-lesions">Trazer identificação das lesões para reavaliar</button><p class="field-hint">Os achados anteriores não são copiados para o exame atual.</p>'}</div>` : "")
      + lesionEditor(form);
  }
  if (page === "texto-retorno") return section("Ajuste de conduta", DERMATOLOGY_PLAN_FIELDS, form, "dermP_")
    + textarea("dermNarrativa", "Evolução dermatológica", form.dermNarrativa || "", "", 8);
  return dermatologyConsultationPage(page, form);
}

export function dermatologySummary(form = {}, patient = {}) {
  form = dermatologyFormValues(form);
  const rows = Object.entries(form).filter(([key, value]) => key.startsWith("derm") && key !== "dermLesions"
    && (typeof value === "string" ? value.trim() : Array.isArray(value) && value.length && value.every(item => typeof item === "string")));
  return `<div class="clinical-card"><h4>${escapeHtml(patient.nome || "Paciente")}</h4>${rows.length ? rows.map(([key, value]) =>
    `<p><strong>${escapeHtml(key.replace(/^derm/, ""))}:</strong> ${escapeHtml(Array.isArray(value) ? value.join(", ") : value)}</p>`).join("") : (form.dermLesions || []).length ? "" : "<p>Nenhum achado dermatológico registrado.</p>"}
    ${(form.dermLesions || []).map((lesion, index) => `<p><strong>${escapeHtml(lesion.label || `Lesão ${index + 1}`)}:</strong> ${escapeHtml(lesionDescription(lesion))}</p>`).join("")}</div>`;
}

function lesionDescription(lesion) {
  const list = value => Array.isArray(value) ? value : value ? [value] : [];
  return [lesion.localizacao, ...list(lesion.morfologia), ...list(lesion.distribuicao),
    lesion.cor, lesion.superficie, lesion.bordas, lesion.dimensoes, lesion.sintomas,
    lesion.evolucao, lesion.fotoReferencia && `Foto: ${lesion.fotoReferencia}`]
    .filter(Boolean).join("; ");
}

export function dermatologyReportText(form = {}) {
  form = dermatologyFormValues(form);
  const fields = [
    ["Queixa", "dermA_queixaPrincipal"], ["História", "dermA_historiaDoencaAtual"],
    ["Transcrição da consulta", "dermTranscricao"],
    ["Transcrição do retorno", "dermRetTranscricao"],
    ["Resposta à conduta anterior", "dermRet_resposta"], ["Sintomas atuais", "dermRet_sintomas"],
    ["Mudança nas lesões", "dermRet_lesoes"], ["Exame cutâneo atual", "dermRet_exame"],
    ["Eventos adversos e exposições", "dermRet_eventos"],
    ["Inspeção cutânea", "dermE_localizacao"], ["Morfologia", "dermMorfologia"],
    ["Diagnóstico", "dermD_diagnosticoPrincipal"], ["Conduta", "dermP_tratamento"],
    ["Evolução", "dermNarrativa"]
  ];
  const report = fields.filter(([, key]) => form[key] && (!Array.isArray(form[key]) || form[key].length))
    .map(([label, key]) => `${label}: ${Array.isArray(form[key]) ? form[key].join(", ") : form[key]}`)
    .join("\n\n");
  const lesions = (form.dermLesions || []).map((lesion, index) =>
    `${lesion.label || `Lesão ${index + 1}`}: ${lesionDescription(lesion)}`).join("\n");
  return [report, lesions].filter(Boolean).join("\n\n") || "Nenhum dado dermatológico registrado.";
}
