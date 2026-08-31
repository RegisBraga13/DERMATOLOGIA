import { countLabel, diagnosisSuggestionFromAi, diagnosisSuggestionFromLocalCatalogue } from "./clinical/aiDiagnosisResult.js";
import { diagnosticEtiologicalOptionLines, diagnosticNosologicalOptionLines, diagnosticSyndromicOptionLines, formatMedicationTreatmentOption, formatNonPharmacologicalOption, selectedDiagnosisValues, treatmentOptionLines } from "./clinical/diagnosis.js";
import { anamnesisText, buildEvolutionNarrative, normalizeEvolutionNarrative, outdatedEvolutionText, removeReturnBoilerplate, requestedExamsText, returnEvolutionContainsIdentity, shouldRefreshEvolutionNarrative, treatmentDiagnosisText } from "./clinical/narrative.js";
import { loadProtocol, protocolLoaded } from "./clinical/protocol.js";
import { arrayValue, joinValues, lowerFirst, normalizeText, stripFinalPeriod } from "./clinical/textFormat.js";
import { ANAMNESIS_AI_FIELDS, anamnesisQuestionGroups, pagesForScope } from "./clinical/vocabulary.js";
import { optionGroups } from "./data/examOptions.js";
import { targetSymptomOptions } from "./data/targetSymptoms.js";
import { fetchCep } from "./services/cepService.js";
import { buildClinicalAiPrompt, buildRagQuery, canonicalAiSelections, localRefinementPlan, requestClinicalAi } from "./services/clinicalAiService.js";
import { buildMedicationAutofill, localMedicationSuggestions } from "./services/medicationService.js";
import { exportTextAsPdf } from "./services/pdfService.js";
import { loadState, mergeStates, saveState, uid } from "./services/storageService.js";
import { currentSession, pullState, pushState, signIn } from "./services/supabaseService.js";
import { anamnesisStructuredFields, chips, field, selectField, summaryColumns, textarea, voiceTextarea } from "./ui/controls.js";
import { escapeAttr, escapeHtml } from "./ui/html.js";
import { createVoiceRecording } from "./ui/voiceRecording.js";
import { clipboardIcon, folderIcon, homeIcon, lockIcon, personIcon, repeatIcon, themeIcon } from "./ui/icons.js";
import { clinicalSummaryGroups, clinicalSummaryPage } from "./views/clinicalSummary.js";
import { aiModeSelector, diagnosisModule, evolutionBody, ragSourcesView, refineButton, treatmentModule } from "./views/decisions.js";
import { consultationAccessPanel, mentalExamBody, neurologicExamBody, recordReturnAction, returnAssessmentBody } from "./views/exams.js";
import { bookChapterView, medicationReferenceCard } from "./views/medication.js";

const app = document.querySelector("#app");
let state = loadState();
let view = "dashboard";
let medicationLookupTimer = null;
let selectedPatientId = state.patients[0]?.id || "";
let draft = {};
let consultationPage = "anamnese";
let returnPage = "evolucao-retorno";
// Quantas paginas do fluxo ja foram liberadas. Comeca em 1: so a primeira.
let consultationUnlocked = 1;
let returnUnlocked = 1;
let modal = null;
let pendingViewAfterPatient = "";
let anamnesisProcessingSequence = 0;
let clinicalDraftRevision = 0;
let refinementGenerating = false;
let authSession = null;
let authError = "";
// Falha de sincronizacao com o Supabase. Separada de authError, que so a tela
// de login renderiza: aqui precisa aparecer com a sessao aberta.
let syncError = "";
let storageError = "";
// A gravacao da consulta mora em ui/voiceRecording.js. Ela recebe daqui o que
// nao pode importar — o rascunho vivo e o formulario na tela — e devolve so
// duas coisas: como comecar/encerrar, e se ha algo em andamento.
const voiceRecording = createVoiceRecording({
  app,
  getDraft: () => draft,
  updateDraftFromForm,
  defaultConsultation,
  processAnamnesisTranscriptSilently
});
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
        storageError = saveState(state);
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
        ${storageError
          ? `<span class="sync-status storage-failed" role="alert">${escapeHtml(storageError)}</span>`
          : syncError
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
  return `<nav class="page-tabs" aria-label="Paginas do formulario">${pages.map(([key, label]) => {
    const liberada = pageIsReachable(scope, key);
    return `
    <button type="button" class="${active === key ? "active" : ""}${liberada ? "" : " locked"}" data-action="form-page" data-scope="${scope}" data-page="${key}"${liberada ? "" : ` disabled title="Use Salvar e avançar para chegar a esta página"`}>${label}</button>
  `;
  }).join("")}</nav>`;
}

function clinicalPage(title, body, scope = "", showActions = true) {
  return `<section class="clinical-page">${title ? `<div class="clinical-page-title"><h3>${title}</h3></div>` : ""}${body}${showActions ? pageStepActions(scope) : ""}</section>`;
}

function consultationPageBody(form, patient) {
  // A derivacao QP + HDA so serve ao modo microfone, onde a transcricao integral
  // e o unico campo na tela. No modo manual ela duplicava palavra por palavra o
  // que o medico ja tinha escrito logo abaixo, porque nunca chegava a ser salva
  // em qphda -- era texto de tela, nao dado. Ali a anotacao livre mostra apenas
  // o que existe de fato em qphda (uma transcricao anterior, ou nada).
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
          ${textarea("queixa", "QP - preenchimento manual", form.queixa, "", 1)}
          ${textarea("hdaManual", "HDA - preenchimento manual", form.hdaManual, "", 1)}
          ${textarea("qphda", "Anotação clínica livre", form.qphda, "", 5)}
        </div>
      `}
    </div>
    ${anamnesisQuestionGuide()}
    <div class="clinical-card antecedents-card">
      <h4>Antecedentes pessoais e familiares</h4>
      ${chips("psiPrevios", "Diagnosticos psiquiatricos previos", optionGroups.psiPrevios, form.psiPrevios, form)}
      ${chips("tratamentos", "Tratamentos previos", optionGroups.tratamentos, form.tratamentos, form)}
      ${textarea("medicos", "Antecedentes medicos", joinValues(form.medicos), "", 2)}
      ${chips("familiares", "Antecedentes familiares", optionGroups.familiares, form.familiares, form)}
    </div>
    ${chips("fatores", "Fatores desencadeantes e de piora", optionGroups.fatores, form.fatores, form)}
    ${chips("fatoresMelhora", "Fatores de melhora", optionGroups.fatoresMelhora, form.fatoresMelhora, form)}
    ${chips("impacto", "Impacto funcional", optionGroups.impacto, form.impacto, form)}
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

// Duas portas na mesma sala, decidido com ele em 31/08/2026. Ate aqui so se
// entrava pelo nome do farmaco; quem queria a conduta de um sintoma tinha a
// lista fixa de trinta chips do Sintoma-Alvo, igual para todo paciente, e o
// sintoma que nao estivesse nela nao existia. Agora se digita o sintoma do mesmo
// jeito que se digita o nome do remedio.
//
// A busca por sintoma NAO e sem paciente: quando ha atendimento aberto, a
// conduta sai ancorada nele. A mesma insonia se maneja de um jeito na mania, de
// outro na depressao psicotica e de outro na abstinencia alcoolica, e "tratamento
// da insonia" em abstrato responderia igual para os tres.
function medicationBody(form) {
  const modo = form.appendixSearchMode === "sintoma" ? "sintoma" : "medicamento";
  const medicationName = form.medicationGeneric || "";
  const sintomaBuscado = form.appendixSymptom || "";
  const hasInformation = Boolean(form.medicationNameText || form.medicationPresentation || form.medicationSafety || form.medicationBestUse);
  // Sem o nome: a ficha aparece com o nome preenchido pela busca local antes de
  // a IA gerar coisa alguma, e ali nao ha primeira passada para revisar.
  const hasAiInformation = Boolean(form.medicationPresentation || form.medicationSafety || form.medicationBestUse);
  const condutas = appendixSymptomLines(form);
  return `
    <div class="medication-reference">
      <header class="medication-reference-head">
        <span class="eyebrow">CONSULTA FARMACOLÓGICA · BRASIL</span>
      </header>
      <div class="appendix-search-selector" role="group" aria-label="O que procurar">
        <button class="${modo === "medicamento" ? "active" : ""}" type="button" data-action="set-appendix-search" data-mode="medicamento">Medicamento</button>
        <button class="${modo === "sintoma" ? "active" : ""}" type="button" data-action="set-appendix-search" data-mode="sintoma">Sintoma</button>
      </div>
      ${modo === "medicamento" ? `
        <div class="medication-search-shell">
          <span class="medication-search-icon" aria-hidden="true">⌕</span>
          <input id="medication-lookup" name="medicationGeneric" value="${escapeAttr(medicationName)}"
            autocomplete="off" role="combobox" aria-autocomplete="list" aria-controls="medication-suggestions" />
          <button class="medication-clear" type="button" data-action="clear-medication-lookup" aria-label="Limpar pesquisa">×</button>
        </div>
        <div id="medication-suggestions" class="medication-suggestions" role="listbox"></div>
        ${aiModeSelector(form.pharmaAiMode || "rag", "pharmaAiMode")}
        <div class="actions">
          <button class="primary" type="button" data-action="generate-medication-ai">Gerar</button>
          ${refineButton("refine-medication-ai", hasAiInformation)}
          <button class="secondary${form.medicationChapter ? " active" : ""}" type="button" data-action="toggle-book-chapter"
            ${medicationName ? "" : "disabled"}
            title="Mostra o capitulo deste farmaco como esta no livro, do nome ate o fim dos BIPP TIPS.">${form.medicationChapter ? "Ocultar" : "Mostrar tudo"}</button>
        </div>
        ${form.medicationOnlineStatus ? `<p class="medication-source-status">${escapeHtml(form.medicationOnlineStatus)}</p>` : ""}
        ${ragSourcesView(form.ragSourcesMedicamento)}
        ${bookChapterView(form)}
        ${hasInformation ? medicationReferenceCard(form) : `
          <div class="medication-empty-state">
            <span>Rx</span>
            <h4>Medicamento</h4>
          </div>
        `}
      ` : `
        <div class="medication-search-shell">
          <span class="medication-search-icon" aria-hidden="true">⌕</span>
          <input id="appendix-symptom-lookup" name="appendixSymptom" value="${escapeAttr(sintomaBuscado)}"
            autocomplete="off" list="appendix-symptom-hints" aria-label="Sintoma a consultar" />
          <datalist id="appendix-symptom-hints">${targetSymptomOptions
            .filter(item => item !== "Outro")
            .map(item => `<option value="${escapeAttr(item)}"></option>`).join("")}</datalist>
          <button class="medication-clear" type="button" data-action="clear-appendix-symptom" aria-label="Limpar pesquisa">×</button>
        </div>
        <p class="field-hint">Escreva o sintoma com as palavras que quiser — não há lista fechada. Com atendimento aberto, a conduta sai ancorada neste paciente.</p>
        ${aiModeSelector(form.symptomaticAiMode || "rag", "symptomaticAiMode")}
        <div class="actions">
          <button class="primary" type="button" data-action="generate-appendix-symptom">Gerar</button>
        </div>
        ${form.appendixSymptomStatus ? `<p class="medication-source-status">${escapeHtml(form.appendixSymptomStatus)}</p>` : ""}
        ${ragSourcesView(form.ragSourcesSintomatico)}
        ${condutas.length ? `
          <section class="appendix-symptom-results">
            <h4>Manejo de ${escapeHtml(sintomaBuscado)}</h4>
            <p class="field-hint">Consulta, não prontuário. O que você levar para o Tratamento é o que fica registrado.</p>
            <ul>${condutas.map(linha => `
              <li>
                <span>${escapeHtml(linha)}</span>
                <button class="secondary" type="button" data-action="adopt-appendix-conduct" data-conduta="${escapeAttr(linha)}"
                  title="Leva esta conduta para o Tratamento, onde ela entra no prontuario.">Levar para o Tratamento</button>
              </li>`).join("")}</ul>
          </section>
        ` : ""}
      `}
    </div>
  `;
}

export function appendixSymptomLines(form = {}) {
  return String(form.appendixSymptomConducts || "")
    .split("\n")
    .map(linha => linha.trim())
    .filter(Boolean);
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

// A pagina so se abre por "Salvar e avancar". Antes as abas eram atalhos
// livres: dava para pular da anamnese para o tratamento sem passar por nada, e
// o que estava na tela nao tinha sido gravado. Voltar a uma pagina ja
// percorrida continua livre — o que se perdeu ali ja foi salvo.
//
// Medicamentos e a excecao, decidida por ele: e apendice de consulta, nao etapa
// do atendimento, e precisa estar a mao a qualquer momento.
const APPENDIX_PAGES = new Set(["medicamentos"]);

function unlockedForScope(scope) {
  return scope === "consultation" ? consultationUnlocked : returnUnlocked;
}

function unlockPage(scope, key) {
  const index = pagesForScope(scope).findIndex(([pageKey]) => pageKey === key);
  if (index < 0) return;
  if (scope === "consultation") consultationUnlocked = Math.max(consultationUnlocked, index + 1);
  else returnUnlocked = Math.max(returnUnlocked, index + 1);
}

// Registro ja salvo e reaberto pelo prontuario: tudo liberado, porque o
// atendimento ja foi percorrido uma vez.
function unlockAllPages(scope) {
  if (scope === "consultation") consultationUnlocked = pagesForScope("consultation").length;
  else returnUnlocked = pagesForScope("return").length;
}

function pageIsReachable(scope, key) {
  if (APPENDIX_PAGES.has(key)) return true;
  const index = pagesForScope(scope).findIndex(([pageKey]) => pageKey === key);
  return index >= 0 && index < unlockedForScope(scope);
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
    consultationUnlocked = 1;
    returnUnlocked = 1;
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
    medicationTips: "",
    medicationOnlineStatus: local ? "Carregando ficha clínica e verificando fontes complementares..." : "Consultando RxNav/NLM e openFDA..."
  };
  if (scope === "return") draft.return = { ...(target || {}), ...loading };
  else draft.consultation = { ...(target || {}), ...loading };
  render();

  // Trocou de farmaco: o tip do anterior sai junto, pelo mesmo motivo do
  // clearMedicationLookup.
  const information = { medicationGeneric: name, medicationTips: "" };
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
    medicationMainEffects: "",
    // Tip e do farmaco, nao da tela: sem limpar, o BIPP TIPS da duloxetina
    // ficaria na caixa enquanto o medico pesquisa outro medicamento.
    medicationTips: ""
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
      if (action === "refine-diagnosis") await generateDiagnosisFromClinicalData(element, "diagnosis_review");
      if (action === "generate-treatment") await generateTreatmentFromClinicalData(element);
      if (action === "refine-treatment") await generateTreatmentFromClinicalData(element, "treatment_review");
      if (action === "generate-evolution") await generateEvolutionFromClinicalData(element);
      if (action === "generate-medication-ai") await generateMedicationFromClinicalData(element);
      if (action === "refine-medication-ai") await generateMedicationFromClinicalData(element, "medication_review");
      if (action === "toggle-book-chapter") await toggleBookChapter(element);
      if (action === "fill-medication-info") await fillMedicationInfo(element);
      if (action === "clear-medication-lookup") clearMedicationLookup();
      if (action === "set-anamnesis-mode") setAnamnesisInputMode(element.dataset.mode);
      if (action === "set-appendix-search") setAppendixSearchMode(element.dataset.mode);
      if (action === "clear-appendix-symptom") clearAppendixSymptom();
      if (action === "generate-appendix-symptom") await generateAppendixSymptomConduct(element);
      if (action === "adopt-appendix-conduct") adoptAppendixConduct(element.dataset.conduta || "");
      if (action === "clear-patient") { draft.patient = {}; render(); }
      if (action === "delete-patient") deletePatient();
      if (action === "voice") voiceRecording.startVoice(element.dataset.target, element);
      if (action === "edit-current-patient") { view = "patient"; draft.patient = structuredClone(getPatient()); render(); }
      if (action === "edit-entry") editEntry(element.dataset.id, element.dataset.type);
      if (action === "new-consultation") { draft.consultation = defaultConsultation(); consultationPage = "anamnese"; consultationUnlocked = 1; render(); }
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
  const scope = element.dataset.scope;
  const page = element.dataset.page;
  // O disabled do botao ja barra o clique; esta guarda barra o resto — teclado,
  // clique programatico, qualquer caminho que nao passe pela aba.
  if (!pageIsReachable(scope, page)) return;
  const form = element.closest("form");
  if (form) updateDraftFromForm(form);
  if (scope === "consultation") consultationPage = page;
  if (scope === "return") returnPage = page;
  render();
}

// O apendice guarda o modo de busca no rascunho, e nao numa variavel de modulo,
// porque ele acompanha o atendimento: sair da pagina e voltar tem de devolver a
// tela como estava.
function setAppendixSearchMode(mode) {
  const scope = view === "return" ? "return" : "consultation";
  const modo = mode === "sintoma" ? "sintoma" : "medicamento";
  if (scope === "return") draft.return = { ...(draft.return || {}), appendixSearchMode: modo };
  else draft.consultation = { ...(draft.consultation || {}), appendixSearchMode: modo };
  render();
}

function clearAppendixSymptom() {
  const scope = view === "return" ? "return" : "consultation";
  // A conduta sai junto com o sintoma: manter na tela o manejo da insonia
  // enquanto ele digita "agitacao" e oferecer a resposta errada com cara de
  // certa. Mesma razao pela qual o BIPP TIPS some ao trocar de farmaco.
  const limpo = { appendixSymptom: "", appendixSymptomConducts: "", appendixSymptomStatus: "", ragSourcesSintomatico: [] };
  if (scope === "return") draft.return = { ...(draft.return || {}), ...limpo };
  else draft.consultation = { ...(draft.consultation || {}), ...limpo };
  render();
}

function setAnamnesisInputMode(mode) {
  if (voiceRecording.isBusy()) {
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
  if (voiceRecording.isBusy()) {
    alert("Encerre a gravação e aguarde a transcrição antes de salvar e avançar.");
    return;
  }
  const form = element.closest("form");
  if (form) updateDraftFromForm(form);
  const scope = element.dataset.scope;
  const completedPage = currentPageForScope(scope);
  saveClinicalRecord(scope);
  const nextPage = nextPageForScope(scope);
  // A pagina seguinte e liberada de qualquer jeito, inclusive no desvio: o
  // fluxo avancou: o que muda e onde ele para. Sem isto, quem fosse desviado
  // para a ficha voltaria e acharia o Sintoma-Alvo ainda trancado.
  if (nextPage) unlockPage(scope, nextPage);
  const destino = medicationDetour(scope, completedPage) || nextPage;
  if (scope === "consultation" && destino) consultationPage = destino;
  if (scope === "return" && nextPage) returnPage = nextPage;
  render();
}

// Decisao dele: assinalado o medicamento no Tratamento, "Salvar e avancar" leva
// a ficha em vez da proxima etapa. A consulta a ficha nasce da prescricao — sem
// farmaco marcado nao ha o que consultar, e o fluxo segue reto.
//
// Nao e um pulo: e uma parada. A etapa seguinte fica liberada na mesma acao, e
// se alcanca dela pela aba, como qualquer pagina ja percorrida. Medicamentos e
// pagina-apendice (APPENDIX_PAGES) e nao precisa ser liberada.
function medicationDetour(scope, completedPage) {
  if (scope !== "consultation" || completedPage !== "tratamento") return "";
  // Pelo escopo, e nao por currentClinicalDraft(), que le a `view` global: aqui
  // quem manda e o escopo do botao que foi clicado.
  const marcados = arrayValue((draft.consultation || {}).tratamentoMedicamentosSelecionados);
  return marcados.length ? "medicamentos" : "";
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
// Preambulo identico nos cinco geradores: grava o que esta na tela antes de
// gerar — sem isso a IA raciocina sobre o registro anterior — e descobre se o
// alvo e a consulta ou o retorno.
function syncedTarget(element) {
  const formElement = element.closest("form");
  if (formElement) updateDraftFromForm(formElement);
  const scope = view === "return" ? "return" : "consultation";
  return { scope, target: scope === "return" ? draft.return : draft.consultation };
}

// Duas passadas, um gerador so. A primeira ("diagnosis") propoe com o livro
// geral; a segunda ("diagnosis_review"), opcional, revisa com o especializado e
// devolve a mesma estrutura — por isso o caminho de volta e identico, ate o
// mapeamento para o rascunho. Por decisao dele, a revisao substitui a tela
// inteira: nada da primeira passada sobrevive ao que a segunda nao repetir.
async function generateDiagnosisFromClinicalData(element, kind = "diagnosis") {
  const { scope, target } = syncedTarget(element);
  const revisao = kind === "diagnosis_review";
  // Refino so depois da escolha: o medico gera quantas vezes quiser, alternando
  // entre IA Nuvem e RAG, e assinala o que fica. O refinamento revisa o que ele
  // escolheu -- nao a lista inteira que a ultima geracao deixou na tela.
  if (revisao && !selectedDiagnosisValues(target || {}).length) {
    const houveGeracao = diagnosticNosologicalOptionLines(target || {}).length
      || diagnosticSyndromicOptionLines(target || {}).length
      || diagnosticEtiologicalOptionLines(target || {}).length;
    return alert(houveGeracao
      ? "Assinale as hipoteses antes de refinar: o refinamento revisa o que voce escolheu."
      : "Gere as hipoteses antes de refinar: o refinamento revisa a primeira passada, nao a substitui.");
  }
  setClinicalAiStatus(scope, revisao ? "Refinando o diagnostico com a fonte especializada..." : "Consultando IA real para diagnostico...");
  render();
  let suggestion;
  try {
    const context = clinicalAiContext(scope);
    const { result, sources, mode, codeWarnings } = await requestClinicalAi(kind, buildClinicalAiPrompt(kind, context.target, context.patient, context.previous, context.isReturn), revisao ? "rag" : context.target?.aiMode, buildRagQuery(kind, context.target));
    suggestion = diagnosisSuggestionFromAi({ result, target, sources, mode, codeWarnings, revisao });
    if (revisao) suggestion.aiStatus = `Refinado pela fonte especializada. ${suggestion.aiStatus}`;
  } catch (error) {
    suggestion = diagnosisSuggestionFromLocalCatalogue(target, error);
  }
  if (scope === "return") draft.return = { ...(draft.return || {}), ...suggestion };
  else draft.consultation = { ...(draft.consultation || {}), ...suggestion };
  render();
}

async function generateTreatmentFromClinicalData(element, kind = "treatment") {
  const { scope, target } = syncedTarget(element);
  const diagnosisText = treatmentDiagnosisText(target || {});
  if (!diagnosisText) return alert("Selecione ao menos uma hipotese diagnostica antes de gerar o tratamento.");
  const revisao = kind === "treatment_review";
  if (revisao && !treatmentOptionLines(target?.tratamentoAiMedicamentos).length
      && !treatmentOptionLines(target?.tratamentoAiAbordagens).length) {
    return alert("Gere o tratamento antes de refinar: o refinamento revisa a primeira passada, nao a substitui.");
  }
  const aviso = revisao ? "Refinando o tratamento com a fonte especializada..." : "Consultando IA real para tratamento...";
  setClinicalAiStatus(scope, aviso);
  if (scope === "return") draft.return = { ...(draft.return || {}), treatmentStatus: aviso };
  else draft.consultation = { ...(draft.consultation || {}), treatmentStatus: aviso };
  render();
  let suggestion;
  try {
    const context = clinicalAiContext(scope);
    const { result, sources, mode } = await requestClinicalAi(kind, buildClinicalAiPrompt(kind, context.target, context.patient, context.previous, context.isReturn), revisao ? "rag" : (context.target?.pharmaAiMode || "rag"), buildRagQuery(kind, context.target));
    const medicationOptions = result.medication_options.map(formatMedicationTreatmentOption);
    const approachOptions = result.non_pharmacological_options.map(formatNonPharmacologicalOption);
    suggestion = {
      // A IA propoe o nivel; quem assinala e o medico, como em todo o resto do
      // programa. Privar alguem de liberdade nao e decisao que se aceita por
      // omissao, entao o radio nao vem marcado.
      nivelCuidadoAi: result.care_level?.level || "",
      nivelCuidadoAiJustificativa: result.care_level?.justification || "",
      nivelCuidado: target?.nivelCuidado || "",
      nivelCuidadoJustificativa: target?.nivelCuidadoJustificativa || "",
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
      ragSourcesTratamento: sources,
      pharmaAiMode: mode,
      treatmentStatus: `${revisao ? "Refinado pela fonte especializada: " : ""}${result.care_level ? `Nível de cuidado proposto: ${result.care_level.level}. ` : "Nenhum nível de cuidado foi proposto — a resposta veio sem modalidade ou sem justificativa. "}${countLabel(medicationOptions.length, "opção medicamentosa", "opções medicamentosas")} e ${countLabel(approachOptions.length, "outra abordagem", "outras abordagens")} propostas para você assinalar. Suas escolhas anteriores foram mantidas.`,
      aiStatus: revisao ? "Tratamento refinado pela fonte especializada, para revisão médica." : "Sugestões de tratamento geradas pela IA para revisão médica."
    };
  } catch (error) {
    suggestion = (target?.pharmaAiMode || "rag") === "rag"
      ? { ragSourcesTratamento: [], treatmentStatus: `RAG indisponivel: ${error.message}`, aiStatus: `RAG indisponivel: ${error.message}` }
      : { ragSourcesTratamento: [], treatmentStatus: `IA indisponivel: ${error.message}`, aiStatus: `IA indisponivel: ${error.message}` };
  }
  if (scope === "return") draft.return = { ...(draft.return || {}), ...suggestion };
  else draft.consultation = { ...(draft.consultation || {}), ...suggestion };
  render();
}


// Cada linha e uma caixa de selecao independente: a conduta de manejo, a
// primeira opcao medicamentosa e a segunda. Ele pode querer so a orientacao, so
// o remedio, ou os dois — decisao dele a cada sintoma. Sintoma sem tratamento
// farmacologico vem so com a linha de conduta.
//
// Uma funcao so para os dois caminhos que chegam aqui — a busca do apendice e a
// geracao a partir do caso —, porque o formato da linha e o que o Tratamento, o
// Resumo e a narrativa sabem ler. Duas copias divergiriam, e a divergencia so
// apareceria no prontuario.
function targetSymptomConductLines(result = {}) {
  return (result.target_symptom_options || []).flatMap(item => {
    const sintoma = String(item?.symptom || "").trim();
    const conduta = String(item?.conduct || "").trim();
    if (!sintoma || !conduta) return [];
    const linhas = [`${sintoma} — ${conduta}`];
    (item?.medication_options || []).forEach((med, ordem) => {
      const partes = [
        String(med?.medication || "").trim(),
        `Dose inicial: ${String(med?.initial_dose || "").trim()}`,
        `Progressão: ${String(med?.progression || "").trim()}`,
        String(med?.interaction || "").trim() ? `Interação: ${String(med.interaction).trim()}` : ""
      ].filter(Boolean);
      linhas.push(`${sintoma} · ${ordem + 1}ª opção: ${partes.join(" | ")}`);
    });
    return linhas;
  }).filter((option, index, list) => list.indexOf(option) === index);
}

// A busca por sintoma do apendice. Usa a MESMA etapa "symptomatic" — mesmo
// prompt, mesma biblioteca, mesmo formato de resposta —, trocando so a origem do
// sintoma: em vez dos chips assinalados, o que ele digitou. Por isso monta um
// alvo-sombra com sintomasResiduais preenchido: assim a consulta ao RAG e a
// linha do registro que a IA le continuam as mesmas, e nao ha um segundo
// caminho para manter em pe.
async function generateAppendixSymptomConduct(element) {
  const { scope, target } = syncedTarget(element);
  const sintoma = String(target?.appendixSymptom || "").trim();
  if (!sintoma) return alert("Escreva o sintoma que voce quer consultar antes de gerar.");
  const gravar = dados => {
    if (scope === "return") draft.return = { ...(draft.return || {}), ...dados };
    else draft.consultation = { ...(draft.consultation || {}), ...dados };
  };
  gravar({ appendixSymptomStatus: "Consultando a literatura de manejo sintomatico..." });
  render();
  try {
    const context = clinicalAiContext(scope);
    const sombra = { ...(context.target || {}), sintomasResiduais: [sintoma], sintomasResiduaisOutro: "" };
    const { result, sources, mode } = await requestClinicalAi(
      "symptomatic",
      buildClinicalAiPrompt("symptomatic", sombra, context.patient, context.previous, context.isReturn),
      context.target?.symptomaticAiMode || "rag",
      buildRagQuery("symptomatic", sombra));
    const linhas = targetSymptomConductLines(result);
    gravar({
      appendixSymptomConducts: linhas.join("\n"),
      ragSourcesSintomatico: sources,
      symptomaticAiMode: mode,
      appendixSymptomStatus: linhas.length
        ? `${countLabel(linhas.length, "linha")} de manejo. Leve para o Tratamento o que voce adotar — o resto fica so nesta consulta.`
        : "Nenhuma conduta encontrada para este sintoma."
    });
  } catch (error) {
    gravar({ ragSourcesSintomatico: [], appendixSymptomStatus: `Literatura de manejo sintomatico indisponivel: ${error.message}` });
  }
  render();
}

// A ponte entre o apendice e o prontuario, e o unico lugar por onde a consulta
// vira registro. O apendice nao documenta: enquanto a conduta esta so na tela de
// busca, ela nao existe para o prontuario. Trazida para ca, ela entra no
// Tratamento ja assinalada — foi um ato dele, e nao uma proposta a conferir — e o
// sintoma entra na lista do caso, que e o que o Resumo e a narrativa leem.
function adoptAppendixConduct(conduta) {
  const linha = String(conduta || "").trim();
  if (!linha) return;
  const scope = view === "return" ? "return" : "consultation";
  const target = (scope === "return" ? draft.return : draft.consultation) || {};
  const sintoma = String(target.appendixSymptom || "").trim();
  const propostas = treatmentOptionLines(target.tratamentoAiSintomasAlvo);
  const marcadas = arrayValue(target.sintomasAlvoSelecionados);
  const sintomas = arrayValue(target.sintomasResiduais);
  const dados = {
    tratamentoAiSintomasAlvo: (propostas.includes(linha) ? propostas : [...propostas, linha]).join("\n"),
    sintomasAlvoSelecionados: marcadas.includes(linha) ? marcadas : [...marcadas, linha],
    sintomasResiduais: sintoma && !sintomas.some(item => normalizeText(item) === normalizeText(sintoma))
      ? [...sintomas, sintoma]
      : sintomas,
    appendixSymptomStatus: `"${linha}" foi para o Tratamento, ja assinalada.`
  };
  if (scope === "return") draft.return = { ...(draft.return || {}), ...dados };
  else draft.consultation = { ...(draft.consultation || {}), ...dados };
  render();
}

async function generateEvolutionFromClinicalData(element) {
  const { scope, target } = syncedTarget(element);
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

async function generateMedicationFromClinicalData(element, kind = "medication") {
  const { scope, target } = syncedTarget(element);
  if (!target?.medicationGeneric?.trim()) return alert("Digite o nome do medicamento antes de consultar a IA.");
  const revisao = kind === "medication_review";
  // A ficha tem campos que nao vem da IA — mecanismo, monitorizacao,
  // populacoes especiais, preenchidos pela busca local/online. Por isso o teste
  // olha so o que a primeira passada da IA escreve: sem isso, "Refinar" ficaria
  // habilitado sobre uma ficha que a IA nunca gerou.
  if (revisao && !target?.medicationPresentation && !target?.medicationSafety && !target?.medicationBestUse) {
    return alert("Gere a ficha antes de refinar: o refinamento revisa a primeira passada, nao a substitui.");
  }
  const aviso = revisao ? "Refinando a ficha com a fonte especializada..." : "Consultando IA real para medicamento...";
  setClinicalAiStatus(scope, aviso);
  if (scope === "return") draft.return = { ...(draft.return || {}), medicationStatus: aviso };
  else draft.consultation = { ...(draft.consultation || {}), medicationStatus: aviso };
  render();
  let suggestion;
  try {
    const context = clinicalAiContext(scope);
    const { result, sources, mode } = await requestClinicalAi(kind, buildClinicalAiPrompt(kind, context.target, context.patient, context.previous, context.isReturn), context.target?.pharmaAiMode || "rag", buildRagQuery(kind, context.target));
    suggestion = {
      medicationNameText: result.medication || target.medicationGeneric,
      medicationPresentation: result.dose_progression || "",
      medicationSafety: result.side_effects || "",
      medicationBestUse: result.notes || "",
      medicationStatus: revisao
        ? "Ficha refinada pela fonte especializada. Revise com bula vigente."
        : "Medicamento preenchido nos campos essenciais. Revise com bula vigente.",
      medicationOnlineStatus: revisao
        ? "Ficha revisada pela fonte especializada. Revise com bula brasileira e dados do paciente."
        : "Resposta de medicamento gerada pela IA real. Revise com bula brasileira e dados do paciente.",
      medicationTips: await fetchMedicationTips(context, target),
      aiStatus: revisao ? "Ficha refinada pela fonte especializada. Revise antes de salvar." : "Resposta gerada pela IA real. Revise antes de salvar.",
      ragSourcesMedicamento: sources,
      pharmaAiMode: mode
    };
  } catch (error) {
    const wasRag = (target?.pharmaAiMode || "rag") === "rag";
    suggestion = {
      ragSourcesMedicamento: [],
      medicationOnlineStatus: wasRag ? `RAG indisponivel: ${error.message}. Use pesquisa online ou prompt manual.` : `IA indisponível: ${error.message}. Use pesquisa online ou prompt manual.`,
      aiStatus: wasRag ? `RAG indisponivel: ${error.message}.` : `IA indisponível: ${error.message}.`
    };
  }
  if (scope === "return") draft.return = { ...(draft.return || {}), ...suggestion };
  else draft.consultation = { ...(draft.consultation || {}), ...suggestion };
  render();
}

// "Mostrar tudo": o capitulo do farmaco como esta no livro, do nome ate o fim
// dos BIPP TIPS, sem as referencias. Nao passa por IA nem por RAG — o texto vem
// recortado do PDF por scripts/build_book_chapters.py e servido inteiro, em
// ordem. Busca semantica devolveria trecho solto, e emendar trecho solto com um
// modelo produz parafrase, que e o oposto de "tal qual no livro".
//
// O texto nao entra no rascunho salvo: sao 13 a 30 mil caracteres do livro por
// farmaco, e o prontuario nao e lugar de guardar copia de obra licenciada. Fica
// so enquanto a tela esta aberta.
async function toggleBookChapter(element) {
  const { scope, target } = syncedTarget(element);
  const aplica = dados => {
    if (scope === "return") draft.return = { ...(draft.return || {}), ...dados };
    else draft.consultation = { ...(draft.consultation || {}), ...dados };
    render();
  };
  if (target?.medicationChapter) return aplica({ medicationChapter: null, medicationChapterStatus: "" });
  const nome = (target?.medicationGeneric || target?.medicationNameText || "").trim();
  if (!nome) return alert("Escolha o medicamento antes de mostrar o capitulo.");
  aplica({ medicationChapterStatus: "Abrindo o capitulo do livro..." });
  try {
    const resposta = await fetch(`/api/book-chapter?medicamento=${encodeURIComponent(nome)}`);
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) return aplica({ medicationChapter: null, medicationChapterStatus: dados.error || "Nao foi possivel abrir o capitulo." });
    aplica({ medicationChapter: dados, medicationChapterStatus: "" });
  } catch (error) {
    aplica({ medicationChapter: null, medicationChapterStatus: `Capitulo indisponivel: ${error.message}` });
  }
}

// Os BIPP TIPS sao uma secao da Psicofarmacologia: Da Teoria a Clinica (2025),
// no fim do capitulo de cada farmaco. Vem em chamada separada da ficha, e nao
// no mesmo schema, porque sao outra coisa: a ficha e redigida a partir da
// literatura, os tips sao reproduzidos de uma secao que ja existe escrita.
//
// Falha aqui nao derruba a ficha. A caixa some da tela e o resto fica: a ficha
// e o que sustenta a prescricao, e os tips sao acrescimo.
async function fetchMedicationTips(context, target) {
  try {
    const { result } = await requestClinicalAi(
      "medication_tips",
      buildClinicalAiPrompt("medication_tips", context.target, context.patient, context.previous, context.isReturn),
      // Sempre RAG: reproduzir uma secao de um livro so faz sentido com o livro
      // na mao. No modo "IA atual" nao ha secao nenhuma para reproduzir.
      "rag",
      buildRagQuery("medication_tips", context.target)
    );
    return (result.tips || []).join("\n\n");
  } catch {
    // Mantem o que ja estava: o farmaco e o mesmo desta chamada, e a caixa
    // anterior continua valendo. Zerar aqui apagaria a secao por causa de uma
    // falha de rede.
    return target?.medicationTips || "";
  }
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
  const { scope, target } = syncedTarget(element);
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
  // Consulta e retorno liam o formulario do mesmo jeito; so mudava o ramo do
  // draft que recebia o resultado.
  const chave = { "consult-form": "consultation", "return-form": "return" }[form.id];
  if (chave) {
    const data = formToObject(form);
    data.examesLaboratoriais = requestedExamsText(data);
    if ("evolution" in data) data.evolutionAutoGenerated = false;
    draft[chave] = { ...(draft[chave] || {}), ...data };
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

// Consulta ainda sem retorno registrado. A regra e "cada consulta tem no
// maximo um retorno", e ela estava escrita duas vezes, identica.
function returnCandidates() {
  const consultations = consultationsForPatient(selectedPatientId);
  return {
    consultations,
    pendingConsultation: consultations.find(consultation =>
      !state.returns.some(entry =>
        entry.patientId === selectedPatientId && entry.previousEntryId === consultation.id
      )
    )
  };
}

function defaultReturn() {
  const { consultations, pendingConsultation } = returnCandidates();
  if (!pendingConsultation) {
    const latestSavedReturn = returnsForPatient(selectedPatientId)[0];
    if (latestSavedReturn) return structuredClone(latestSavedReturn);
  }
  const previousEntryId = pendingConsultation?.id || consultations[0]?.id || "";
  return { patientId: selectedPatientId, label: "Retorno", type: "return", previousEntryId };
}

function startNewReturn() {
  const { pendingConsultation } = returnCandidates();
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
  returnUnlocked = 1;
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
  // Gravacao local antes de tudo: se ela falhou, o aviso e mais grave que o de
  // sincronizacao — ali o registro existe no aparelho e so nao subiu; aqui ele
  // nao existe em lugar nenhum.
  const erroLocal = saveState(state);
  if (erroLocal !== storageError) { storageError = erroLocal; render(); }
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
  // Registro salvo e reaberto: o atendimento ja foi percorrido inteiro, entao
  // as abas voltam a ser livres. O travamento existe para o atendimento novo.
  if (type === "consultation") {
    draft.consultation = structuredClone(entry);
    consultationPage = "evolucao";
    unlockAllPages("consultation");
    view = "consultation";
  } else {
    draft.return = structuredClone(entry);
    returnPage = "texto-retorno";
    unlockAllPages("return");
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

