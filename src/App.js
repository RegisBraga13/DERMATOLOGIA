import { buildDiagnosticSuggestion, doctorSelectedOptions, diagnosticEtiologicalOptionLines, diagnosticNosologicalOptionLines, diagnosticSyndromicOptionLines, formatDiagnosticOption, formatMedicationTreatmentOption, formatNonPharmacologicalOption, normalizeDiagnosticOptions, parseTreatmentResponse, selectedDiagnosisText, selectedDiagnosisValues, treatmentOptionLines } from "./clinical/diagnosis.js";
import { anamnesisText, buildEvolutionNarrative, conciseAntecedentsText, conciseComplaintText, conciseDiagnosticText, conciseHdaText, conciseIdentityText, conciseMentalExamText, joinWithOutro, mentalStateFindings, normalizeEvolutionNarrative, outdatedEvolutionText, patientIdentificationText, professionalSelectedTreatmentItems, removeReturnBoilerplate, requestedExamsText, returnEvolutionContainsIdentity, returnStoryText, shouldRefreshEvolutionNarrative, treatmentDiagnosisText } from "./clinical/narrative.js";
import { loadProtocol, protocolLoaded } from "./clinical/protocol.js";
import { arrayValue, calculateAge, capitalizeFirst, cleanClinicalLine, clinicalPhrase, compactText, formatClinicalList, formatPlainList, joinValues, lowerFirst, mentalExamKeys, normalizedSingleChoiceValue, normalizeText, optionDisplayLabel, professionalClinicalTerms, professionalList, professionalListWithOther, stripFinalPeriod } from "./clinical/textFormat.js";
import { ANAMNESIS_AI_FIELDS, anamnesisQuestionGroups, consultationPages, doctorDiagnosisOptions, EVOLUTION_REFRESH_PATTERNS, laboratoryExamRequestItems, MENTAL_EXAM_AI_FIELDS, pagesForScope, RETURN_BOILERPLATE_PHRASES, returnPages } from "./clinical/vocabulary.js";
import { optionGroups } from "./data/examOptions.js?v=tratamento-4";
import { medications } from "./data/medications.js?v=medicamentos-1";
import { fetchCep } from "./services/cepService.js";
import { buildClinicalAiPrompt, buildRagQuery, canonicalAiSelections, localRefinementPlan, requestClinicalAi } from "./services/clinicalAiService.js";
import { buildMedicationAutofill, localMedicationSuggestions } from "./services/medicationService.js";
import { exportTextAsPdf } from "./services/pdfService.js?v=pdf-download-2";
import { loadState, mergeStates, saveState, uid } from "./services/storageService.js";
import { currentSession, pullState, pushState, signIn } from "./services/supabaseService.js";
import { formatDiarizedTranscript, preferredRecordingMimeType, requestConsultationTranscription, showMicrophonePermissionHelp } from "./services/voiceService.js";
import { anamnesisStructuredFields, chips, field, selectField, summaryColumns, textarea, voiceTextarea } from "./ui/controls.js";
import { escapeAttr, escapeHtml } from "./ui/html.js";
import { clipboardIcon, folderIcon, homeIcon, lockIcon, microphoneIcon, personIcon, repeatIcon, themeIcon } from "./ui/icons.js";
import { clinicalSummaryGroups, clinicalSummaryPage } from "./views/clinicalSummary.js";
import { aiModeSelector, diagnosisModule, evolutionBody, ragSourcesView, treatmentModule } from "./views/decisions.js";
import { consultationAccessPanel, mentalExamBody, neurologicExamBody, recordReturnAction, returnAssessmentBody } from "./views/exams.js";
import { medicationReferenceCard } from "./views/medication.js";

const app = document.querySelector("#app");
let state = loadState();
let view = "dashboard";
let medicationLookupTimer = null;
let selectedPatientId = state.patients[0]?.id || "";
let draft = {};
let consultationPage = "anamnese";
let returnPage = "evolucao-retorno";
let modal = null;
let pendingViewAfterPatient = "";
let activeVoiceRecorder = null;
let activeVoiceStream = null;
let activeVoiceChunks = [];
let activeVoiceStartedAt = 0;
let activeVoiceDurationTimer = null;
let activeVoiceButton = null;
let voiceTranscribing = false;
let anamnesisProcessingSequence = 0;
let clinicalDraftRevision = 0;
let refinementGenerating = false;
let authSession = null;
let authError = "";
// Falha de sincronizacao com o Supabase. Separada de authError, que so a tela
// de login renderiza: aqui precisa aparecer com a sessao aberta.
let syncError = "";
const RECORD_SEARCH_TEXT_CACHE = new WeakMap();
const ENTRY_TIMESTAMP_CACHE = new WeakMap();

const icons = {
  patient: personIcon(),
  consult: clipboardIcon(),
  return: repeatIcon(),
  record: folderIcon(),
  exit: lockIcon()
};

currentSession().then(async session => {
  authSession = session;
  if (authSession) {
    try {
      const remoteState = await pullState();
      if (remoteState) {
        // Une, nao substitui: o que foi escrito enquanto a sincronizacao
        // estava fora precisa sobreviver ao proximo carregamento.
        state = mergeStates(state, remoteState);
        saveState(state);
        selectedPatientId = state.patients?.[0]?.id || "";
        pushState(state).catch(error => { syncError = error.message; });
      }
    } catch (error) { syncError = error.message; }
  }
  render();
});

function render() {
  document.body.classList.toggle("light", state.theme === "light");
  if (!authSession) { app.innerHTML = loginView(); bindAuthEvents(); return; }
  app.innerHTML = `
    <div class="app-shell">
      ${topbar()}
      <main class="container">${view === "dashboard" ? dashboard() : workspace()}</main>
      ${modal || ""}
    </div>
  `;
  bindGlobalEvents();
  bindViewEvents();
}

/**
 * render() substitui todo o innerHTML, então o campo em edição é destruído e
 * recriado. Guarda qual campo estava focado e onde o cursor estava, e devolve
 * os dois depois de redesenhar.
 */
function loginView() {
  return `<main class="auth-shell"><section class="auth-card"><span class="brand-mark">RB</span><h1>Prontuário Psiquiátrico</h1><p>Entre para acessar seus prontuários com segurança.</p><form id="auth-form"><label>E-mail<input name="email" type="email" autocomplete="username" required /></label><label>Senha<input name="password" type="password" autocomplete="current-password" required /></label>${authError ? `<p class="warning">${escapeHtml(authError)}</p>` : ""}<button class="primary" type="submit">Entrar</button></form></section></main>`;
}

function bindAuthEvents() {
  app.querySelector("#auth-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    authError = "";
    try { authSession = await signIn(form.email.value.trim(), form.password.value); render(); }
    catch (error) { authError = error.message; render(); }
  });
}

function topbar() {
  return `
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">RB</span>
        <div><h1>Regis Braga</h1></div>
      </div>
      <div class="top-actions">
        ${syncError
          ? `<span class="sync-status sync-failed" role="status">Não sincronizado: ${escapeHtml(syncError)} O registro está salvo neste aparelho.</span>`
          : `<span class="secure-status"><i></i> Ambiente clínico seguro</span>`}
        ${view === "dashboard" ? "" : `<button class="secondary compact-action" data-action="dashboard">${homeIcon()}<span>Início</span></button>`}
        <button class="icon-button" data-action="toggle-theme" aria-label="Alternar tema" title="Alternar tema">${themeIcon()}</button>
      </div>
    </header>
  `;
}

function dashboard() {
  const cards = [
    ["patient", "Novo paciente", "Cadastre dados pessoais e de contato", "patient", "01"],
    ["consult", "Nova consulta", "Conduza anamnese, exame e evolução", "consultation", "02"],
    ["return", "Registrar retorno", "Acompanhe a resposta ao tratamento", "return", "03"],
    ["record", "Prontuários", "Consulte o histórico clínico completo", "record", "04"]
  ];
  const entries = (state.consultations?.length || 0) + (state.returns?.length || 0);
  return `<section class="dashboard">
      <div class="dashboard-intro">
      <div class="intro-copy">
        <span class="eyebrow">Prontuário psiquiátrico</span>
        <p>Um espaço calmo para registrar, acompanhar e cuidar.</p>
      </div>
      <div class="today"><span>HOJE</span><strong>${new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long" }).format(new Date())}</strong></div>
    </div>
    <div class="dashboard-metrics">
      <div><span>Pacientes cadastrados</span><strong>${String(state.patients?.length || 0).padStart(2, "0")}</strong></div>
      <div><span>Registros clínicos</span><strong>${String(entries).padStart(2, "0")}</strong></div>
      <div class="privacy-note">${lockIcon()}<span><strong>Privacidade em primeiro lugar</strong><small>Dados armazenados somente neste dispositivo</small></span></div>
    </div>
    <div class="quick-heading"><span>Acesso rápido</span><small>Selecione uma ação para começar</small></div>
    <div class="dashboard-actions">${cards.map(([icon, title, desc, target, number]) => `
      <button class="dash-button" data-view="${target}">
        <span class="card-number">${number}</span><span class="dash-icon">${icons[icon]}</span>
        <span class="dash-copy"><strong>${title}</strong><span>${desc}</span></span><span class="card-arrow">→</span>
      </button>`).join("")}</div>
    <button class="session-exit" data-view="exit">${icons.exit}<span>Encerrar sessão</span></button>
  </section>`;
}

function workspace() {
  return `
    <div class="layout">
      <aside class="side">
        <div class="side-label">PRONTUÁRIO</div>
        ${navButton("patient", "Paciente", "patient")}
        ${navButton("consultation", "Consulta", "consult")}
        ${navButton("return", "Retorno", "return")}
        ${navButton("record", "Prontuários", "record")}
        ${navButton("exit", "Sair", "exit")}
        <div class="side-foot"><span>RB</span><div><strong>Dr. Regis Braga</strong><small>Psiquiatria</small></div></div>
      </aside>
      <section class="panel">${renderView()}</section>
    </div>
  `;
}

function navButton(target, label, icon) {
  return `<button class="nav-button ${view === target ? "active" : ""}" data-view="${target}"><span class="icon">${icons[icon]}</span>${label}</button>`;
}

function renderView() {
  if (view === "patient") return patientForm();
  if (view === "consultation") return consultationForm();
  if (view === "return") return returnForm();
  if (view === "record") return medicalRecord();
  if (view === "exit") return exitPanel();
  return dashboard();
}

function patientForm() {
  const patient = draft.patient || {};
  return `
    <div class="panel-title">
      <div><h2>Novo Paciente</h2></div>
      ${patientSelector("edit-patient")}
    </div>
    <form id="patient-form">
      <div class="grid patient-grid">
        ${field("nome", "Nome completo", patient.nome)}
        ${selectField("sexo", "Sexo", optionGroups.sexo, patient.sexo)}
        ${selectField("genero", "Identidade de gênero", optionGroups.genero, patient.genero)}
        ${field("nascimento", "Data de nascimento", patient.nascimento, "date")}
        ${selectField("estadoCivil", "Estado civil", optionGroups.estadoCivil, patient.estadoCivil)}
        ${field("ocupacao", "Ocupacao", patient.ocupacao)}
        ${selectField("escolaridade", "Escolaridade", optionGroups.escolaridade, patient.escolaridade)}
        ${selectField("religiao", "Religiao", optionGroups.religiao, patient.religiao)}
        ${field("email", "E-mail", patient.email, "email")}
        ${field("telefone", "Telefone", patient.telefone, "tel")}
        ${field("emergencia", "Nome e contato de emergencia", patient.emergencia)}
      </div>
      <div class="address-card">
        <div class="address-grid">
          ${field("cep", "CEP", patient.cep)}
          ${field("endereco", "Endereco", patient.endereco)}
          ${field("numero", "Numero", patient.numero)}
          ${field("bairro", "Bairro", patient.bairro)}
          ${field("cidade", "Cidade", patient.cidade)}
          ${field("estado", "UF", patient.estado)}
          ${field("complemento", "Complemento", patient.complemento)}
        </div>
      </div>
      <div class="actions">
        <button class="primary" type="submit">Salvar Paciente</button>
        ${patient.id ? `<button class="danger" type="button" data-action="delete-patient">Excluir paciente</button>` : ""}
      </div>
    </form>
  `;
}

function patientSelector(action = "select-patient") {
  return `
    <label>Paciente
      <select data-action="${action}">
        <option value="">Selecionar paciente</option>
        ${state.patients.map(patient => `<option value="${patient.id}" ${selectedPatientId === patient.id ? "selected" : ""}>${escapeHtml(patient.nome || "Sem nome")}</option>`).join("")}
      </select>
    </label>
  `;
}

function consultationForm() {
  const patient = getPatient();
  if (!patient) return emptyPatientMessage("Nova Consulta");
  const form = draft.consultation || defaultConsultation();
  const isSavedEntry = Boolean(form.id);
  const consultations = consultationsForPatient(patient.id);
  return `
    <div class="panel-title">
      <div><h2>${form.label}</h2><p>${escapeHtml(patient.nome)}</p></div>
      ${patientSelector()}
    </div>
    <form id="consult-form">
      ${isSavedEntry ? recordReturnAction("Consulta anterior aberta para revisao") : ""}
      ${consultationAccessPanel(consultations, form)}
      <div class="clinical-card consultation-mode-card">
        ${selectField("consultationMode", "Modalidade da consulta", ["IN_PERSON", "TELECONSULTATION", "HYBRID"], form.consultationMode || "IN_PERSON")}
      </div>
      ${formPageTabs("consultation")}
      ${consultationPageBody(form, patient)}
    </form>
  `;
}

function returnForm() {
  const patient = getPatient();
  if (!patient) return emptyPatientMessage("Retorno");
  const consultations = consultationsForPatient(patient.id);
  if (!consultations.length) return `
    <div class="panel-title">
      <div><h2>Retorno</h2></div>
      ${patientSelector()}
    </div>
    <div class="warning">Nenhuma consulta salva para este paciente. Crie e salve uma consulta antes de registrar retorno.</div>
    <div class="actions"><button class="primary" data-view="consultation">Ir para consulta</button></div>
  `;
  const form = draft.return || defaultReturn();
  const previous = previousEntryForReturn(form, patient.id);
  return `
    <div class="panel-title">
      <div><h2>${form.label}</h2><p>${escapeHtml(patient.nome)} | comparacao com consulta anterior.</p></div>
      ${patientSelector()}
    </div>
    <form id="return-form">
      ${returnRecordAccessPanel(form, patient.id)}
      ${formPageTabs("return")}
      ${returnPageBody(form, patient, previous)}
    </form>
  `;
}

function returnRecordAccessPanel(form, patientId) {
  const returns = returnsForPatient(patientId);
  return `<div class="clinical-card record-access">
    <h4>Retornos salvos deste paciente</h4>
    <div class="actions">
      <button class="secondary" type="button" data-action="new-return">Novo retorno</button>
      ${returns.length ? returns.map(entry => `
        <button class="secondary ${entry.id === form.id ? "active" : ""}" type="button" data-action="edit-entry" data-id="${entry.id}" data-type="return">
          ${escapeHtml(entry.label)} · ${new Date(entry.createdAt || Date.now()).toLocaleString("pt-BR")}
        </button>
      `).join("") : `<span class="record-empty-state">Nenhum retorno salvo.</span>`}
    </div>
  </div>`;
}

function formPageTabs(scope) {
  const pages = pagesForScope(scope);
  const active = scope === "consultation" ? consultationPage : returnPage;
  return `<nav class="page-tabs" aria-label="Paginas do formulario">${pages.map(([key, label]) => `
    <button type="button" class="${active === key ? "active" : ""}" data-action="form-page" data-scope="${scope}" data-page="${key}">${label}</button>
  `).join("")}</nav>`;
}

function clinicalPage(title, body, scope = "", showActions = true) {
  return `<section class="clinical-page">${title ? `<div class="clinical-page-title"><h3>${title}</h3></div>` : ""}${body}${showActions ? pageStepActions(scope) : ""}</section>`;
}

function consultationPageBody(form, patient) {
  const qphda = form.qphda || [form.queixa && `QP: ${form.queixa}`, form.hdaManual && `HDA: ${form.hdaManual}`].filter(Boolean).join("\n\n");
  const anamnesisInputMode = form.anamnesisInputMode === "microphone" ? "microphone" : "manual";
  if (consultationPage === "anamnese") return clinicalPage("Anamnese", `
    <div class="clinical-card qphda-card">
      <h4>Forma de registro</h4>
      <div class="anamnesis-mode-selector" role="group" aria-label="Forma de registro da anamnese">
        <button class="${anamnesisInputMode === "manual" ? "active" : ""}" type="button" data-action="set-anamnesis-mode" data-mode="manual">Preenchimento pelo médico</button>
        <button class="${anamnesisInputMode === "microphone" ? "active" : ""}" type="button" data-action="set-anamnesis-mode" data-mode="microphone">Microfone e transcrição</button>
      </div>
      ${anamnesisInputMode === "microphone" ? `
        <div class="online-status">O microfone grava toda a conversa. Ao encerrar, a transcrição separa os falantes e o RAG atualiza os campos sem avançar a página.</div>
        ${voiceTextarea("qphda", "Transcrição integral da conversa", qphda)}
      ` : `
        <div class="online-status">Modo manual: nenhum campo ou sintoma será preenchido automaticamente.</div>
        <div class="manual-anamnesis">
          ${textarea("qphda", "Anotação clínica livre", qphda, "", 5)}
          ${textarea("queixa", "QP - preenchimento manual", form.queixa, "", 1)}
          ${textarea("hdaManual", "HDA - preenchimento manual", form.hdaManual, "", 1)}
        </div>
      `}
    </div>
    ${anamnesisQuestionGuide()}
    <div class="clinical-card antecedents-card">
      <h4>Antecedentes pessoais e familiares</h4>
      ${chips("psiPrevios", "Diagnosticos psiquiatricos previos", optionGroups.psiPrevios, form.psiPrevios)}
      ${chips("tratamentos", "Tratamentos previos", optionGroups.tratamentos, form.tratamentos)}
      ${textarea("medicos", "Antecedentes medicos", joinValues(form.medicos), "", 2)}
      ${chips("familiares", "Antecedentes familiares", optionGroups.familiares, form.familiares)}
    </div>
    ${chips("fatores", "Fatores desencadeantes e de piora", optionGroups.fatores, form.fatores)}
    ${chips("fatoresMelhora", "Fatores de melhora", optionGroups.fatoresMelhora, form.fatoresMelhora)}
    ${chips("impacto", "Impacto funcional", optionGroups.impacto, form.impacto)}
  `, "consultation");
  if (consultationPage === "psiquico") return clinicalPage("Exame psiquico", mentalExamBody(form), "consultation");
  if (consultationPage === "neurologico") return clinicalPage("Exame fisico e neurologico", neurologicExamBody(form), "consultation");
  if (consultationPage === "refinamento") return clinicalPage("", refinementBody(form), "consultation");
  if (consultationPage === "resumo") return clinicalPage("Resumo", clinicalSummaryPage(form, patient), "consultation");
  if (consultationPage === "diagnostico") return clinicalPage("Diagnostico e diferenciais", diagnosisModule(form), "consultation");
  if (consultationPage === "tratamento") return clinicalPage("Tratamento e orientacoes", treatmentModule(form), "consultation");
  if (consultationPage === "evolucao") return clinicalPage("Historia clinica", evolutionBody(form, patient), "consultation");
  if (consultationPage === "medicamentos") return clinicalPage("Medicamentos", medicationBody(form), "consultation", false);
  return clinicalPage("Historia clinica", evolutionBody(form, patient), "consultation");
}

function returnPageBody(form, patient, previous) {
  if (returnPage === "evolucao-retorno") return clinicalPage("Avaliacao de evolucao", returnAssessmentBody(form), "return");
  if (returnPage === "diagnostico") return clinicalPage("Diagnostico e diferenciais", diagnosisModule(form), "return");
  if (returnPage === "tratamento") return clinicalPage("Tratamento e orientacoes", treatmentModule(form), "return");
  if (returnPage === "medicamentos") return clinicalPage("Medicamentos", medicationBody(form), "return", false);
  return clinicalPage("Evolucao do Retorno", evolutionBody(form, patient, previous, true), "return");
}

function refinementBody(form = {}) {
  const plan = form.refinementPlan;
  if (!plan) {
    return `
      <section class="refinement-section refinement-empty-state">
        <h4>Refinamento clínico</h4>
        <p>O Refinamento usa o RAG com literatura para explorar lacunas clínicas, pontos essenciais e red flags a partir dos dados registrados.</p>
        <p>${refinementGenerating ? "Preparando perguntas com a literatura..." : "Quando estiver pronto, acione o refinamento para iniciar esta etapa."}</p>
        ${refinementGenerating ? "" : '<button class="primary" type="button" data-action="start-refinement">Iniciar refinamento</button>'}
      </section>
    `;
  }
  const questionBlocks = (plan.questions || []).map((item, index) => {
    const name = `refinementQuestion_${index}`;
    const selected = arrayValue(form[name]);
    const type = item.selection_mode === "multiple" ? "checkbox" : "radio";
    return `<article class="refinement-item"><h4>${escapeHtml(item.topic || `Pergunta ${index + 1}`)}</h4><p>${escapeHtml(item.prompt || "")}</p><div class="chips">${(item.options || []).map(option => `<label class="chip"><input type="${type}" name="${name}" value="${escapeAttr(option)}" ${selected.includes(option) ? "checked" : ""}>${escapeHtml(option)}</label>`).join("")}</div></article>`;
  }).join("");
  const decisionBlock = (title, items, prefix, options) => !items?.length ? "" : `<section class="refinement-section"><h4>${title}</h4>${items.map((item, index) => {
    const name = `${prefix}_${index}`;
    const selected = arrayValue(form[name])[0] || "";
    return `<article class="refinement-item"><strong>${escapeHtml(item.topic || "")}</strong><p>${escapeHtml(item.reason || "")}</p><div class="chips">${options.map(option => `<label class="chip"><input type="radio" name="${name}" value="${escapeAttr(option)}" ${selected === option ? "checked" : ""}>${escapeHtml(option)}</label>`).join("")}</div></article>`;
  }).join("")}</section>`;
  return `
    <section class="refinement-section refinement-questions-section"><h4>Perguntas de refinamento</h4>${questionBlocks}</section>
    ${decisionBlock("Red flags", plan.red_flags, "refinementRedFlag", ["Confirmada", "Negada", "Nao avaliada"])}
    ${decisionBlock("Observacoes", plan.observations, "refinementObservation", ["Pertinente", "Nao pertinente", "Reavaliar"])}
    ${decisionBlock("Pontos importantes", plan.important_points, "refinementImportant", ["Confirmado", "Negado", "Nao esclarecido"])}
    ${textarea("refinementDoctorNotes", "Observacoes do medico", form.refinementDoctorNotes, "", 3)}
  `;
}

function medicationBody(form) {
  const medicationName = form.medicationGeneric || "";
  const hasInformation = Boolean(form.medicationNameText || form.medicationPresentation || form.medicationSafety || form.medicationBestUse);
  return `
    <div class="medication-reference">
      <header class="medication-reference-head">
        <span class="eyebrow">CONSULTA FARMACOLÓGICA · BRASIL</span>
      </header>
      <div class="medication-search-shell">
        <span class="medication-search-icon" aria-hidden="true">⌕</span>
        <input id="medication-lookup" name="medicationGeneric" value="${escapeAttr(medicationName)}"
          autocomplete="off" role="combobox" aria-autocomplete="list" aria-controls="medication-suggestions" />
        <button class="medication-clear" type="button" data-action="clear-medication-lookup" aria-label="Limpar pesquisa">×</button>
      </div>
      <div id="medication-suggestions" class="medication-suggestions" role="listbox"></div>
      ${aiModeSelector(form.pharmaAiMode || "rag", "pharmaAiMode")}
      <div class="actions"><button class="primary" type="button" data-action="generate-medication-ai">Gerar</button></div>
      ${form.medicationOnlineStatus ? `<p class="medication-source-status">${escapeHtml(form.medicationOnlineStatus)}</p>` : ""}
      ${ragSourcesView(form.ragSources)}
      ${hasInformation ? medicationReferenceCard(form) : `
        <div class="medication-empty-state">
          <span>Rx</span>
          <h4>Medicamento</h4>
        </div>
      `}
    </div>
  `;
}

function medicalRecord() {
  const patient = getPatient();
  if (!patient) return emptyPatientMessage("Prontuário");
  const query = (draft.recordQuery || "").toLowerCase();
  const patientEntries = entriesForPatient(patient.id);
  const all = query
    ? patientEntries.filter(entry => recordSearchText(entry).includes(query))
    : patientEntries;
  return `
    <div class="panel-title">
      <div><h2>Prontuário Longitudinal</h2></div>
      ${patientSelector()}
    </div>
    <div class="record-grid">
      <div>
        ${field("recordSearch", "Busca por palavra-chave, diagnostico, medicamento ou data", draft.recordQuery || "")}
      </div>
      <div class="timeline" aria-live="polite">${recordTimeline(all)}</div>
    </div>
  `;
}

function recordTimeline(entries) {
  if (!entries.length) return `<div class="warning">Nenhum registro encontrado para os filtros atuais.</div>`;
  return entries.map(entry => `
    <article class="timeline-item">
      <h4>${escapeHtml(entry.label)} - ${new Date(entry.createdAt).toLocaleString("pt-BR")}</h4>
      <p>${escapeHtml(recordReportText(entry))}</p>
      <div class="actions">
        <button class="secondary" data-action="pdf-entry" data-id="${entry.id}" data-type="${entry.type}">Exportar PDF</button>
      </div>
    </article>`).join("");
}

function exitPanel() {
  return `
    <div class="panel-title"><div><h2>Sair do Sistema</h2></div></div>
    <div class="warning">Antes de sair, revise se ha evolucoes em edicao. O sistema tenta salvar automaticamente ao submeter formularios, mas dados sensiveis exigem backend seguro em producao.</div>
    <div class="actions"><button class="danger" data-action="confirm-exit">Sair do Sistema</button><button class="secondary" data-action="dashboard">Cancelar</button></div>
  `;
}

function emptyPatientMessage(title) {
  return `<div class="panel-title"><div><h2>${title}</h2><p>Selecione ou cadastre um paciente para continuar.</p></div>${patientSelector()}</div><div class="actions"><button class="primary" data-view="patient">Novo Paciente</button></div>`;
}

function anamnesisQuestionGuide() {
  const form = currentClinicalDraft();
  const itemOrder = [
    "Sintomas depressivos",
    "Mania/hipomania",
    "Ansiedade e panico",
    "Sono",
    "Apetite",
    "Impacto",
    "Habitos, substancias e comportamentos aditivos",
    "Paranoia e sintomas psicoticos",
    "Risco de suicidio e desesperanca"
  ];
  const orderedItems = anamnesisQuestionGroups
    .flatMap(group => group.items)
    .sort(([labelA], [labelB]) => itemOrder.indexOf(labelA) - itemOrder.indexOf(labelB));

  return `<div class="clinical-card anamnesis-guide">
    <div class="online-status">Roteiro semiológico orientado por RAG: registre cronologia, polaridade do humor, sintomas associados, psicose, risco, substâncias, causas médicas, funcionamento e fatores de proteção. Os campos abaixo são pontos de apoio; a narrativa da consulta continua sendo a fonte principal.</div>
    <div class="guide-group">
      <div class="guide-items">
        ${orderedItems.map(([label, questions]) => `
          <section>
            <span>${escapeHtml(label)}</span>
            ${questions.some(question => typeof question === "object")
              ? anamnesisStructuredFields(questions, form)
              : `<ul>${questions.map(question => `<li>${escapeHtml(question)}</li>`).join("")}</ul>`}
          </section>
        `).join("")}
      </div>
    </div>
  </div>`;
}

function currentPageForScope(scope) {
  return scope === "consultation" ? consultationPage : returnPage;
}

function nextPageForScope(scope) {
  const pages = pagesForScope(scope);
  const current = currentPageForScope(scope);
  const index = pages.findIndex(([key]) => key === current);
  return index >= 0 ? pages[index + 1]?.[0] || "" : "";
}

function pageStepActions(scope) {
  if (!scope) return "";
  const nextPage = nextPageForScope(scope);
  const current = currentClinicalDraft();
  const recordLabel = current.id
    ? (scope === "return" ? "Atualizar retorno" : "Atualizar consulta")
    : (scope === "return" ? "Salvar retorno" : "Salvar consulta");
  if (scope === "return" && nextPage) {
    return `<div class="actions page-actions">
      <button class="primary" type="button" data-action="save-next-page" data-scope="return">Salvar e avançar</button>
    </div>`;
  }
  return `<div class="actions page-actions">
    ${nextPage ? `<button class="primary" type="button" data-action="save-next-page" data-scope="${scope}">Salvar e avancar</button>` : ""}
    ${scope === "return" ? `<button class="secondary" type="submit">${recordLabel}</button>` : ""}
  </div>`;
}

function bindGlobalEvents() {
  app.querySelectorAll("[data-view]").forEach(button => {
    button.addEventListener("click", () => {
      if ((button.dataset.view === "consultation" || button.dataset.view === "return" || button.dataset.view === "record") && !selectedPatientId) {
        pendingViewAfterPatient = button.dataset.view;
        view = "patient";
        draft.patient = draft.patient || {};
        render();
        return;
      }
      view = button.dataset.view;
      if (view === "consultation" && selectedPatientId) draft.consultation = draft.consultation || defaultConsultation();
      if (view === "return" && selectedPatientId) draft.return = draft.return || defaultReturn();
      render();
    });
  });
  app.querySelectorAll("[data-action='dashboard']").forEach(button => button.addEventListener("click", () => { view = "dashboard"; render(); }));
  app.querySelector("[data-action='toggle-theme']")?.addEventListener("click", () => {
    state.theme = state.theme === "light" ? "dark" : "light";
    persist();
    render();
  });
  app.querySelectorAll("[data-action='select-patient']").forEach(select => select.addEventListener("change", event => {
    selectedPatientId = event.target.value;
    draft.consultation = selectedPatientId ? defaultConsultation() : {};
    draft.return = selectedPatientId ? defaultReturn() : {};
    consultationPage = "anamnese";
    returnPage = "evolucao-retorno";
    render();
  }));
  app.querySelectorAll("[data-action='edit-patient']").forEach(select => select.addEventListener("change", event => {
    selectedPatientId = event.target.value;
    draft.patient = structuredClone(getPatient() || {});
    render();
  }));
}

function bindViewEvents() {
  bindAutoDraft();
  bindAutoExpandingTextareas();
  bindMedicationLookup();
  bindPatientForm();
  bindConsultForm();
  bindReturnForm();
  bindRecord();
  bindActions();
}

function bindAutoExpandingTextareas() {
  app.querySelectorAll("textarea[data-auto-expand='true']").forEach(field => {
    const resize = () => {
      field.style.height = "auto";
      field.style.height = `${Math.max(field.scrollHeight, field.classList.contains("auto-expand") ? 0 : 300)}px`;
    };
    resize();
    field.addEventListener("input", resize);
  });
}

function bindMedicationLookup() {
  const input = app.querySelector("#medication-lookup");
  const suggestionBox = app.querySelector("#medication-suggestions");
  if (!input || !suggestionBox) return;

  const showSuggestions = suggestions => {
    suggestionBox.innerHTML = suggestions.length
      ? suggestions.map(item => `<button type="button" role="option" data-medication-name="${escapeAttr(item.name)}"><strong>${escapeHtml(item.name)}</strong>${item.detail ? `<span>${escapeHtml(item.detail)}</span>` : ""}</button>`).join("")
      : input.value.trim().length >= 2 ? `<p>Nenhuma correspondência imediata. Continue digitando para consultar as bases online.</p>` : "";
    suggestionBox.classList.toggle("is-open", Boolean(suggestionBox.innerHTML));
    suggestionBox.querySelectorAll("[data-medication-name]").forEach(button => {
      button.addEventListener("click", () => selectMedicationLookup(button.dataset.medicationName));
    });
  };

  input.addEventListener("input", event => {
    updateDraftFromForm(event.target.closest("form"));
    const term = event.target.value.trim();
    const local = localMedicationSuggestions(term);
    showSuggestions(local);
    clearTimeout(medicationLookupTimer);
    if (term.length >= 3) showSuggestions(local);
  });

  input.addEventListener("focus", () => showSuggestions(localMedicationSuggestions(input.value)));
}

async function selectMedicationLookup(name) {
  const scope = view === "return" ? "return" : "consultation";
  const target = scope === "return" ? draft.return : draft.consultation;
  const local = null;
  const loading = {
    medicationGeneric: name,
    medicationOnlineStatus: local ? "Carregando ficha clínica e verificando fontes complementares..." : "Consultando RxNav/NLM e openFDA..."
  };
  if (scope === "return") draft.return = { ...(target || {}), ...loading };
  else draft.consultation = { ...(target || {}), ...loading };
  render();

  const information = { medicationGeneric: name };
  if (scope === "return") draft.return = { ...(draft.return || {}), ...information };
  else draft.consultation = { ...(draft.consultation || {}), ...information };
  render();
}

function clearMedicationLookup() {
  const scope = view === "return" ? "return" : "consultation";
  const cleared = {
    medicationGeneric: "", medicationNameText: "", medicationBrands: "", medicationClass: "",
    medicationPresentation: "", medicationSafety: "", medicationBestUse: "", medicationMechanism: "",
    medicationMonitoring: "", medicationSpecialPopulations: "", medicationOnlineStatus: "",
    medicationActiveIngredient: "", medicationPresentationHighlight: "", medicationRecommendedDose: "",
    medicationMainEffects: ""
  };
  if (scope === "return") draft.return = { ...(draft.return || {}), ...cleared };
  else draft.consultation = { ...(draft.consultation || {}), ...cleared };
  render();
}

function bindAutoDraft() {
  const forms = app.querySelectorAll("form");
  forms.forEach(form => {
    form.addEventListener("input", event => {
      clinicalDraftRevision += 1;
      updateDraftFromForm(form);
      if (form.id === "consult-form" && consultationPage === "anamnese" && ["queixa", "hdaManual", "medicos", "qphda"].includes(event.target?.name)) {
        const target = draft.consultation || defaultConsultation();
        target.anamnesisDoctorTextOverrides = { ...(target.anamnesisDoctorTextOverrides || {}), [event.target.name]: true };
        draft.consultation = target;
      }
    });
    form.addEventListener("change", event => {
      clinicalDraftRevision += 1;
      if (["maniaHipomaniaSintomas", "psicoseSintomas", "riscoSuicidioIndicadores", "eventos", "efeitos", "funcionalidadeEventosRetorno"].includes(event.target?.name) && event.target.checked) {
        const options = form.querySelectorAll(`input[name='${event.target.name}']`);
        const denialOptions = ["Nega sintomas relacionados", "Nega ideacao, plano ou intencao suicida", "Nenhum"];
        if (denialOptions.includes(event.target.value)) {
          options.forEach(option => { if (option !== event.target) option.checked = false; });
        } else {
          options.forEach(option => {
            if (denialOptions.includes(option.value)) option.checked = false;
          });
        }
      }
      updateDraftFromForm(form);
      recordAnamnesisDoctorOverride(event.target);
      if (event.target?.name === "examesSolicitados") {
        const hiddenExams = form.querySelector("textarea[name='examesLaboratoriais']");
        if (hiddenExams) hiddenExams.value = requestedExamsText(currentClinicalDraft() || {});
      }
      if (event.target?.name === "diagnosticoSelecionado") {
        updateSelectedDiagnosisFromForm(form);
        render();
        return;
      }
      if (["tratamentoMedicamentosSelecionados", "abordagensSelecionadas"].includes(event.target?.name)) {
        updateSelectedTreatmentFromForm(form);
        render();
        return;
      }
      if (event.target?.matches?.("input[type='checkbox'][value='Outro'], select")) render();
    });
  });
}

function recordAnamnesisDoctorOverride(control) {
  if (view !== "consultation" || consultationPage !== "anamnese" || control?.type !== "checkbox" || !control.name) return;
  const fieldEntry = Object.values(ANAMNESIS_AI_FIELDS).find(([formKey]) => formKey === control.name);
  if (!fieldEntry) return;
  const [, allowed] = fieldEntry;
  const target = draft.consultation || defaultConsultation();
  const overrides = { ...(target.anamnesisDoctorOverrides || {}) };
  const key = option => `${control.name}:${option}`;
  overrides[key(control.value)] = control.checked;
  const denialOptions = ["Nega sintomas relacionados", "Nega ideacao, plano ou intencao suicida", "Nenhum"];
  if (control.checked && denialOptions.includes(control.value)) {
    allowed.forEach(option => { overrides[key(option)] = option === control.value; });
  } else if (control.checked) {
    allowed.filter(option => denialOptions.includes(option)).forEach(option => { overrides[key(option)] = false; });
  }
  target.anamnesisDoctorOverrides = overrides;
  draft.consultation = target;
}

function bindPatientForm() {
  const form = app.querySelector("#patient-form");
  if (!form) return;
  form.querySelector("[name='cep']")?.addEventListener("blur", async event => {
    try {
      const address = await fetchCep(event.target.value);
      Object.assign(draft.patient || {}, formToObject(form), address);
      render();
    } catch {
      // CEP incompleto/invalido: silencioso, sem caixa de status para avisar.
    }
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    const data = { ...(draft.patient || {}), ...formToObject(form) };
    if (!data.nome?.trim()) return alert("Informe o nome completo.");
    if (data.id) {
      state.patients = state.patients.map(patient => patient.id === data.id ? { ...patient, ...data, updatedAt: new Date().toISOString() } : patient);
    } else {
      data.id = uid("patient");
      data.createdAt = new Date().toISOString();
      state.patients.push(data);
    }
    selectedPatientId = data.id;
    draft.patient = structuredClone(data);
    persist();
    view = pendingViewAfterPatient || "consultation";
    if (view === "consultation") draft.consultation = defaultConsultation();
    if (view === "return") draft.return = defaultReturn();
    pendingViewAfterPatient = "";
    render();
  });
}

function bindConsultForm() {
  const form = app.querySelector("#consult-form");
  if (!form) return;
  form.addEventListener("submit", event => {
    event.preventDefault();
    updateDraftFromForm(form);
    saveClinicalRecord("consultation");
    render();
  });
}

function bindReturnForm() {
  const form = app.querySelector("#return-form");
  if (!form) return;
  form.addEventListener("submit", event => {
    event.preventDefault();
    updateDraftFromForm(form);
    saveClinicalRecord("return");
    render();
  });
}

function bindRecord() {
  const timeline = app.querySelector(".timeline");
  app.querySelector("[name='recordSearch']")?.addEventListener("input", event => {
    draft.recordQuery = event.target.value;
    // render() troca todo o innerHTML do app: o input seria recriado e perderia
    // o foco a cada tecla. Só a lista precisa mudar.
    if (!timeline) { render(); return; }
    const patient = getPatient();
    if (!patient) return;
    const query = (draft.recordQuery || "").toLowerCase();
    const entries = entriesForPatient(patient.id);
    timeline.innerHTML = recordTimeline(query ? entries.filter(entry => recordSearchText(entry).includes(query)) : entries);
    // Os botões "Exportar PDF" recriados continuam funcionando via delegação em bindActions().
  });
}

// Delegação: um único listener no container, registrado uma vez.
// Antes eram N listeners recriados a cada render(), e qualquer trecho de HTML
// inserido fora do render() (ex.: a timeline do prontuário) ficava sem handler.
let actionsBound = false;

function bindActions() {
  if (actionsBound) return;
  actionsBound = true;
  app.addEventListener("click", async event => {
    const element = event.target.closest("[data-action]");
    if (element) {
      const action = element.dataset.action;
      if (["dashboard", "toggle-theme", "select-patient", "edit-patient"].includes(action)) return;
      if (action === "form-page") switchFormPage(element);
      if (action === "start-refinement") await startRefinement(element);
      if (action === "save-next-page") await saveCurrentPageAndAdvance(element);
      if (action === "generate-diagnosis") await generateDiagnosisFromClinicalData(element);
      if (action === "generate-treatment") await generateTreatmentFromClinicalData(element);
      if (action === "generate-evolution") await generateEvolutionFromClinicalData(element);
      if (action === "generate-medication-ai") await generateMedicationFromClinicalData(element);
      if (action === "fill-medication-info") await fillMedicationInfo(element);
      if (action === "clear-medication-lookup") clearMedicationLookup();
      if (action === "set-anamnesis-mode") setAnamnesisInputMode(element.dataset.mode);
      if (action === "clear-patient") { draft.patient = {}; render(); }
      if (action === "delete-patient") deletePatient();
      if (action === "voice") startVoice(element.dataset.target, element);
      if (action === "edit-current-patient") { view = "patient"; draft.patient = structuredClone(getPatient()); render(); }
      if (action === "edit-entry") editEntry(element.dataset.id, element.dataset.type);
      if (action === "new-consultation") { draft.consultation = defaultConsultation(); consultationPage = "anamnese"; render(); }
      if (action === "new-return") startNewReturn();
      if (action === "back-to-record") { view = "record"; render(); }
      if (action === "pdf-entry") pdfEntry(element.dataset.id, element.dataset.type);
      if (action === "pdf-summary") pdfClinicalSummary();
      if (action === "delete-entry") deleteEntry(element.dataset.id, element.dataset.type);
      if (action === "confirm-exit") showExitModal();
      if (action === "close-modal") { modal = null; render(); }
      if (action === "exit-now") { modal = null; view = "dashboard"; render(); }
    }
  });
}

function switchFormPage(element) {
  const form = element.closest("form");
  if (form) updateDraftFromForm(form);
  if (element.dataset.scope === "consultation") consultationPage = element.dataset.page;
  if (element.dataset.scope === "return") returnPage = element.dataset.page;
  render();
}

function setAnamnesisInputMode(mode) {
  if (activeVoiceRecorder?.state === "recording" || voiceTranscribing) {
    alert("Encerre a gravação e aguarde a transcrição antes de trocar a forma de registro.");
    return;
  }
  const target = draft.consultation || defaultConsultation();
  target.anamnesisInputMode = mode === "microphone" ? "microphone" : "manual";
  draft.consultation = target;
  render();
}

async function startRefinement(element) {
  const form = element.closest("form");
  if (form) updateDraftFromForm(form);
  refinementGenerating = true;
  render();
  await prepareRefinementFromClinicalData();
  refinementGenerating = false;
  render();
}

async function saveCurrentPageAndAdvance(element) {
  if (activeVoiceRecorder?.state === "recording" || voiceTranscribing) {
    alert("Encerre a gravação e aguarde a transcrição antes de salvar e avançar.");
    return;
  }
  const form = element.closest("form");
  if (form) updateDraftFromForm(form);
  const scope = element.dataset.scope;
  const completedPage = currentPageForScope(scope);
  saveClinicalRecord(scope);
  const nextPage = nextPageForScope(scope);
  if (scope === "consultation" && nextPage) consultationPage = nextPage;
  if (scope === "return" && nextPage) returnPage = nextPage;
  render();
}

function saveClinicalRecord(scope) {
  if (!selectedPatientId) return null;
  const now = new Date().toISOString();
  if (scope === "consultation") {
    const data = sanitizeConsultationRecord({ ...(draft.consultation || defaultConsultation()), patientId: selectedPatientId, type: "consultation" });
    data.evolution = normalizeEvolutionNarrative(data.evolution);
    if (!data.evolution || data.evolutionAutoGenerated || outdatedEvolutionText(data.evolution) || shouldRefreshEvolutionNarrative(data.evolution)) {
      data.evolution = buildEvolutionNarrative(data, getPatient() || {});
      data.evolutionAutoGenerated = true;
    }
    if (!data.id) data.id = uid("consultation");
    data.updatedAt = now;
    data.createdAt = data.createdAt || now;
    upsert("consultations", data);
    draft.consultation = structuredClone(data);
    persist();
    return data;
  }
  if (scope === "return") {
    const previous = previousEntryForReturn(draft.return || {}, selectedPatientId);
    const data = sanitizeConsultationRecord({ ...(draft.return || defaultReturn()), patientId: selectedPatientId, type: "return", previousEntryId: draft.return?.previousEntryId || previous?.id || "" });
    const linkedReturn = state.returns.find(entry =>
      entry.patientId === selectedPatientId
      && entry.previousEntryId === data.previousEntryId
      && entry.id !== data.id
    );
    if (linkedReturn) {
      data.id = linkedReturn.id;
      data.createdAt = linkedReturn.createdAt;
    }
    data.evolution = normalizeEvolutionNarrative(data.evolution);
    if (!data.evolution || data.evolutionAutoGenerated || outdatedEvolutionText(data.evolution) || shouldRefreshEvolutionNarrative(data.evolution)) {
      data.evolution = buildEvolutionNarrative(data, getPatient() || {}, previous, true);
      data.evolutionAutoGenerated = true;
    }
    if (!data.id) data.id = uid("return");
    data.updatedAt = now;
    data.createdAt = data.createdAt || now;
    upsert("returns", data);
    draft.return = structuredClone(data);
    persist();
    return data;
  }
  return null;
}

// Recebe as duas formas em vez de anexar "s": "opcao medicamentosa" no plural
// e "opcoes medicamentosas", nao "opcao medicamentosas".
function countLabel(total, singular, plural = `${singular}s`) {
  return `${total} ${total === 1 ? singular : plural}`;
}

async function generateDiagnosisFromClinicalData(element) {
  const formElement = element.closest("form");
  if (formElement) updateDraftFromForm(formElement);
  const scope = view === "return" ? "return" : "consultation";
  const target = scope === "return" ? draft.return : draft.consultation;
  setClinicalAiStatus(scope, "Consultando IA real para diagnostico...");
  render();
  let suggestion;
  try {
    const context = clinicalAiContext(scope);
    const { result, sources, mode, codeWarnings } = await requestClinicalAi("diagnosis", buildClinicalAiPrompt("diagnosis", context.target, context.patient, context.previous, context.isReturn), context.target?.aiMode, buildRagQuery("diagnosis", context.target));
    // Sem completar as vagas que sobram: se a IA propos duas sindromicas,
    // mostra duas. Antes o catalogo local enchia o resto das tres categorias
    // com o mesmo punhado de entidades nosologicas, o que fazia uma nosologia
    // aparecer rotulada como sindrome — e as vezes duas vezes, em categorias
    // diferentes, porque a deduplicacao era so dentro de cada grupo.
    // Cada hipotese sai com os dois codigos, nas tres categorias, e o medico
    // escolhe. CID-11 e DSM-5-TR sao classificacoes independentes: a mesma
    // entidade tem codigo proprio em cada uma, e o servidor confere cada um
    // contra a sua tabela oficial antes de chegar aqui.
    const formatGroup = (items, count) => (items || []).map(formatDiagnosticOption)
      .filter(Boolean)
      .filter((option, index, list) => list.indexOf(option) === index).slice(0, count);
    // A deduplicacao era so dentro de cada grupo, entao a mesma entidade saia
    // duas vezes em categorias diferentes: numa chamada real de um caso de TAG,
    // "Transtorno de ansiedade generalizada" apareceu como sindromica E como
    // nosologica. Qual das duas esta certa e juizo clinico, entao o programa
    // nao escolhe em silencio: mantem uma e diz que aconteceu.
    const jaVistos = new Map();
    const duplicadas = [];
    const uniqueGroup = (items, count, categoria) => formatGroup(items, count).filter(nome => {
      const chave = normalizeText(nome);
      if (jaVistos.has(chave)) { duplicadas.push(`${nome} (mantida em ${jaVistos.get(chave)})`); return false; }
      jaVistos.set(chave, categoria);
      return true;
    });
    // Nosologico primeiro: quando a mesma entidade sai nas duas categorias, a
    // IA nao esta distinguindo sindrome de transtorno, e a leitura nosologica
    // e a afirmacao mais especifica. Ficar com a sindromica esvaziava a
    // categoria util.
    const nosologicalOptions = uniqueGroup(result.nosological_options, 3, "Nosológico");
    const syndromicOptions = uniqueGroup(result.syndromic_options, 3, "Sindrômico");
    const etiologicalOptions = uniqueGroup(result.etiological_options, 2, "Etiológico");
    const selectedDoctorOptions = doctorSelectedOptions(target || {});
    suggestion = {
      diagnosticoAiSindromico: syndromicOptions.join("\n"),
      diagnosticoAiNosologico: nosologicalOptions.join("\n"),
      diagnosticoAiEtiologico: etiologicalOptions.join("\n"),
      // A IA propoe, nao assinala: so as hipoteses do proprio medico seguem
      // marcadas. Assinalar por ele inverteria o onus — passaria a ser preciso
      // descartar o que nao se quer, em vez de escolher o que se quer.
      diagnosticoSelecionado: selectedDoctorOptions,
      diagnosticoManual: selectedDoctorOptions.join("\n"),
      diferenciais: "",
      ragSources: sources,
      aiMode: mode,
      aiStatus: [
        `Propostas para você assinalar: ${countLabel(syndromicOptions.length, "sindrômica")}, ${countLabel(nosologicalOptions.length, "nosológica")} e ${countLabel(etiologicalOptions.length, "etiológica")}. As hipóteses do médico foram mantidas.`,
        // Renomear muda o que ele le na tela, entao e dito. Os avisos de codigo
        // ficam no log: o codigo nao aparece nesta etapa, so na codificacao.
        ...(codeWarnings || []).filter(item => item.kind === "rename").map(item => item.text),
        duplicadas.length
          ? `${countLabel(duplicadas.length, "hipótese saiu", "hipóteses saíram")} em mais de uma categoria: ${duplicadas.join("; ")}.`
          : ""
      ].filter(Boolean).join(" "),
    };
  } catch (error) {
    // O catalogo local so entra aqui, quando nao ha resposta nenhuma, e dito
    // com todas as letras que veio dele. Antes ele se misturava as hipoteses
    // da IA sem que a tela distinguisse uma coisa da outra.
    // Este fluxo le aiMode; pharmaAiMode e o seletor do medicamento.
    const local = buildDiagnosticSuggestion(target || {});
    const fonte = (target?.aiMode || "current") === "rag" ? "RAG" : "IA";
    const encontrou = local.diagnosticoAiSindromico || local.diagnosticoAiNosologico || local.diagnosticoAiEtiologico;
    suggestion = {
      ...local,
      ragSources: [],
      treatmentStatus: `${fonte} indisponivel: ${error.message}`,
      aiStatus: encontrou
        ? `${fonte} indisponível (${error.message}). As hipóteses abaixo vêm do catálogo local, por correspondência de termos do registro — contingência, não substituto da literatura indexada.`
        : `${fonte} indisponível (${error.message}). O catálogo local não achou correspondência no que está registrado; nenhuma hipótese foi proposta.`
    };
  }
  if (scope === "return") draft.return = { ...(draft.return || {}), ...suggestion };
  else draft.consultation = { ...(draft.consultation || {}), ...suggestion };
  render();
}

async function generateTreatmentFromClinicalData(element) {
  const formElement = element.closest("form");
  if (formElement) updateDraftFromForm(formElement);
  const scope = view === "return" ? "return" : "consultation";
  const target = scope === "return" ? draft.return : draft.consultation;
  const diagnosisText = treatmentDiagnosisText(target || {});
  if (!diagnosisText) return alert("Selecione ao menos uma hipotese diagnostica antes de gerar o tratamento.");
  setClinicalAiStatus(scope, "Consultando IA real para tratamento...");
  if (scope === "return") draft.return = { ...(draft.return || {}), treatmentStatus: "Consultando IA real para tratamento..." };
  else draft.consultation = { ...(draft.consultation || {}), treatmentStatus: "Consultando IA real para tratamento..." };
  render();
  let suggestion;
  try {
    const context = clinicalAiContext(scope);
    const { result, sources, mode } = await requestClinicalAi("treatment", buildClinicalAiPrompt("treatment", context.target, context.patient, context.previous, context.isReturn), context.target?.pharmaAiMode || "rag", buildRagQuery("treatment", context.target));
    const medicationOptions = result.medication_options.map(formatMedicationTreatmentOption);
    const approachOptions = result.non_pharmacological_options.map(formatNonPharmacologicalOption);
    suggestion = {
      tratamentoAiMedicamentos: medicationOptions.join("\n"),
      tratamentoAiAbordagens: approachOptions.join("\n"),
      // Mesmo criterio ja aplicado ao diagnostico: a IA propoe, quem assinala
      // e o medico. Marcar as tres opcoes de saida inverte o onus — passaria a
      // ser preciso descartar duas prescricoes em vez de escolher uma.
      tratamentoMedicamentosSelecionados: arrayValue(target?.tratamentoMedicamentosSelecionados),
      abordagensSelecionadas: arrayValue(target?.abordagensSelecionadas),
      tratamentoMedicamentoso: "",
      abordagensTerapeuticas: "",
      examesLaboratoriais: requestedExamsText(target || {}),
      condutaMedica: target?.condutaMedica || "",
      ragSources: sources,
      pharmaAiMode: mode,
      treatmentStatus: `${countLabel(medicationOptions.length, "opção medicamentosa", "opções medicamentosas")} e ${countLabel(approachOptions.length, "outra abordagem", "outras abordagens")} propostas para você assinalar. Suas escolhas anteriores foram mantidas.`,
      aiStatus: "Sugestões de tratamento geradas pela IA para revisão médica."
    };
  } catch (error) {
    suggestion = (target?.pharmaAiMode || "rag") === "rag"
      ? { ragSources: [], treatmentStatus: `RAG indisponivel: ${error.message}`, aiStatus: `RAG indisponivel: ${error.message}` }
      : { ragSources: [], treatmentStatus: `IA indisponivel: ${error.message}`, aiStatus: `IA indisponivel: ${error.message}` };
  }
  if (scope === "return") draft.return = { ...(draft.return || {}), ...suggestion };
  else draft.consultation = { ...(draft.consultation || {}), ...suggestion };
  render();
}

async function generateEvolutionFromClinicalData(element) {
  const formElement = element.closest("form");
  if (formElement) updateDraftFromForm(formElement);
  const scope = view === "return" ? "return" : "consultation";
  const target = scope === "return" ? draft.return : draft.consultation;
  setClinicalAiStatus(scope, "Consultando IA real para evolução clínica...");
  render();
  let suggestion;
  try {
    const context = clinicalAiContext(scope);
    const { result } = await requestClinicalAi("evolution", buildClinicalAiPrompt("evolution", context.target, context.patient, context.previous, context.isReturn));
    const text = normalizeEvolutionNarrative(result.markdown);
    suggestion = {
      evolution: text,
      aiStatus: "Evolução gerada pela IA real. Revise antes de salvar.",
    };
  } catch (error) {
    const context = clinicalAiContext(scope);
    suggestion = {
      evolution: buildEvolutionNarrative(target || {}, context.patient, context.previous, context.isReturn),
      aiStatus: `IA indisponível: ${error.message}. Evolução local aplicada.`
    };
  }
  if (scope === "return") draft.return = { ...(draft.return || {}), ...suggestion };
  else draft.consultation = { ...(draft.consultation || {}), ...suggestion };
  render();
}

async function generateMedicationFromClinicalData(element) {
  const formElement = element.closest("form");
  if (formElement) updateDraftFromForm(formElement);
  const scope = view === "return" ? "return" : "consultation";
  const target = scope === "return" ? draft.return : draft.consultation;
  if (!target?.medicationGeneric?.trim()) return alert("Digite o nome do medicamento antes de consultar a IA.");
  setClinicalAiStatus(scope, "Consultando IA real para medicamento...");
  if (scope === "return") draft.return = { ...(draft.return || {}), medicationStatus: "Consultando IA real para medicamento..." };
  else draft.consultation = { ...(draft.consultation || {}), medicationStatus: "Consultando IA real para medicamento..." };
  render();
  let suggestion;
  try {
    const context = clinicalAiContext(scope);
    const { result, sources, mode } = await requestClinicalAi("medication", buildClinicalAiPrompt("medication", context.target, context.patient, context.previous, context.isReturn), context.target?.pharmaAiMode || "rag", buildRagQuery("medication", context.target));
    suggestion = {
      medicationNameText: result.medication || target.medicationGeneric,
      medicationPresentation: result.dose_progression || "",
      medicationSafety: result.side_effects || "",
      medicationBestUse: result.notes || "",
      medicationStatus: "Medicamento preenchido nos campos essenciais. Revise com bula vigente.",
      medicationOnlineStatus: "Resposta de medicamento gerada pela IA real. Revise com bula brasileira e dados do paciente.",
      aiStatus: "Resposta gerada pela IA real. Revise antes de salvar.",
      ragSources: sources,
      pharmaAiMode: mode
    };
  } catch (error) {
    const wasRag = (target?.pharmaAiMode || "rag") === "rag";
    suggestion = {
      ragSources: [],
      medicationOnlineStatus: wasRag ? `RAG indisponivel: ${error.message}. Use pesquisa online ou prompt manual.` : `IA indisponível: ${error.message}. Use pesquisa online ou prompt manual.`,
      aiStatus: wasRag ? `RAG indisponivel: ${error.message}.` : `IA indisponível: ${error.message}.`
    };
  }
  if (scope === "return") draft.return = { ...(draft.return || {}), ...suggestion };
  else draft.consultation = { ...(draft.consultation || {}), ...suggestion };
  render();
}

function clinicalAiContext(scope = view === "return" ? "return" : "consultation") {
  const target = scope === "return" ? (draft.return || {}) : (draft.consultation || {});
  return {
    target,
    previous: scope === "return" ? previousEntryForReturn(target, selectedPatientId) : null,
    patient: getPatient() || {},
    isReturn: scope === "return"
  };
}

function setClinicalAiStatus(scope, message) {
  if (scope === "return") draft.return = { ...(draft.return || {}), aiStatus: message };
  else draft.consultation = { ...(draft.consultation || {}), aiStatus: message };
}

function applyAnamnesisAiResult(result = {}, transcript = "") {
  const target = draft.consultation || defaultConsultation();
  const textOverrides = target.anamnesisDoctorTextOverrides || {};
  target.qphda = transcript || target.qphda || "";
  if (!textOverrides.queixa) target.queixa = result.chief_complaint || target.queixa || "";
  if (!textOverrides.hdaManual) target.hdaManual = result.hda || target.hdaManual || "";
  if (!textOverrides.medicos) target.medicos = result.medical_history || target.medicos || "";
  const overrides = target.anamnesisDoctorOverrides || {};
  Object.entries(ANAMNESIS_AI_FIELDS).forEach(([aiKey, [formKey, allowed]]) => {
    const suggested = new Set(canonicalAiSelections(result[aiKey], allowed));
    const denialOptions = ["Nega sintomas relacionados", "Nega ideacao, plano ou intencao suicida", "Nenhum"];
    if ([...suggested].some(option => !denialOptions.includes(option))) {
      denialOptions.forEach(option => suggested.delete(option));
    }
    target[formKey] = allowed.filter(option => {
      const overrideKey = `${formKey}:${option}`;
      return Object.hasOwn(overrides, overrideKey) ? overrides[overrideKey] : suggested.has(option);
    });
  });
  target.anamnesisProcessedAt = new Date().toISOString();
  target.anamnesisProcessedTranscript = target.qphda;
  draft.consultation = target;
}

function syncAnamnesisControlsFromDraft() {
  if (view !== "consultation" || consultationPage !== "anamnese") return;
  const form = app.querySelector("#consult-form");
  if (!form) return;
  const scrollLeft = window.scrollX;
  const scrollTop = window.scrollY;
  const target = draft.consultation || {};
  Object.values(ANAMNESIS_AI_FIELDS).forEach(([formKey]) => {
    const selected = new Set(arrayValue(target[formKey]));
    form.querySelectorAll(`input[type="checkbox"][name="${CSS.escape(formKey)}"]`).forEach(control => {
      control.checked = selected.has(control.value);
    });
  });
  window.scrollTo(scrollLeft, scrollTop);
  requestAnimationFrame(() => window.scrollTo(scrollLeft, scrollTop));
  setTimeout(() => window.scrollTo(scrollLeft, scrollTop), 120);
  setTimeout(() => window.scrollTo(scrollLeft, scrollTop), 450);
}

async function processAnamnesisTranscriptSilently(transcript = "", options = {}) {
  const cleanTranscript = String(transcript || "").trim();
  if (!cleanTranscript || view !== "consultation") return;
  const sequence = ++anamnesisProcessingSequence;
  const baselineRevision = clinicalDraftRevision;
  const context = clinicalAiContext("consultation");
  const anamnesisTarget = { ...context.target, qphda: cleanTranscript };
  const { result } = await requestClinicalAi("anamnesis", buildClinicalAiPrompt("anamnesis", anamnesisTarget, context.patient), "rag", buildRagQuery("anamnesis", anamnesisTarget));
  if (sequence !== anamnesisProcessingSequence || view !== "consultation" || baselineRevision !== clinicalDraftRevision) return;
  applyAnamnesisAiResult(result, cleanTranscript);
  if (options.preserveFocus) syncAnamnesisControlsFromDraft();
  else render();
}

async function prepareRefinementFromClinicalData() {
  const context = clinicalAiContext("consultation");
  let result;
  // O catalogo precisa estar carregado ANTES de montar o prompt: e ele que vai
  // no prompt e e contra ele que a resposta e conferida. Se falhar, o
  // refinamento ainda roda — cai no motor antigo, que inventa as perguntas.
  try {
    await loadProtocol();
  } catch (error) {
    console.warn("Protocolo de entrevista indisponivel; refinamento sem lista fechada.", error);
  }
  try {
    // Duas etapas, por causa do teto de tokens por minuto da conta: primeiro a
    // IA escolhe os blocos pertinentes, depois recebe so as perguntas deles.
    // Quem escolhe segue sendo ela, de lista fechada — mudou a ordem, nao o
    // criterio. Sem protocolo carregado, escopo nulo e o motor antigo assume.
    let scope = null;
    if (protocolLoaded()) {
      const escopo = await requestClinicalAi(
        "refinement_scope",
        buildClinicalAiPrompt("refinement_scope", context.target, context.patient),
        "current"
      );
      scope = escopo.result?.blocks || null;
    }
    ({ result } = await requestClinicalAi(
      "refinement",
      buildClinicalAiPrompt("refinement", context.target, context.patient, null, false, scope),
      "rag",
      buildRagQuery("refinement", context.target)
    ));
  } catch {
    result = localRefinementPlan(context.target);
  }
  draft.consultation = { ...(draft.consultation || {}), refinementPlan: result, refinementPreparedAt: new Date().toISOString() };
}

async function fillMedicationInfo(element) {
  const formElement = element.closest("form");
  if (formElement) updateDraftFromForm(formElement);
  const scope = view === "return" ? "return" : "consultation";
  const target = scope === "return" ? draft.return : draft.consultation;
  const medicationName = target?.medicationGeneric || "";
  if (!medicationName.trim()) return alert("Digite o nome do medicamento para pesquisar online.");
  const loading = {
    medicationOnlineStatus: `Pesquisando online: ${medicationName}...`,
    medicationPriceResearch: ""
  };
  if (scope === "return") draft.return = { ...(draft.return || {}), ...loading };
  else draft.consultation = { ...(draft.consultation || {}), ...loading };
  render();

  const suggestion = await buildMedicationAutofill(medicationName);
  if (scope === "return") draft.return = { ...(draft.return || {}), ...suggestion };
  else draft.consultation = { ...(draft.consultation || {}), ...suggestion };
  render();
}

function updateSelectedDiagnosisFromForm(form) {
  const scope = view === "return" ? "return" : "consultation";
  const selected = Array.from(form.querySelectorAll("input[name='diagnosticoSelecionado']:checked")).map(item => item.value);
  const selectedText = selected.join("\n");
  const update = {
    diagnosticoSelecionado: selected,
    diagnosticoSelecionadoResumo: selectedText,
    diagnosticoManual: selectedText
  };
  if (scope === "return") draft.return = { ...(draft.return || {}), ...update };
  else draft.consultation = { ...(draft.consultation || {}), ...update };
}

function updateSelectedTreatmentFromForm(form) {
  const medicationValues = [...form.querySelectorAll("input[name='tratamentoMedicamentosSelecionados']:checked")].map(input => input.value);
  const approachValues = [...form.querySelectorAll("input[name='abordagensSelecionadas']:checked")].map(input => input.value);
  const target = currentClinicalDraft();
  if (!target) return;
  target.tratamentoMedicamentosSelecionados = medicationValues;
  target.abordagensSelecionadas = approachValues;
  target.tratamentoMedicamentoso = medicationValues.join("\n");
  target.abordagensTerapeuticas = approachValues.join("\n");
}

function updateDraftFromForm(form) {
  if (form.id === "patient-form") draft.patient = { ...(draft.patient || {}), ...formToObject(form) };
  if (form.id === "consult-form") {
    const data = formToObject(form);
    data.examesLaboratoriais = requestedExamsText(data);
    if ("evolution" in data) data.evolutionAutoGenerated = false;
    draft.consultation = { ...(draft.consultation || {}), ...data };
  }
  if (form.id === "return-form") {
    const data = formToObject(form);
    data.examesLaboratoriais = requestedExamsText(data);
    if ("evolution" in data) data.evolutionAutoGenerated = false;
    draft.return = { ...(draft.return || {}), ...data };
  }
}

function sanitizeConsultationRecord(data = {}) {
  const clean = { ...data };
  clean.diagnosticoManual = arrayValue(clean.diagnosticoSelecionado).join("\n");
  clean.tratamentoMedicamentoso = arrayValue(clean.tratamentoMedicamentosSelecionados).join("\n");
  clean.abordagensTerapeuticas = arrayValue(clean.abordagensSelecionadas).join("\n");
  return clean;
}

function currentClinicalDraft() {
  if (view === "return") return draft.return || {};
  if (view === "consultation") return draft.consultation || {};
  return {};
}

function formToObject(form) {
  const data = {};
  new FormData(form).forEach((value, key) => {
    if (data[key]) data[key] = Array.isArray(data[key]) ? [...data[key], value] : [data[key], value];
    else data[key] = value;
  });
  form.querySelectorAll("input[type='checkbox']").forEach(box => {
    if (!data[box.name]) data[box.name] = [];
  });
  return data;
}

function defaultConsultation() {
  const count = state.consultations.filter(item => item.patientId === selectedPatientId).length + 1;
  return { patientId: selectedPatientId, label: `Consulta ${count}`, type: "consultation", consultationMode: "IN_PERSON", anamnesisInputMode: "manual" };
}

function defaultReturn() {
  const consultations = consultationsForPatient(selectedPatientId);
  const pendingConsultation = consultations.find(consultation =>
    !state.returns.some(entry =>
      entry.patientId === selectedPatientId && entry.previousEntryId === consultation.id
    )
  );
  if (!pendingConsultation) {
    const latestSavedReturn = returnsForPatient(selectedPatientId)[0];
    if (latestSavedReturn) return structuredClone(latestSavedReturn);
  }
  const previousEntryId = pendingConsultation?.id || consultations[0]?.id || "";
  return { patientId: selectedPatientId, label: "Retorno", type: "return", previousEntryId };
}

function startNewReturn() {
  const consultations = consultationsForPatient(selectedPatientId);
  const pendingConsultation = consultations.find(consultation =>
    !state.returns.some(entry =>
      entry.patientId === selectedPatientId && entry.previousEntryId === consultation.id
    )
  );
  if (!pendingConsultation) {
    alert("Cada consulta pode ter apenas um retorno. Todas as consultas deste paciente ja possuem retorno.");
    return;
  }
  draft.return = {
    patientId: selectedPatientId,
    label: "Retorno",
    type: "return",
    previousEntryId: pendingConsultation.id
  };
  returnPage = "evolucao-retorno";
  render();
}

function getPatient() {
  return state.patients.find(patient => patient.id === selectedPatientId);
}

function entriesForPatient(patientId) {
  return state.consultations.concat(state.returns)
    .filter(entry => entry.patientId === patientId)
    .sort(compareEntriesNewestFirst);
}

function consultationsForPatient(patientId) {
  return state.consultations
    .filter(entry => entry.patientId === patientId)
    .sort(compareEntriesNewestFirst);
}

function returnsForPatient(patientId) {
  return state.returns
    .filter(entry => entry.patientId === patientId)
    .sort(compareEntriesNewestFirst);
}

function compareEntriesNewestFirst(a, b) {
  return entryTimestamp(b) - entryTimestamp(a);
}

function entryTimestamp(entry) {
  if (ENTRY_TIMESTAMP_CACHE.has(entry)) return ENTRY_TIMESTAMP_CACHE.get(entry);
  const timestamp = new Date(entry.createdAt || 0).getTime();
  ENTRY_TIMESTAMP_CACHE.set(entry, timestamp);
  return timestamp;
}

function recordSearchText(entry) {
  if (RECORD_SEARCH_TEXT_CACHE.has(entry)) return RECORD_SEARCH_TEXT_CACHE.get(entry);
  const searchText = JSON.stringify(entry).toLowerCase();
  RECORD_SEARCH_TEXT_CACHE.set(entry, searchText);
  return searchText;
}

function previousEntryForReturn(form = {}, patientId = selectedPatientId) {
  const consultations = consultationsForPatient(patientId);
  return consultations.find(entry => entry.id === form.previousEntryId) || consultations[0] || latestEntry(patientId);
}

function latestEntry(patientId) {
  return entriesForPatient(patientId)[0];
}

function upsert(collection, data) {
  const list = state[collection];
  const index = list.findIndex(item => item.id === data.id);
  if (index >= 0) list[index] = data;
  else list.push(data);
}

function persist() {
  saveState(state);
  if (!authSession) return;
  // O localStorage ja gravou; o que falta e avisar quando a copia remota nao
  // acompanhou. Antes o erro ia para authError, que so aparece na tela de
  // login — na pratica, silencio.
  pushState(state)
    .then(() => { if (syncError) { syncError = ""; render(); } })
    .catch(error => { syncError = error.message; render(); });
}

function pdfEntry(id, type) {
  const entry = findEntry(id, type);
  if (!entry) return;
  const patient = getPatient();
  const title = `${entry.label || "Evolução"}${patient?.nome ? ` — ${patient.nome}` : ""}`;
  const date = new Date(entry.createdAt || Date.now()).toLocaleDateString("pt-BR").replaceAll("/", "-");
  exportTextAsPdf(title, recordReportText(entry), `${patient?.nome || "Paciente"} - ${entry.label || "Evolução"} - ${date}`);
}

function pdfClinicalSummary() {
  const patient = getPatient() || {};
  const form = view === "return" ? (draft.return || {}) : (draft.consultation || {});
  const groups = clinicalSummaryGroups(form, patient);
  const text = groups.map(group => {
    const columns = summaryColumns(group.layout);
    return [
      group.title.toUpperCase(),
      ...group.rows.map(row => [
        columns.area ? row.section : "",
        columns.item ? row.item : "",
        row.value
      ].filter(Boolean).join(" | "))
    ].join("\n");
  }).join("\n\n");
  const patientName = patient.nome || "Paciente";
  const date = new Date().toLocaleDateString("pt-BR").replaceAll("/", "-");
  exportTextAsPdf(`Resumo clínico — ${patientName}`, text, `${patientName} - Resumo clínico - ${date}`);
}

function recordReportText(entry = {}) {
  const patient = getPatient() || {};
  const previous = entry.type === "return"
    ? previousEntryForReturn(entry, entry.patientId)
    : null;
  const shouldRebuild = shouldRefreshEvolutionNarrative(entry.evolution)
    || (entry.evolutionAutoGenerated && entry.type !== "return")
    || (entry.type === "return" && (
      entry.evolutionAutoGenerated
      || returnEvolutionContainsIdentity(entry.evolution, patient)
    ));
  const storedEvolution = shouldRebuild
    ? buildEvolutionNarrative(entry, patient, previous, entry.type === "return")
    : entry.evolution;
  const evolution = entry.type === "return"
    ? longitudinalReturnNarrative(entry, removeReturnBoilerplate(normalizeEvolutionNarrative(storedEvolution)))
    : normalizeEvolutionNarrative(storedEvolution);
  const report = normalizeEvolutionNarrative([
    evolution,
    entry.type !== "return" && entry.observacoesRetorno ? `Observações: ${stripFinalPeriod(entry.observacoesRetorno)}.` : "",
    !evolution ? anamnesisText(entry) : ""
  ].filter(Boolean).join("\n\n"));
  return (entry.type === "return" ? removeReturnBoilerplate(report) : report) || "Registro sem evolução.";
}

function longitudinalReturnNarrative(entry = {}, evolution = "") {
  const previous = previousEntryForReturn(entry, entry.patientId);
  const previousDate = previous?.createdAt
    ? new Date(previous.createdAt).toLocaleDateString("pt-BR")
    : "";
  const reference = `Paciente retorna após registro prévio${previousDate ? ` de ${previousDate}` : ""}`;
  const normalized = normalizeEvolutionNarrative(evolution);
  const withFinding = normalized.match(/^Paciente retornou com\s+([\s\S]+)$/i);
  if (withFinding) return `${reference}, com ${lowerFirst(withFinding[1])}`;
  const complement = normalized
    .replace(/^Paciente retornou para acompanhamento clínico\.\s*/i, "")
    .replace(/^Paciente retornou\.\s*/i, "")
    .trim();
  return `${reference}.${complement ? ` ${complement}` : ""}`;
}

function editEntry(id, type) {
  const entry = findEntry(id, type);
  if (!entry) return;
  selectedPatientId = entry.patientId;
  if (type === "consultation") {
    draft.consultation = structuredClone(entry);
    consultationPage = "evolucao";
    view = "consultation";
  } else {
    draft.return = structuredClone(entry);
    returnPage = "texto-retorno";
    view = "return";
  }
  render();
}

function deleteEntry(id, type) {
  if (!confirm("Excluir este registro do prontuario?")) return;
  const collection = type === "consultation" ? "consultations" : "returns";
  state[collection] = state[collection].filter(item => item.id !== id);
  persist();
  render();
}

function deletePatient() {
  const patient = getPatient();
  if (!patient || !confirm("Excluir paciente e todos os registros vinculados?")) return;
  state.patients = state.patients.filter(item => item.id !== patient.id);
  state.consultations = state.consultations.filter(item => item.patientId !== patient.id);
  state.returns = state.returns.filter(item => item.patientId !== patient.id);
  selectedPatientId = state.patients[0]?.id || "";
  draft.patient = {};
  persist();
  view = "dashboard";
  render();
}

function findEntry(id, type) {
  return (type === "consultation" ? state.consultations : state.returns).find(item => item.id === id);
}

function showExitModal() {
  modal = `<div class="modal-backdrop"><div class="modal"><h2>Deseja realmente sair do sistema?</h2><p>Dados ja salvos permanecem neste navegador. Revise campos em edicao antes de sair.</p><div class="actions"><button class="secondary" data-action="close-modal">Cancelar</button><button class="danger" data-action="exit-now">Sair</button></div></div></div>`;
  render();
}

async function startVoice(targetName, button) {
  if (activeVoiceRecorder?.state === "recording") {
    setVoiceStatus(activeVoiceButton, "Encerrando a gravação e enviando para transcrição…", "requesting");
    activeVoiceRecorder.stop();
    return;
  }

  const fieldElement = app.querySelector(`[name='${targetName}']`);
  if (!fieldElement) return;

  if (!window.isSecureContext) {
    setVoiceStatus(button, "O microfone exige uma conexão segura", "error");
    return alert("Abra o sistema por http://127.0.0.1:8000 ou por HTTPS para permitir o uso do microfone.");
  }

  if (!window.MediaRecorder) {
    setVoiceStatus(button, "Gravação de áudio indisponível neste navegador", "error");
    return alert("Este navegador não oferece gravação integral de áudio. Use Chrome, Edge ou Safari atualizado.");
  }

  try {
    const stream = await requestMicrophonePermission(button);
    if (!stream) return;
    const mimeType = preferredRecordingMimeType();
    const recorderOptions = { audioBitsPerSecond: 32000 };
    if (mimeType) recorderOptions.mimeType = mimeType;
    const recorder = new MediaRecorder(stream, recorderOptions);
    activeVoiceRecorder = recorder;
    activeVoiceStream = stream;
    activeVoiceChunks = [];
    activeVoiceStartedAt = Date.now();
    activeVoiceButton = null;
    activeVoiceButton = button;

    recorder.addEventListener("dataavailable", event => {
      if (event.data?.size) activeVoiceChunks.push(event.data);
    });
    recorder.addEventListener("start", () => {
      button.classList.remove("is-requesting");
      button.classList.add("is-listening");
      button.setAttribute("aria-label", "Encerrar gravação da conversa");
      button.title = "Encerrar gravação";
      updateVoiceRecordingDuration(button);
      activeVoiceDurationTimer = setInterval(() => updateVoiceRecordingDuration(button), 1000);
    });
    recorder.addEventListener("error", event => {
      cleanupVoiceRecording();
      setVoiceStatus(button, event.error?.message || "Falha durante a gravação", "error");
    });
    recorder.addEventListener("stop", async () => {
      clearInterval(activeVoiceDurationTimer);
      activeVoiceDurationTimer = null;
      activeVoiceStream?.getTracks().forEach(track => track.stop());
      const chunks = activeVoiceChunks;
      const recordedType = recorder.mimeType || mimeType || "audio/webm";
      activeVoiceRecorder = null;
      activeVoiceStream = null;
      activeVoiceChunks = [];
      activeVoiceStartedAt = 0;
      button.classList.remove("is-listening", "is-requesting");
      button.setAttribute("aria-label", "Iniciar gravação da conversa");
      button.title = "Iniciar gravação";

      const audio = new Blob(chunks, { type: recordedType });
      if (!audio.size) {
        activeVoiceButton = null;
        setVoiceStatus(button, "A gravação ficou vazia", "error");
        return;
      }
      voiceTranscribing = true;
      setVoiceStatus(button, "Transcrevendo toda a conversa e identificando os falantes…", "requesting");
      try {
        const transcription = await requestConsultationTranscription(audio);
        const transcript = formatDiarizedTranscript(transcription.segments);
        fieldElement.value = transcript;
        const form = fieldElement.closest("form");
        updateDraftFromForm(form);
        const target = draft.consultation || defaultConsultation();
        target.qphda = transcript;
        target.anamnesisInputMode = "microphone";
        target.transcriptionSegments = transcription.segments;
        target.transcriptionDuration = transcription.duration;
        target.transcribedAt = new Date().toISOString();
        target.anamnesisDoctorTextOverrides = { ...(target.anamnesisDoctorTextOverrides || {}), qphda: false };
        draft.consultation = target;
        setVoiceStatus(button, "Transcrição concluída. Analisando a anamnese com a literatura…", "requesting");
        if (targetName === "qphda") await processAnamnesisTranscriptSilently(transcript, { preserveFocus: false });
        setVoiceStatus(app.querySelector(`[data-action='voice'][data-target='${targetName}']`), "Conversa transcrita e campos atualizados. Revise antes de salvar.", "done");
      } catch (error) {
        setVoiceStatus(button, error.message || "Não foi possível transcrever a conversa", "error");
        alert(error.message || "Não foi possível transcrever a conversa.");
      } finally {
        voiceTranscribing = false;
        activeVoiceButton = null;
      }
    });
    recorder.start(5000);
  } catch (error) {
    cleanupVoiceRecording();
    setVoiceStatus(button, error?.message || "Não foi possível iniciar a gravação", "error");
  }
}

async function requestMicrophonePermission(button) {
  if (!navigator.mediaDevices?.getUserMedia) {
    setVoiceStatus(button, "Acesso ao microfone indisponível", "error");
    alert("Este navegador não permite acesso ao microfone. Use Chrome, Edge ou Safari atualizado.");
    return null;
  }

  setVoiceStatus(button, "Solicitando acesso ao microfone…", "requesting");
  button.classList.add("is-requesting");

  try {
    // A verificacao de permissao deve usar a constraint mais compativel.
    // Safari pode rejeitar propriedades avancadas com "Invalid constraint".
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    button.classList.remove("is-requesting");
    setVoiceStatus(button, "Microfone autorizado. Iniciando a gravação…", "done");
    return stream;
  } catch (error) {
    button.classList.remove("is-requesting");
    if (error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError") {
      setVoiceStatus(button, "Microfone bloqueado — clique no cadeado da barra de endereço", "error");
      showMicrophonePermissionHelp();
    } else if (error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError") {
      setVoiceStatus(button, "Nenhum microfone foi encontrado", "error");
      alert("Conecte ou ative um microfone e tente novamente.");
    } else {
      setVoiceStatus(button, "Não foi possível acessar o microfone", "error");
      alert(`Falha ao acessar o microfone${error?.message ? `: ${error.message}` : "."}`);
    }
    return null;
  }
}

function updateVoiceRecordingDuration(button) {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - activeVoiceStartedAt) / 1000));
  const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, "0");
  const seconds = String(elapsedSeconds % 60).padStart(2, "0");
  setVoiceStatus(button, `Gravando toda a conversa · ${minutes}:${seconds} · clique novamente para encerrar`, "listening");
}

function cleanupVoiceRecording() {
  clearInterval(activeVoiceDurationTimer);
  activeVoiceDurationTimer = null;
  activeVoiceStream?.getTracks().forEach(track => track.stop());
  activeVoiceRecorder = null;
  activeVoiceStream = null;
  activeVoiceChunks = [];
  activeVoiceStartedAt = 0;
  activeVoiceButton = null;
}

function setVoiceStatus(button, message, state = "") {
  const status = button?.closest(".voice-controls")?.querySelector(".voice-status");
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
}
