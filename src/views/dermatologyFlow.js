import { chips, textarea, voiceTextarea } from "../ui/controls.js";
import { escapeAttr, escapeHtml } from "../ui/html.js";
import { chronological, dermatologySourceText, hdIsCurrent, historyIsCurrent, planIsCurrent } from "../clinical/dermatologyPipeline.js";
import { DERMATOLOGY_HISTORY_DOMAINS, DERMATOLOGY_RED_FLAGS, dermatologyHistoryReadiness } from "../specialties/dermatologia/historyReadiness.js";
import { dermatologySourcesAreReady } from "../specialties/dermatologia/sources.js";
import {
  DERMATOLOGY_ANAMNESIS_FIELDS, DERMATOLOGY_HISTORY_FIELDS,
  DERMATOLOGY_PHYSICAL_EXAM_FIELDS, DERMATOLOGY_SYSTEMS_FIELDS, DERMATOLOGY_ASSESSMENT_FIELDS,
  DERMATOLOGY_PLAN_FIELDS, DERMATOLOGY_ALARM_OPTIONS
} from "../specialties/dermatologia/index.js";

const section = (title, fields, form, prefix) => `<div class="clinical-card"><h4>${title}</h4>${fields.map(([key, label]) =>
  textarea(`${prefix}${key}`, label, form[`${prefix}${key}`] || "", "", 2)).join("")}</div>`;
const choices = (title, name, options, form) => chips(name, title, options, form[name] || []);

export function dermatologyFormValues(record = {}) {
  const legacy = record.dermatology || {};
  const values = { ...record };
  if (!Array.isArray(values.dermLesions)) values.dermLesions = Array.isArray(legacy.lesions) ? legacy.lesions : [];
  if (!Array.isArray(values.dermImages)) values.dermImages = values.dermApprovedDescription
    ? [{ id: "legacy-image-description", date: String(record.createdAt || "").slice(0, 10), description: values.dermApprovedDescription }]
    : [];
  if (!Array.isArray(values.dermExams)) values.dermExams = [];
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

function photographicExam(form, priorEntries = []) {
  const images = chronological(form.dermImages);
  const previousImages = priorEntries.filter(entry => entry.id !== form.id).flatMap(entry =>
    chronological(dermatologyFormValues(entry).dermImages).map(item => ({ ...item, visit: entry.label || "Atendimento anterior" })));
  const today = new Date();
  const todayLocal = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return `<div class="clinical-card"><h4>Fotos da pele e das lesões</h4>
    <p class="field-hint">Adicione fotos pela galeria, câmera ou arquivos. Ao escolher a imagem, a IA prepara uma descrição semiológica estruturada para sua revisão. O prontuário guarda a data e a descrição aprovada, não o arquivo original.</p>
    ${previousImages.length ? `<details><summary>Descrições de imagens de atendimentos anteriores (${previousImages.length})</summary>
      ${chronological(previousImages).map(item => `<p><strong>${escapeHtml(item.date || "Sem data")} — ${escapeHtml(item.visit)}:</strong> ${escapeHtml(item.description || "")}</p>`).join("")}
    </details>` : ""}
    ${images.map((item, index) => `<div class="clinical-card">
      <h5>Imagem ${index + 1}</h5>
      <label>Data da imagem<input type="date" name="dermImage__${index}__date" value="${escapeAttr(item.date || "")}"></label>
      ${textarea(`dermImage__${index}__description`, "Descrição revisada", item.description || "")}
      <button type="button" class="secondary" data-action="remove-derm-image" data-index="${index}">Excluir registro da imagem</button>
    </div>`).join("")}
    <input type="hidden" data-derm-photo-date value="${todayLocal}">
    <input type="file" accept="image/*" data-derm-photo hidden>
    <div class="actions"><button type="button" class="secondary" data-action="pick-derm-photo" aria-label="Adicionar foto da pele">＋ Adicionar foto</button></div>
    <div data-derm-photo-preview aria-live="polite"></div>
    <p data-derm-photo-status class="field-hint" role="status" aria-live="polite"></p>
    <label>Descrição estruturada da imagem — revise antes de salvar<textarea data-derm-description class="auto-expand" data-auto-expand="true" rows="1" placeholder="A descrição proposta pela IA aparecerá aqui para revisão médica."></textarea></label>
    <div class="actions"><button type="button" class="primary" data-action="approve-derm-description">Salvar descrição da imagem</button>
    <button type="button" class="secondary" data-action="remove-derm-description">Descartar proposta</button></div>
  </div>`;
}

function examUploads(form) {
  return `<div class="clinical-card"><h4>Exames trazidos pelo paciente</h4>
    <p class="field-hint">Adicione fotos ou PDFs pela galeria, câmera ou arquivos. A IA identifica o tipo, a data e os achados estruturados; não é preciso digitar esses dados. Confira a extração antes de salvar. Os exames ficam organizados pela data reconhecida. O prontuário guarda os dados revisados, não o arquivo original.</p>
    ${chronological(form.dermExams).map((item, index) => `<div class="clinical-card"><h5>Exame ${index + 1} — ${escapeHtml(item.type || "Tipo não identificado")} — ${escapeHtml(item.date ? item.date.split("-").reverse().join("/") : "Data não identificada")}</h5>
      <label>Data do exame<input type="date" name="dermExam__${index}__date" value="${escapeAttr(item.date || "")}"></label>
      <label>Tipo<input name="dermExam__${index}__type" value="${escapeAttr(item.type || "")}"></label>
      ${textarea(`dermExam__${index}__description`, "Achados conferidos", item.description || "")}
      <button type="button" class="secondary" data-action="remove-derm-exam" data-index="${index}">Excluir registro do exame</button>
    </div>`).join("")}
    <input type="file" data-derm-exam-file accept="image/*,application/pdf" hidden>
    <div class="actions"><button type="button" class="secondary" data-action="pick-derm-exam" aria-label="Adicionar exame">＋ Adicionar exame</button></div>
    <div data-derm-exam-preview aria-live="polite"></div>
    <div data-derm-exam-meta hidden>
      <label>Data identificada pela IA<input type="date" data-derm-exam-date></label>
      <label>Tipo identificado pela IA<input type="text" data-derm-exam-type></label>
    </div>
    <p data-derm-exam-status class="field-hint" role="status" aria-live="polite"></p>
    <label>Descrição estruturada do exame — revise antes de salvar<textarea data-derm-exam-description class="auto-expand" data-auto-expand="true" rows="1" placeholder="A extração estruturada da IA aparecerá aqui para revisão."></textarea></label>
    <div class="actions"><button type="button" class="primary" data-action="approve-derm-exam">Salvar exame revisado</button>
    <button type="button" class="secondary" data-action="discard-derm-exam">Descartar exame</button></div>
  </div>`;
}

function questionCard(form, phase) {
  const first = phase === "lesion";
  const key = first ? "dermLesionQuestionsApproved" : "dermRefinementApproved";
  return `<div class="clinical-card"><h4>${first ? "Perguntas que complementam a lesão" : "Refinamento e sinais de alarme"}</h4>
    <p class="field-hint">A IA sugere perguntas pertinentes. Edite, responda, exclua ou acrescente itens antes de salvar.</p>
    <button type="button" class="secondary" data-action="generate-derm-questions" data-phase="${phase}">Sugerir perguntas</button>
    <p data-derm-ai-status class="field-hint" role="status" aria-live="polite"></p>
    <label>Perguntas e respostas revisadas<textarea data-derm-review="${key}" class="auto-expand" data-auto-expand="true" rows="1">${escapeHtml(form[key] || "")}</textarea></label>
    <button type="button" class="primary" data-action="approve-derm-review" data-field="${key}">Salvar perguntas e respostas</button>
  </div>`;
}

function reviewCard(title, kind, field, approved, source, current) {
  const requiredScope = kind === "hypotheses" ? "diagnostico" : kind === "plan" ? "conduta" : "";
  const generationBlocked = Boolean(requiredScope && !dermatologySourcesAreReady(requiredScope));
  return `<div class="clinical-card"><h4>${title}</h4>
    ${current === false && approved ? `<p class="warning">A etapa anterior mudou. Revise e salve novamente este texto antes de avançar.</p>` : ""}
    ${generationBlocked ? '<p class="warning">Geração por IA indisponível até validar fontes dermatológicas próprias. Você ainda pode redigir e salvar a avaliação médica manualmente.</p>' : ""}
    <details><summary>Material de entrada desta etapa</summary><pre class="field-hint">${escapeHtml(source || "Sem dados aprovados.")}</pre></details>
    <div class="actions"><button type="button" class="secondary" data-action="generate-derm-stage" data-kind="${kind}"${generationBlocked ? " disabled" : ""}>Gerar proposta</button></div>
    <p data-derm-ai-status class="field-hint" role="status" aria-live="polite"></p>
    <label>Texto para revisão médica<textarea data-derm-review="${field}" class="auto-expand" data-auto-expand="true" rows="1">${escapeHtml(approved || "")}</textarea></label>
    <button type="button" class="primary" data-action="approve-derm-review" data-field="${field}">Salvar texto revisado</button>
  </div>`;
}

function historyReadinessCard(form, priorEntries) {
  const readiness = dermatologyHistoryReadiness(form, priorEntries);
  const status = readiness.complete
    ? "Conferência concluída. Os dados estão prontos para compor a história clínica."
    : `${readiness.missing.length} pendência(s): ${readiness.missing.slice(0, 4).map(item => item.label).join("; ")}${readiness.missing.length > 4 ? "; …" : ""}`;
  const domainRows = DERMATOLOGY_HISTORY_DOMAINS.map(item => {
    const name = `dermCompleteness__${item.id}`;
    const note = `dermCompletenessNote__${item.id}`;
    const value = form[name] || "";
    const noteVisible = ["supplemented", "not_applicable"].includes(value);
    return `<div class="clinical-card derm-readiness-item"><label>${escapeHtml(item.question)}<select name="${name}" data-derm-readiness-select="${item.id}">
      <option value=""${value === "" ? " selected" : ""}>Pendente</option>
      <option value="covered"${value === "covered" ? " selected" : ""}>Conferido na transcrição ou exame</option>
      <option value="supplemented"${value === "supplemented" ? " selected" : ""}>Complementado nesta revisão</option>
      <option value="not_applicable"${value === "not_applicable" ? " selected" : ""}>Não se aplica</option>
    </select></label><div data-derm-readiness-note="${item.id}"${noteVisible ? "" : " hidden"}><label><span data-derm-note-label>${value === "not_applicable" ? "Justifique por que não se aplica" : "Resposta complementar"}</span><textarea name="${note}" class="auto-expand" data-auto-expand="true" rows="1">${escapeHtml(form[note] || "")}</textarea></label></div></div>`;
  }).join("");
  const redFlagRows = DERMATOLOGY_RED_FLAGS.map(item => {
    const name = `dermRedFlag__${item.id}`;
    const note = `dermRedFlagNote__${item.id}`;
    const value = form[name] || "";
    const noteVisible = ["present", "not_applicable"].includes(value);
    return `<div class="clinical-card derm-readiness-item"><label>${escapeHtml(item.question)}<select name="${name}" data-derm-red-flag-select="${item.id}">
      <option value=""${value === "" ? " selected" : ""}>Pendente — investigar</option>
      <option value="negative"${value === "negative" ? " selected" : ""}>Investigado — ausente</option>
      <option value="present"${value === "present" ? " selected" : ""}>Presente — registrar avaliação médica</option>
      <option value="not_applicable"${value === "not_applicable" ? " selected" : ""}>Não se aplica</option>
    </select></label><div data-derm-readiness-note="${item.id}"${noteVisible ? "" : " hidden"}><label><span data-derm-note-label>${value === "not_applicable" ? "Justifique por que não se aplica" : "Achado e avaliação/disposição médica"}</span><textarea name="${note}" class="auto-expand" data-auto-expand="true" rows="1">${escapeHtml(form[note] || "")}</textarea></label></div></div>`;
  }).join("");
  return `<div class="clinical-card"><h4>Conferência obrigatória antes da história clínica</h4>
    <p class="field-hint">A checagem é determinística: a IA não decide se faltam dados nem libera esta etapa. Confirme cada domínio com base na anamnese e no exame; complemente lacunas ou justifique o que não se aplica. Investigue todos os sinais de alarme abaixo. Um sinal presente exige registro da avaliação/disposição médica.</p>
    <p class="field-hint" role="status" aria-live="polite" data-derm-history-readiness>${escapeHtml(status)}</p>
    <details open><summary>Dados dermatológicos essenciais (${DERMATOLOGY_HISTORY_DOMAINS.length})</summary>${domainRows}</details>
    <details open><summary>Sinais de alarme (${DERMATOLOGY_RED_FLAGS.length})</summary>${redFlagRows}</details>
  </div>`;
}

export function dermatologyConsultationPage(page, form = {}, patient = {}, priorEntries = []) {
  form = dermatologyFormValues(form);
  if (page === "anamnese") return `<div class="clinical-card"><h4>Transcrição de voz por IA</h4>
    <p class="field-hint">Grave a conversa para transcrevê-la. Confira e edite o texto: ele será considerado na história clínica estruturada.</p>
    ${voiceTextarea("dermVoiceTranscript", "Transcrição da consulta", form.dermVoiceTranscript || "")}
  </div>` + photographicExam(form, priorEntries);
  if (page === "psiquico") return examUploads(form)
    + section("Exame físico por aparelhos", DERMATOLOGY_SYSTEMS_FIELDS, form, "dermS_")
    + textarea("dermSystemsExam", "Exame físico por aparelhos e sinais sistêmicos", form.dermSystemsExam || "", "", 5)
    + section("Revisão clínica", [
    ["evolucao", "Evolução e mudança das lesões"], ["exposicao", "Relação temporal com exposições"],
    ["alarme", "Sinais de alarme investigados"], ["exames", "Exames e biópsia considerados"]
  ], form, "dermR_")
    + choices("Sinais de alarme", "dermAlarmes", DERMATOLOGY_ALARM_OPTIONS, form)
    + questionCard(form, "refinement");
  if (page === "evolucao") return historyReadinessCard(form, priorEntries) + reviewCard("História clínica estruturada", "history", "dermHistoryApproved",
    form.dermHistoryApproved, dermatologySourceText(form, patient, priorEntries), historyIsCurrent(form, patient, priorEntries));
  if (page === "diagnostico") return reviewCard("Hipóteses diagnósticas", "hypotheses", "dermHdApproved",
    form.dermHdApproved, historyIsCurrent(form, patient, priorEntries) ? form.dermHistoryApproved : "", hdIsCurrent(form, patient, priorEntries))
    + (DERMATOLOGY_ASSESSMENT_FIELDS.some(([key]) => form[`dermD_${key}`])
      ? `<details class="clinical-card"><summary>Dados diagnósticos de registros anteriores</summary>${section("Avaliação anterior", DERMATOLOGY_ASSESSMENT_FIELDS, form, "dermD_")}</details>` : "");
  if (page === "tratamento") return reviewCard("Conduta e tratamento", "plan", "dermPlanApproved",
    form.dermPlanApproved, hdIsCurrent(form, patient, priorEntries) ? form.dermHdApproved : "", planIsCurrent(form, patient, priorEntries))
    + (DERMATOLOGY_PLAN_FIELDS.some(([key]) => form[`dermP_${key}`])
      ? `<details class="clinical-card"><summary>Conduta de registros anteriores</summary>${section("Conduta anterior", DERMATOLOGY_PLAN_FIELDS, form, "dermP_")}</details>` : "");
  if (page === "resumo") return dermatologySummary(form, patient, priorEntries);
  if (page === "medicamentos") return section("Terapias em uso", [
    ["topicos", "Tratamentos tópicos"], ["sistemicos", "Tratamentos sistêmicos"],
    ["procedimentos", "Procedimentos"]
  ], form, "dermT_");
  if (page === "escalas") return textarea("dermMedidas", "Medidas e instrumentos dermatológicos utilizados", form.dermMedidas || "", "", 5);
  if (page === "documentos") return textarea("dermDocumentos", "Documentos e orientações emitidos", form.dermDocumentos || "", "", 5);
  return "";
}

export function dermatologyReturnPage(page, form = {}, previous = {}, patient = {}, priorEntries = []) {
  form = dermatologyFormValues(form);
  if (page === "evolucao-retorno") return section("Evolução desde o atendimento anterior", [
    ["resposta", "Resposta à conduta anterior"], ["sintomas", "Sintomas atuais"],
    ["lesoes", "Mudança nas lesões"], ["exame", "Exame cutâneo atual"],
    ["eventos", "Eventos adversos e novas exposições"]
  ], form, "dermRet_") + `<p class="field-hint">Atendimento anterior: ${escapeHtml(previous.label || "sem identificação")}</p>`
    + dermatologyConsultationPage("anamnese", form, patient, priorEntries);
  if (page === "texto-retorno") return section("Ajuste de conduta", DERMATOLOGY_PLAN_FIELDS, form, "dermP_")
    + textarea("dermNarrativa", "Evolução dermatológica", form.dermNarrativa || "", "", 8);
  return dermatologyConsultationPage(page, form, patient, priorEntries);
}

export function dermatologySummary(form = {}, patient = {}, priorEntries = []) {
  form = dermatologyFormValues(form);
  const excluded = new Set(["dermLesions", "dermImages", "dermExams", "dermApprovedDescription", "dermHistorySource", "dermHdSource", "dermPlanSource"]);
  const rows = Object.entries(form).filter(([key, value]) => key.startsWith("derm") && !excluded.has(key)
    && value && (!Array.isArray(value) || value.length));
  const chronologicalRows = [
    ...chronological(form.dermImages).map(item => ["Imagem", item]),
    ...chronological(form.dermExams).map(item => ["Exame", item])
  ].sort((a, b) => String(a[1].date || "").localeCompare(String(b[1].date || "")));
  return `<div class="clinical-card"><h4>${escapeHtml(patient.nome || "Paciente")}</h4>
    ${chronologicalRows.map(([kind, item]) => `<p><strong>${kind} — ${escapeHtml(item.date || "data não informada")}:</strong> ${escapeHtml(item.description || "")}</p>`).join("")}
    ${rows.map(([key, value]) => `<p><strong>${escapeHtml(key.replace(/^derm/, ""))}:</strong> ${escapeHtml(Array.isArray(value) ? value.join(", ") : value)}</p>`).join("")}
    ${form.dermHistoryApproved && !historyIsCurrent(form, patient, priorEntries) ? '<p class="warning">História clínica desatualizada após mudança dos dados de origem.</p>' : ""}
    ${form.dermHdApproved && !hdIsCurrent(form, patient, priorEntries) ? '<p class="warning">HD pendente de revisão após mudança da história.</p>' : ""}
    ${form.dermPlanApproved && !planIsCurrent(form, patient, priorEntries) ? '<p class="warning">Conduta pendente de revisão após mudança da HD.</p>' : ""}
    ${!chronologicalRows.length && !rows.length ? "<p>Nenhum achado dermatológico registrado.</p>" : ""}</div>`;
}

export function dermatologyReportText(form = {}, patient = {}, priorEntries = []) {
  form = dermatologyFormValues(form);
  const fields = [
    ["Transcrição de voz revisada", "dermVoiceTranscript"],
    ["Queixa", "dermA_queixaPrincipal"], ["História", "dermA_historiaDoencaAtual"],
    ["Inspeção cutânea", "dermE_localizacao"], ["Morfologia", "dermMorfologia"],
    ["Exame por aparelhos", "dermSystemsExam"],
    ["Perguntas e respostas", "dermLesionQuestionsApproved"],
    ["Refinamento", "dermRefinementApproved"],
    ["História clínica estruturada", "dermHistoryApproved"],
    ["Hipóteses diagnósticas", "dermHdApproved"],
    ["Conduta revisada", "dermPlanApproved"],
    ["Diagnóstico anterior", "dermD_diagnosticoPrincipal"], ["Conduta anterior", "dermP_tratamento"],
    ["Evolução anterior", "dermNarrativa"]
  ];
  const report = fields.filter(([, key]) => form[key] && (!Array.isArray(form[key]) || form[key].length))
    .map(([label, key]) => `${label}: ${Array.isArray(form[key]) ? form[key].join(", ") : form[key]}`)
    .join("\n\n");
  const lesions = (form.dermLesions || []).map((lesion, index) =>
    `Lesão ${index + 1}: ${[lesion.localizacao, lesion.dimensoes, lesion.evolucao].filter(Boolean).join("; ")}`).join("\n");
  const images = chronological(form.dermImages).map(item => `Imagem ${item.date || "sem data"}: ${item.description || ""}`).join("\n");
  const exams = chronological(form.dermExams).map(item => `Exame ${item.date || "sem data"} (${item.type || "tipo não informado"}): ${item.description || ""}`).join("\n");
  const stale = [
    form.dermHistoryApproved && !historyIsCurrent(form, patient, priorEntries) ? "ATENÇÃO: história clínica desatualizada." : "",
    form.dermHdApproved && !hdIsCurrent(form, patient, priorEntries) ? "ATENÇÃO: HD pendente de revisão." : "",
    form.dermPlanApproved && !planIsCurrent(form, patient, priorEntries) ? "ATENÇÃO: conduta pendente de revisão." : ""
  ].filter(Boolean).join("\n");
  return [report, images, exams, lesions, stale].filter(Boolean).join("\n\n") || "Nenhum dado dermatológico registrado.";
}
