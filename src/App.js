import { returnPlanSuggestionFromAi, treatmentSuggestionFromAi } from "./clinical/aiTreatmentResult.js";
import { createDraftGuard } from "./clinical/draftGuard.js";
import { anamnesisAiMarks, hasAiMarks, withoutAiMarks } from "./clinical/anamnesisOrigin.js";
import { hasIdentificationAiMarks, withoutIdentificationAiMark } from "./clinical/identificationOrigin.js";
import { analysisFindingsForReturn, pendingCriteriaFromPrevious, pendingRefinementForReturn, returnHypothesisLabels } from "./clinical/returnCarryover.js";
import { createAiOperations } from "./clinical/aiOperations.js";
import { createUnsavedWork } from "./clinical/unsavedWork.js";
import { statusFailure } from "./clinical/statusTone.js";
import { countLabel, diagnosisReviewFailure, diagnosisSuggestionFromAi, diagnosisSuggestionFromLocalCatalogue } from "./clinical/aiDiagnosisResult.js";
import { diagnosticEtiologicalOptionLines, diagnosticNosologicalOptionLines, diagnosticSyndromicOptionLines, selectedDiagnosisText, selectedDiagnosisValues, treatmentOptionLines } from "./clinical/diagnosis.js";
import { anamnesisText, buildEvolutionNarrative, evolutionNeedsRebuild, evolutionSuggestionOnAiFailure, normalizeEvolutionNarrative, removeReturnBoilerplate, requestedExamsText, treatmentDiagnosisText } from "./clinical/narrative.js";
import { loadProtocol, protocolLoaded, protocolScopeQuestions } from "./clinical/protocol.js";
import { formatPhone, whatsappLink } from "./clinical/phone.js";
import { arrayValue, joinValues, lowerFirst, normalizeText, stripFinalPeriod } from "./clinical/textFormat.js";
import { ANAMNESIS_AI_FIELDS, IDENTIFICATION_AI_FIELDS, orderedAnamnesisSections, pagesForScope, TELECONSULTA_CONSENTIMENTO } from "./clinical/vocabulary.js";
import { optionGroups } from "./data/examOptions.js";
import { targetSymptomOptions } from "./data/targetSymptoms.js";
import { fetchCep } from "./services/cepService.js";
import { buildClinicalAiPrompt, buildRagQuery, buildWebQuery, canonicalAiSelections, localRefinementPlan, requestClinicalAi, requestJevJudge, requestRiskScreen } from "./services/clinicalAiService.js";
import { localMedicationSuggestions } from "./services/medicationService.js";
import { exportTextAsPdf } from "./services/pdfService.js";
import { archiveEntry, archivePatient, isActive, isArchived, loadState, mergeStates, purgePatient, rebasePendingChanges, restorePatient, saveState, stateSignature, uid, unassignedLocalState, waitForLocalSave } from "./services/storageService.js";
import { archiveSyncConflict, authHeaders, verifiedSession, isConfigured as isSupabaseConfigured, signIn, signOut, syncState } from "./services/supabaseService.js";
import { resolveRecordConflict } from "./services/recordSyncService.js";
import { anamnesisStructuredFields, chips, field, phoneField, selectField, statusLine, summaryColumns, textarea, voiceTextarea } from "./ui/controls.js";
import { escapeAttr, escapeHtml } from "./ui/html.js";
import { createVoiceRecording } from "./ui/voiceRecording.js";
import { clipboardIcon, folderIcon, homeIcon, lockIcon, personIcon, repeatIcon, themeIcon } from "./ui/icons.js";
import { clinicalSummaryGroups, clinicalSummaryPage } from "./views/clinicalSummary.js";
import { aiModeSelector, diagnosisModule, evolutionBody, ragSourcesView, returnPlanModule, returnPlanSettled, treatmentAiMode, treatmentModule } from "./views/decisions.js";
import { consultationAccessPanel, EVOLUCAO_OPCOES, mentalExamBody, mentalExamNormalFill, missingReturnAssessment, neurologicExamBody, recordReturnAction, returnAssessmentBody } from "./views/exams.js";
import { caregiverHistoryCard, reproductiveHistoryCard } from "./views/lifeStageBlocks.js";
import { companionCard } from "./views/companion.js";
import { lifeStageOf, mayBePregnant, needsCaregiverHistory, needsReproductiveHistory, ragPatientScopes } from "./clinical/lifeStage.js";
import { bookChapterView, medicationReferenceCard } from "./views/medication.js";
import { scalesBody, scaleResultView, scaleTrendsView } from "./views/scales.js";
import { suggestedScales } from "./clinical/scaleSuggestions.js";
import { monitoringExamSelection, monitoringFor } from "./data/monitoring.js";
import { buildDocumentText, documentType, doctorFromForm, issuedDocument } from "./clinical/documents.js";
import { documentsBody } from "./views/documents.js";
import { previousScaleEntries, scaleFieldName } from "./clinical/scoring.js";
import { sanitizeConsultationRecord, screenOnlyFields, withoutBookChapters } from "./clinical/consultationRecord.js";
import { withVersionHistory } from "./clinical/versions.js";
import { finalizationNote, finalizedNotice, recordStatusLine, versionsView } from "./views/versions.js";
import { scaleById } from "./data/scales.js";
import { caseViewForReturn, groupCases } from "./clinical/caseTimeline.js";
import { caseSummaryView } from "./views/caseSummary.js";

const app = document.querySelector("#app");
// Vazio ate a leitura do aparelho terminar: desde 14/09/2026 o estado mora no
// IndexedDB, e ler de la e assincrono. A primeira tela so desenha depois.
let state = { patients: [], consultations: [], returns: [] };
let view = "dashboard";
let riskScreenTimer = null;
let riskScreenSequence = 0;
let selectedPatientId = "";
// Uma sincronizacao por vez: gravacoes seguidas entram na fila, e cada uma le a
// copia que a anterior deixou, em vez de disputarem a mesma linha.
let syncChain = Promise.resolve();
let draft = {};
let consultationPage = "anamnese";
let returnPage = "evolucao-retorno";
// Quantas paginas do fluxo ja foram liberadas. Comeca em 1: so a primeira.
let consultationUnlocked = 1;
let returnUnlocked = 1;
let pendingViewAfterPatient = "";
let anamnesisProcessingSequence = 0;
let clinicalDraftRevision = 0;
// Conta as trocas de rascunho (paciente, atendimento, sessao). As chamadas de
// IA conferem com ela na volta, para nao gravar a resposta no rascunho errado.
const draftGuard = createDraftGuard();
// Qual etapa tem chamada de IA em voo. O botao dela fecha enquanto isso; o
// formulario nao. Ver clinical/aiOperations.js.
const aiOperations = createAiOperations(() => paintAiBusyState());
// O que foi digitado e ainda nao foi gravado. Ver clinical/unsavedWork.js.
const unsavedWork = createUnsavedWork();
// Que botao pertence a que etapa. "Gerar" e "Refinar" do mesmo assunto sao a
// mesma vaga: escrevem nos mesmos campos e nao podem correr juntos.
const AI_BUSY_BUTTONS = {
  diagnosis: ["generate-diagnosis", "refine-diagnosis"],
  treatment: ["generate-treatment", "refine-treatment"],
  "return-plan": ["generate-return-plan"],
  evolution: ["generate-evolution"],
  medication: ["generate-medication-ai"],
  "appendix-symptom": ["generate-appendix-symptom"]
};
let refinementGenerating = false;
let authSession = null;
let unassignedRecords = 0;
let authError = "";
// Sem Supabase configurado no servidor, ninguem nunca consegue logar -- a tela
// de entrada travava ali para sempre. Modo local: sem conta, sem sincronizacao,
// gravando so neste aparelho. So vale quando NAO ha sessao nenhuma; quem ja
// esta logado continua logado e sincronizando normalmente.
let localOnlyMode = false;
// Falha de sincronizacao com o Supabase. Separada de authError, que so a tela
// de login renderiza: aqui precisa aparecer com a sessao aberta.
let syncError = "";
let syncConflict = null;
let resolvingConflict = false;
let storageError = "";
// A gravacao da consulta mora em ui/voiceRecording.js. Ela recebe daqui o que
// nao pode importar — o rascunho vivo e o formulario na tela — e devolve so
// duas coisas: como comecar/encerrar, e se ha algo em andamento.
const voiceRecording = createVoiceRecording({
  app,
  getDraft: () => draft,
  updateDraftFromForm,
  defaultConsultation,
  processAnamnesisTranscriptSilently,
  defaultReturn,
  processReturnTranscriptSilently
});
const RECORD_SEARCH_TEXT_CACHE = new WeakMap();
const ENTRY_TIMESTAMP_CACHE = new WeakMap();
// consultationsForPatient/returnsForPatient/entriesForPatient eram um filter
// sobre TODA a base a cada chamada, nao so os registros do paciente aberto.
// Indexado por patientId aqui, uma vez por `state` (chave fraca: state e
// trocado, nao mutado, a cada gravacao -- o indice velho vira lixo sozinho).
const PATIENT_INDEX_CACHE = new WeakMap();

const icons = {
  patient: personIcon(),
  consult: clipboardIcon(),
  return: repeatIcon(),
  record: folderIcon(),
  exit: lockIcon()
};

// Fechar a aba com a consulta na tela descartava tudo em silencio: o programa
// so grava no clique, e nao havia pergunta nem rastro. Registrado UMA vez, aqui,
// e nao em bindViewEvents -- aquele roda a cada render(), e empilharia um ouvinte
// por desenho da tela.
//
// O texto da caixa e do navegador, e nao nosso: nenhum navegador atual deixa a
// pagina escolher o que ela diz. O que esta em nossa mao e a pergunta existir.
window.addEventListener("beforeunload", event => {
  if (!haTrabalhoNaoSalvo()) return;
  event.preventDefault();
  // Firefox e Safari antigos so respeitam returnValue.
  event.returnValue = "";
});

// Gravacao em andamento conta como trabalho nao salvo: o audio ainda nao virou
// texto, e recarregar a pagina o perde inteiro. Mesmo criterio que ja barra
// Salvar, Finalizar e Sair enquanto o microfone esta aberto.
function haTrabalhoNaoSalvo() {
  return unsavedWork.ha() || voiceRecording.isBusy();
}

Promise.all([verifiedSession(), isSupabaseConfigured()]).then(async ([session, configured]) => {
  localOnlyMode = !configured;
  if (session && configured && session.user?.id) {
    authSession = session;
    await loadAccountState(session.user.id);
    await syncAfterLogin();
  } else if (localOnlyMode) {
    authSession = null;
    const local = await loadState();
    state = withoutBookChapters(local.state);
    storageError = local.aviso;
    selectedPatientId = firstActivePatientId();
  } else {
    authSession = null;
    state = { patients: [], consultations: [], returns: [] };
  }
  render();
}).catch(error => {
  authSession = null;
  localOnlyMode = false;
  state = { patients: [], consultations: [], returns: [] };
  authError = `Falha ao abrir os prontuários: ${error.message}. Recarregue a página.`;
  render();
});

async function loadAccountState(ownerId) {
  syncConflict = null;
  state = { patients: [], consultations: [], returns: [] };
  selectedPatientId = "";
  const local = await loadState(ownerId);
  state = withoutBookChapters(local.state);
  storageError = local.aviso;
  selectedPatientId = firstActivePatientId();
  const antigo = await unassignedLocalState();
  let alreadyImported = false;
  try { alreadyImported = Boolean(localStorage.getItem(`psires_legacy_claimed:${ownerId}`)); } catch {}
  unassignedRecords = alreadyImported ? 0
    : (antigo.patients || []).length + (antigo.consultations || []).length + (antigo.returns || []).length;
}

async function importUnassignedRecords() {
  const ownerId = authSession?.user?.id;
  if (!ownerId || !unassignedRecords) return;
  if (!confirm(`Importar ${unassignedRecords} registros antigos deste navegador para a conta ${authSession.user.email || ownerId}? Confirme somente se estes prontuários pertencem a esta conta.`)) return;
  const antigo = await unassignedLocalState();
  const juntos = withoutBookChapters(mergeStates(state, antigo));
  const erro = await saveState(juntos, ownerId);
  if (erro) { storageError = erro; render(); return; }
  state = juntos;
  try { localStorage.setItem(`psires_legacy_claimed:${ownerId}`, "1"); } catch {}
  unassignedRecords = 0;
  selectedPatientId = firstActivePatientId();
  syncWithAccount();
  render();
}

// Une o que esta neste aparelho com o que esta na conta. Roda ao abrir o app
// com sessao e, desde 10/09/2026, tambem logo depois de entrar: antes so rodava
// ao abrir, entao quem saia e entrava de novo -- ou entrava pela primeira vez
// num aparelho -- via apenas a copia local ate recarregar a pagina.
async function syncAfterLogin() {
  const ownerId = authSession?.user?.id;
  if (!ownerId) return;
  syncError = "";
  try {
    // Une, nao substitui: o que foi escrito enquanto a sincronizacao estava
    // fora precisa sobreviver ao proximo carregamento. syncState le, junta e
    // devolve a copia que a conta passou a guardar.
    const daConta = await syncState(state, mergeStates, 3, ownerId);
    if (daConta && authSession?.user?.id === ownerId) {
      state = withoutBookChapters(daConta);
      storageError = await saveState(state, ownerId);
      selectedPatientId = firstActivePatientId();
    }
  } catch (error) { syncError = error.message; syncConflict = error.conflict || null; }
}

function render() {
  document.body.classList.toggle("light", state.theme === "light");
  if (!authSession && !localOnlyMode) { app.innerHTML = loginView(); bindAuthEvents(); return; }
  app.innerHTML = `
    <div class="app-shell">
      ${topbar()}
      <main class="container">${syncConflict ? conflictReview() : ""}${view === "dashboard" ? dashboard() : workspace()}</main>
    </div>
  `;
  bindGlobalEvents();
  bindViewEvents();
}

function conflictReview() {
  const { kind, recordId, local, remote } = syncConflict;
  const label = { patient: "paciente", consultation: "consulta", return: "retorno", meta: "configuração" }[kind] || kind;
  const copy = value => escapeHtml(JSON.stringify(value, null, 2));
  return `<section class="conflict-review" role="alert" aria-label="Conflito de sincronização">
    <h2>Revisar duas versões do mesmo ${label}</h2>
    <p>Registro ${escapeHtml(recordId)}. As duas cópias permanecem separadas até sua decisão. Compare datas e conteúdo clínico; a versão descartada será guardada no histórico de conflitos da conta.</p>
    <div class="conflict-copies">
      <details open><summary>Neste aparelho</summary><pre>${copy(local)}</pre></details>
      <details open><summary>Na conta</summary><pre>${copy(remote)}</pre></details>
    </div>
    <div class="actions"><button type="button" class="secondary" data-action="resolve-sync-conflict" data-choice="local">Manter versão deste aparelho</button>
    <button type="button" class="secondary" data-action="resolve-sync-conflict" data-choice="remote">Usar versão da conta</button></div>
  </section>`;
}

/**
 * render() substitui todo o innerHTML, então o campo em edição é destruído e
 * recriado. Guarda qual campo estava focado e onde o cursor estava, e devolve
 * os dois depois de redesenhar.
 */
function loginView() {
  return `<main class="auth-shell"><section class="auth-card"><h1>Prontuário Psiquiátrico</h1><p>Entre para acessar seus prontuários com segurança.</p><form id="auth-form"><label>E-mail<input name="email" type="email" autocomplete="username" required /></label><label>Senha<input name="password" type="password" autocomplete="current-password" required /></label>${authError ? `<p class="warning">${escapeHtml(authError)}</p>` : ""}<button class="primary" type="submit">Entrar</button></form></section></main>`;
}

function bindAuthEvents() {
  app.querySelector("#auth-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    authError = "";
    try {
      await waitForLocalSave();
      authSession = await signIn(form.email.value.trim(), form.password.value);
      await loadAccountState(authSession.user.id);
      await syncAfterLogin();
      render();
    }
    catch (error) {
      signOut().catch(() => {});
      authSession = null;
      state = { patients: [], consultations: [], returns: [] };
      selectedPatientId = "";
      unassignedRecords = 0;
      authError = error.message;
      render();
    }
  });
}

function topbar() {
  return `
    <header class="topbar">
      <div class="brand">
        <div><h1>Regis Braga</h1></div>
      </div>
      <div class="top-actions">
        ${storageError
          ? `<span class="sync-status storage-failed" role="alert">${escapeHtml(storageError)}</span>`
          : syncError
            ? `<span class="sync-status sync-failed" role="status">Não sincronizado: ${escapeHtml(syncError)} O registro está salvo neste aparelho.</span>`
            : localOnlyMode
              ? `<span class="sync-status" role="status">Modo local: sem Supabase configurado. Salvando só neste aparelho.</span>`
              : `<span class="secure-status"><i></i> Conta autenticada</span>`}
        ${view === "dashboard" ? "" : `<button class="secondary compact-action" data-action="dashboard">${homeIcon()}<span>Início</span></button>`}
        <button class="icon-button" data-action="toggle-theme" aria-label="Alternar tema" title="Alternar tema">${themeIcon()}</button>
      </div>
    </header>
  `;
}

function dashboard() {
  const cards = [
    ["patient", "Novo paciente", "patient", "01"],
    ["consult", "Nova consulta", "consultation", "02"],
    ["return", "Registrar retorno", "return", "03"],
    ["record", "Prontuários", "record", "04"]
  ];
  const ativos = new Set((state.patients || []).filter(isActive).map(patient => patient.id));
  const entries = [...(state.consultations || []), ...(state.returns || [])]
    .filter(entry => isActive(entry) && ativos.has(entry.patientId)).length;
  return `<section class="dashboard">
      <div class="dashboard-intro">
      <div class="intro-copy">
        <span class="eyebrow">Prontuário psiquiátrico</span>
        <p>Um espaço calmo para registrar, acompanhar e cuidar.</p>
      </div>
      <div class="today"><span>HOJE</span><strong>${new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long" }).format(new Date())}</strong></div>
    </div>
    <div class="dashboard-metrics">
      <div><span>Pacientes cadastrados</span><strong>${String(ativos.size).padStart(2, "0")}</strong></div>
      <div><span>Registros clínicos</span><strong>${String(entries).padStart(2, "0")}</strong></div>
      <div class="privacy-note">${lockIcon()}<span><strong>Privacidade em primeiro lugar</strong><small>${syncError ? "Salvo neste aparelho. A cópia da sua conta está pendente." : "Salvo neste aparelho e na sua conta, sob o seu login."}</small></span></div>
    </div>
    <div class="quick-heading"><span>Acesso rápido</span><small>Selecione uma ação para começar</small></div>
    <div class="dashboard-actions">${cards.map(([icon, title, target, number]) => `
      <button class="dash-button" data-view="${target}">
        <span class="card-number">${number}</span><span class="dash-icon">${icons[icon]}</span>
        <span class="dash-copy"><strong>${title}</strong></span><span class="card-arrow">→</span>
      </button>`).join("")}</div>
    ${authSession && unassignedRecords ? `<div class="privacy-note" role="status"><span>Há ${unassignedRecords} registros antigos neste navegador, sem conta identificada. Eles não foram enviados à sua conta. <button type="button" class="secondary" data-action="import-unassigned">Importar para esta conta</button></span></div>` : ""}
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
        <div class="side-foot"><div><strong>Dr. Regis Braga</strong><small>Psiquiatria</small></div></div>
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
  const marcas = patient.identificationAiMarks || {};
  return `
    <div class="panel-title">
      <div><h2>Novo Paciente</h2></div>
      ${patientSelector("edit-patient")}
    </div>
    ${hasIdentificationAiMarks(marcas) ? `
      <p class="ai-origin-legend" role="status">
        Campos com esta marca foram preenchidos pela extração da IA a partir da transcrição da consulta e ainda não foram conferidos por você. A marca sai quando você edita o campo.
      </p>
    ` : ""}
    <form id="patient-form">
      <div class="grid patient-grid">
        ${field("nome", "Nome completo", patient.nome)}
        ${field("nomeSocial", "Nome social / como prefere ser chamado(a)", patient.nomeSocial, "text", Boolean(marcas.nomeSocial))}
        ${selectField("sexo", "Sexo", optionGroups.sexo, patient.sexo)}
        ${selectField("genero", "Identidade de gênero", optionGroups.genero, patient.genero)}
        ${field("nascimento", "Data de nascimento", patient.nascimento, "date", Boolean(marcas.nascimento))}
        ${selectField("estadoCivil", "Estado civil", optionGroups.estadoCivil, patient.estadoCivil, Boolean(marcas.estadoCivil))}
        ${field("ocupacao", "Ocupacao", patient.ocupacao, "text", Boolean(marcas.ocupacao))}
        ${selectField("escolaridade", "Escolaridade", optionGroups.escolaridade, patient.escolaridade)}
        ${selectField("religiao", "Religiao", optionGroups.religiao, patient.religiao, Boolean(marcas.religiao))}
        ${field("email", "E-mail", patient.email, "email")}
        ${phoneField("telefone", "Fone/WhatsApp", patient.telefone)}
        ${field("emergencia", "Nome e contato de emergencia", patient.emergencia)}
      </div>
      <div class="address-card">
        <div class="address-grid">
          ${field("cep", "CEP", patient.cep, "text", Boolean(marcas.cep))}
          ${field("endereco", "Endereco", patient.endereco, "text", Boolean(marcas.endereco))}
          ${field("numero", "Numero", patient.numero)}
          ${field("bairro", "Bairro", patient.bairro, "text", Boolean(marcas.bairro))}
          ${field("cidade", "Cidade", patient.cidade, "text", Boolean(marcas.cidade))}
          ${field("estado", "UF", patient.estado, "text", Boolean(marcas.estado))}
          ${field("complemento", "Complemento", patient.complemento)}
        </div>
      </div>
      <div class="actions">
        <button class="primary" type="submit">Salvar Paciente</button>
        ${patient.id ? `<button class="danger" type="button" data-action="delete-patient">Arquivar paciente</button>` : ""}
      </div>
    </form>
    ${archivedPatientsPanel()}
  `;
}

// Os arquivados moram aqui, na pagina do paciente: e onde se arquiva, e e onde
// se procura quem sumiu da lista.
function archivedPatientsPanel() {
  const arquivados = (state.patients || []).filter(isArchived);
  if (!arquivados.length) return "";
  return `<details class="clinical-card archived-patients">
    <summary>Pacientes arquivados (${arquivados.length})</summary>
    <p class="field-hint">Arquivado sai das listas e continua guardado, neste aparelho e na sua conta. A exclusão definitiva apaga o prontuário em todos os aparelhos e não tem volta.</p>
    ${arquivados.map(patient => `<article class="timeline-item">
      <h4>${escapeHtml(patient.nome || "Sem nome")} — arquivado em ${new Date(patient.arquivadoEm).toLocaleDateString("pt-BR")}</h4>
      <div class="actions">
        <button class="secondary" type="button" data-action="restore-patient" data-id="${escapeAttr(patient.id)}">Restaurar</button>
        <button class="danger" type="button" data-action="purge-patient" data-id="${escapeAttr(patient.id)}">Excluir definitivamente</button>
      </div>
    </article>`).join("")}
  </details>`;
}

function patientSelector(action = "select-patient") {
  return `
    <label>Paciente
      <select data-action="${action}">
        <option value="">Selecionar paciente</option>
        ${state.patients.filter(isActive).map(patient => `<option value="${escapeAttr(patient.id)}" ${selectedPatientId === patient.id ? "selected" : ""}>${escapeHtml(patient.nome || "Sem nome")}</option>`).join("")}
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
      <div><h2>${escapeHtml(form.label)}</h2><p>${escapeHtml(patient.nome)}</p></div>
      ${patientSelector()}
    </div>
    <form id="consult-form">
      ${isSavedEntry ? recordReturnAction("Consulta anterior aberta para revisao") : ""}
      ${finalizedNotice(form)}
      ${consultationAccessPanel(consultations, form)}
      ${consultationModeCard(form)}
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
      <div><h2>${escapeHtml(form.label)}</h2><p>${escapeHtml(patient.nome)} | comparação com o atendimento anterior${previous?.createdAt ? `, de ${new Date(previous.createdAt).toLocaleDateString("pt-BR")}` : ""}.</p></div>
      ${patientSelector()}
    </div>
    <form id="return-form">
      ${returnRecordAccessPanel(form, patient.id)}
      ${finalizedNotice(form)}
      ${consultationModeCard(form)}
      ${formPageTabs("return")}
      ${returnPageBody(form, patient, previous)}
    </form>
  `;
}

// Modalidade, na consulta e no retorno desde 11/09/2026 -- o retorno e onde a
// teleconsulta mais acontece. A distancia, a Res. CFM 2.314/2022 pede o
// consentimento do paciente registrado; o local onde ele esta e o dado que se
// precisa para encaminhar a uma emergencia no meio do atendimento.
function consultationModeCard(form = {}) {
  const remoto = ["TELECONSULTATION", "HYBRID"].includes(form.consultationMode);
  return `<div class="clinical-card consultation-mode-card">
    ${selectField("consultationMode", "Modalidade da consulta", ["IN_PERSON", "TELECONSULTATION", "HYBRID"], form.consultationMode || "IN_PERSON")}
    ${remoto ? `${chips("teleconsultaConsentimento", "Consentimento", [TELECONSULTA_CONSENTIMENTO], form.teleconsultaConsentimento)}
    ${field("teleconsultaLocalPaciente", "Onde o paciente está durante o atendimento (cidade/UF)", form.teleconsultaLocalPaciente || "")}` : ""}
  </div>`;
}

// Fecha a P8 do PENDENCIAS.md, na parte simples: nao tenta extrair dose e
// tempo do relato -- so pergunta o que da para responder com certeza (o
// farmaco, e se melhorou), e joga o resto para o medico decidir no
// Tratamento, exatamente como o resto do programa ja faz com incerteza.
// Decisao do Dr. Regis, 24/09/2026.
const CLASSES_PSICOFARMACO = ["Antidepressivos", "Estabilizador de humor", "Antipsicotico", "Benzodiazepinico", "Hipnotico", "Psicoestimulante"]
  .map(normalizeText);

function previousPharmacologicalTreatmentReportField(form = {}) {
  const marcados = arrayValue(form.tratamentos).map(normalizeText);
  if (!CLASSES_PSICOFARMACO.some(classe => marcados.includes(classe))) return "";
  return textarea("tratamentoFarmacoPrevioRelato",
    "Quais farmacos, e o que lembra de cada um? Um por linha, como o paciente contar -- dose, tempo de uso, resultado.",
    form.tratamentoFarmacoPrevioRelato || "", "", 3);
}

function returnRecordAccessPanel(form, patientId) {
  const returns = returnsForPatient(patientId);
  return `<div class="clinical-card record-access">
    <h4>Retornos salvos deste paciente</h4>
    <div class="actions">
      <button class="secondary" type="button" data-action="new-return">Novo retorno</button>
      ${returns.length ? returns.map(entry => `
        <button class="secondary ${entry.id === form.id ? "active" : ""}" type="button" data-action="edit-entry" data-id="${escapeAttr(entry.id)}" data-type="return">
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
    ${companionCard(form)}
    <div class="clinical-card shortcut-card">
      <h4>Paciente com diagnóstico já definido</h4>
      <p class="field-hint">Salva o que estiver nesta página e vai direto ao Diagnóstico, para você escrever a hipótese e seguir ao Tratamento. As páginas intermediárias ficam liberadas e podem ser preenchidas depois, pelas abas.</p>
      <div class="actions">
        <button class="secondary" type="button" data-action="skip-to-diagnosis">Já tenho o diagnóstico</button>
      </div>
    </div>
    <div id="risk-screen-banner" class="risk-screen-banner" aria-live="polite"></div>
    ${hasAiMarks(form.anamnesisAiMarks) ? `
      <p class="ai-origin-legend" role="status"><span class="chip chip-ai" aria-hidden="true">exemplo</span>
        Caixas com esta marca foram preenchidas pela extração da IA a partir da transcrição e ainda não foram conferidas por você. A marca sai quando você toca a caixa.</p>
    ` : ""}
    ${anamnesisQuestionGuide()}
    <div class="clinical-card antecedents-card">
      <h4>Antecedentes pessoais e familiares</h4>
      ${chips("psiPrevios", "Diagnosticos psiquiatricos previos", optionGroups.psiPrevios, form.psiPrevios, form)}
      ${chips("tratamentos", "Tratamentos previos", optionGroups.tratamentos, form.tratamentos, form)}
      ${previousPharmacologicalTreatmentReportField(form)}
      ${textarea("medicos", "Antecedentes medicos", joinValues(form.medicos), "", 2)}
      ${chips("familiares", "Antecedentes familiares", optionGroups.familiares, form.familiares, form)}
    </div>
    ${caregiverHistoryCard(form, patient)}
    ${reproductiveHistoryCard(form, patient)}
    ${chips("fatores", "Fatores desencadeantes e de piora", optionGroups.fatores, form.fatores, form)}
    ${chips("fatoresMelhora", "Fatores de melhora", optionGroups.fatoresMelhora, form.fatoresMelhora, form)}
    ${chips("impacto", "Impacto funcional", optionGroups.impacto, form.impacto, form)}
  `, "consultation");
  if (consultationPage === "psiquico") return clinicalPage("Exame psiquico", mentalExamBody(form), "consultation");
  if (consultationPage === "neurologico") return clinicalPage("Exame fisico e neurologico", neurologicExamBody(form), "consultation");
  if (consultationPage === "refinamento") return clinicalPage("", refinementBody(form), "consultation");
  if (consultationPage === "resumo") return clinicalPage("Resumo", clinicalSummaryPage(form, patient, returnsForPatient(patient.id).filter(entry => entry.id !== form.id)), "consultation");
  if (consultationPage === "diagnostico") return clinicalPage("Diagnostico e diferenciais", diagnosisModule(form), "consultation");
  // O historico farmacologico vai a tela pelo mesmo motivo que vai ao prompt, e
  // tem de ser o MESMO: o medico precisa poder ver por que a proposta evitou um
  // farmaco que ele esperaria ali. Proposta cuja razao nao aparece na tela e
  // proposta que ele tem de aceitar no escuro.
  if (consultationPage === "tratamento") return clinicalPage("Tratamento e orientacoes", treatmentModule(form, { podeEngravidar: mayBePregnant(patient), historico: entriesForPatient(patient.id) }), "consultation");
  if (consultationPage === "evolucao") return clinicalPage("Historia clinica", evolutionBody(form, patient), "consultation");
  if (consultationPage === "medicamentos") return clinicalPage("Medicamentos", medicationBody(form), "consultation");
  if (consultationPage === "escalas") return clinicalPage("Escalas", scalesBody(form, scaleHistory(form), false, suggestedScales(form, patient)), "consultation");
  if (consultationPage === "documentos") return clinicalPage("Documentos", documentsBody(form, documentViewOptions("consultation", form)), "consultation");
  return clinicalPage("Historia clinica", evolutionBody(form, patient), "consultation");
}

function returnPageBody(form, patient, previous) {
  if (returnPage === "evolucao-retorno") return clinicalPage("Avaliacao de evolucao", returnAssessmentBody(form, previous), "return");
  // Diagnostico e Tratamento tinham ramo aqui sem aba que levasse a eles: o
  // retorno tem duas etapas, e a conduta dele e o Ajuste. Sairam em 10/09/2026.
  // Medicamentos fica, agora com aba: e o apendice, e sem botao de salvar -- o
  // retorno so grava depois da Evolucao completa, no Ajuste de conduta.
  if (returnPage === "medicamentos") return clinicalPage("Medicamentos", medicationBody(form), "return", false);
  // Escalas segue a mesma regra do apendice no retorno: sem botao proprio. A
  // resposta fica no rascunho e grava junto com o retorno, no Ajuste de conduta.
  if (returnPage === "escalas") return clinicalPage("Escalas", scalesBody(form, scaleHistory(form), true, suggestedScales(form, patient, { isReturn: true, previous })), "return", false);
  if (returnPage === "documentos") return clinicalPage("Documentos", documentsBody(form, documentViewOptions("return", form)), "return", false);
  // A pagina junta as duas coisas na ordem em que se decide, e SO na ordem em
  // que se decide: o texto nao abre junto, aparece depois do ajuste, ja com o
  // ajuste dentro. Antes disso nao haveria o que escrever.
  return clinicalPage("Ajuste de conduta",
    returnPlanModule(form, { historico: entriesForPatient(patient.id) }) + (returnPlanSettled(form)
      ? evolutionBody(form, patient, previous, true)
      : `<p class="diagnosis-empty">O texto da evolução aparece aqui depois que você assinalar a conduta acima.</p>`),
    "return");
}

function refinementBody(form = {}) {
  const plan = form.refinementPlan;
  if (!plan) {
    return `
      <section class="refinement-section refinement-empty-state">
        <h4>Refinamento clínico</h4>
        ${refinementGenerating
          ? "<p>Preparando perguntas com a literatura...</p>"
          : '<button class="primary" type="button" data-action="start-refinement">Iniciar refinamento</button>'}
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
  // De onde vieram as perguntas, desde 11/09/2026. O roteiro local e fixo --
  // quatro perguntas de ansiedade, iguais para qualquer paciente -- e entrava
  // na tela com a mesma cara das que saem do protocolo dos livros.
  const origem = plan.origem === "local"
    ? `<div class="warning">A IA não respondeu. Estas perguntas são um roteiro fixo de contingência, iguais para qualquer paciente: não saíram do protocolo de entrevista nem da literatura.</div>`
    : plan.origem === "ia"
      ? statusLine("O protocolo de entrevista não carregou: as perguntas abaixo foram propostas pela IA, sem a lista fechada dos livros.")
      : "";
  return `
    ${origem}
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
// Cada modo tem a sua procedencia, e o campo do formulario guarda a do modo que
// respondeu. Nunca as duas: uma chamada e RAG ou e Nuvem.
// Guidelines recupera documento indexado, como o RAG -- o que muda e a estante,
// nao a forma da procedencia. Sem esta linha a coluna de fontes ficava vazia no
// modo novo: a resposta citaria diretriz e a tela nao diria qual, que e
// exatamente o defeito que a caixa de fontes existe para nao ter.
function sourcesOfMode(mode, sources = [], webSources = []) {
  return mode === "rag" || mode === "guidelines" ? (sources || []) : (webSources || []);
}

function medicationBody(form) {
  const modo = form.appendixSearchMode === "sintoma" ? "sintoma" : "medicamento";
  const medicationName = form.medicationGeneric || "";
  const sintomaBuscado = form.appendixSymptom || "";
  const hasInformation = Boolean(form.medicationNameText || form.medicationClassMechanism || form.medicationInitialDose
    || form.medicationPresentation || form.medicationSafety || form.medicationBestUse);
  const condutas = appendixSymptomLines(form);
  // Para onde a conduta adotada vai. Na consulta, o Tratamento; no retorno, que
  // nao tem Tratamento, o Ajuste de conduta (ver adoptAppendixConduct).
  const destinoConduta = view === "return" ? "Ajuste de conduta" : "Tratamento";
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
        <!-- So "Gerar". "Refinar" e "Capitulo do livro" sairam daqui em
             02/09/2026: tres botoes numa consulta que e uma pergunta so. O
             capitulo nao dependia do botao — carrega sozinho ao escolher o
             farmaco, e agora fecha e reabre pelo proprio cabecalho dele. -->
        <div class="actions">
          <button class="primary" type="button" data-action="generate-medication-ai">Gerar</button>
        </div>
        ${form.medicationAcervoAviso ? `<p class="warning" role="alert">${escapeHtml(form.medicationAcervoAviso)}</p>` : ""}
        ${statusLine(form.medicationOnlineStatus, "medication-source-status")}
        ${ragSourcesView(form.ragSourcesMedicamento)}
        ${bookChapterView(form)}
        ${hasInformation ? medicationReferenceCard(form) : (form.medicationChapter ? "" : `
          <div class="medication-empty-state">
            <span>Rx</span>
            <h4>Medicamento</h4>
          </div>
        `)}
      ` : `
        <div class="medication-search-shell">
          <span class="medication-search-icon" aria-hidden="true">⌕</span>
          <input id="appendix-symptom-lookup" name="appendixSymptom" value="${escapeAttr(sintomaBuscado)}"
            autocomplete="off" list="appendix-symptom-hints" aria-label="Sintoma a consultar" />
          <datalist id="appendix-symptom-hints">${targetSymptomOptions
            .map(item => `<option value="${escapeAttr(item)}"></option>`).join("")}</datalist>
          <button class="medication-clear" type="button" data-action="clear-appendix-symptom" aria-label="Limpar pesquisa">×</button>
        </div>
        <p class="field-hint">Escreva o sintoma com as palavras que quiser — não há lista fechada. Com atendimento aberto, a conduta sai ancorada neste paciente.</p>
        ${aiModeSelector(form.symptomaticAiMode || "rag", "symptomaticAiMode")}
        <div class="actions">
          <button class="primary" type="button" data-action="generate-appendix-symptom">Gerar</button>
        </div>
        ${statusLine(form.appendixSymptomStatus, "medication-source-status")}
        ${ragSourcesView(form.ragSourcesSintomatico)}
        ${condutas.length ? `
          <section class="appendix-symptom-results">
            <h4>Manejo de ${escapeHtml(sintomaBuscado)}</h4>
            <p class="field-hint">Consulta, não prontuário. O que você levar para o ${destinoConduta} é o que fica registrado.</p>
            <ul>${condutas.map(linha => `
              <li>
                <span>${escapeHtml(linha)}</span>
                <button class="secondary" type="button" data-action="adopt-appendix-conduct" data-conduta="${escapeAttr(linha)}"
                  title="Leva esta conduta para o ${destinoConduta}, onde ela entra no prontuario.">Levar para o ${destinoConduta}</button>
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
      ${caseSummaryView(patientEntries)}
      ${scaleTrendsView(patientEntries)}
      <div class="timeline" aria-live="polite">${recordTimeline(all)}</div>
    </div>
  `;
}

// O prontuario passa a mostrar o CASO, e nao a pilha de registros.
//
// A lista era plana e ordenada por data, o que punha o retorno acima da consulta
// que ele comenta: lia-se o caso de tras para frente. Consulta e retorno agora
// ficam lado a lado, na ordem em que se le -- o que foi decidido a esquerda, o
// que aconteceu depois a direita.
//
// Desde 14/09/2026 (leva 4) o caso e a consulta e todos os retornos que
// descendem dela, em cadeia (groupCases). Dois cartoes ficam lado a lado; mais
// de dois viram grade, na ordem em que aconteceram.
function recordTimeline(entries) {
  if (!entries.length) return `<div class="warning">Nenhum registro encontrado para os filtros atuais.</div>`;
  return groupCases(entries).map(caso => {
    const registros = [caso.consulta, ...caso.retornos].filter(Boolean);
    const classe = registros.length === 2 ? " paired" : registros.length > 2 ? " chain" : "";
    return `<section class="timeline-case${classe}">${registros.map(recordEntryCard).join("")}</section>`;
  }).join("");
}

function recordEntryCard(entry) {
  return `
    <article class="timeline-item">
      <h4>${escapeHtml(entry.label)} - ${new Date(entry.createdAt).toLocaleString("pt-BR")}</h4>
      ${recordStatusLine(entry)}
      <p>${escapeHtml(recordReportText(entry))}</p>
      ${versionsView(entry)}
      <div class="actions">
        <button class="secondary" data-action="pdf-entry" data-id="${escapeAttr(entry.id)}" data-type="${escapeAttr(entry.type)}">Exportar PDF</button>
      </div>
    </article>`;
}

function exitPanel() {
  return `
    <div class="panel-title"><div><h2>Sair do Sistema</h2></div></div>
    <div class="warning">Sair encerra a sua sessão neste navegador e volta à tela de entrada. Salve antes o que estiver em edição: o que não foi salvo se perde. O que já foi salvo continua neste aparelho e na sua conta.</div>
    <div class="actions"><button class="danger" data-action="exit-now">Encerrar sessão</button><button class="secondary" data-action="dashboard">Cancelar</button></div>
  `;
}

function emptyPatientMessage(title) {
  return `<div class="panel-title"><div><h2>${title}</h2><p>Selecione ou cadastre um paciente para continuar.</p></div>${patientSelector()}</div><div class="actions"><button class="primary" data-view="patient">Novo Paciente</button></div>`;
}

function anamnesisQuestionGuide() {
  const form = currentClinicalDraft();
  const orderedItems = orderedAnamnesisSections();

  return `<div class="clinical-card anamnesis-guide">
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
// do atendimento, e precisa estar a mao a qualquer momento. Escalas, desde
// 10/09/2026, pelo mesmo motivo.
const APPENDIX_PAGES = new Set(["medicamentos", "escalas", "documentos"]);

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

// O apendice nao e etapa: "Salvar e avancar" nunca leva a ele. Ate 10/09/2026
// levava -- a Historia clinica, ultima etapa da consulta, "avancava" para
// Medicamentos, e a consulta terminava numa pagina sem botao de salvar. Pelo
// fluxo, so o desvio do Tratamento chega ao apendice (medicationDetour).
function nextPageForScope(scope) {
  const pages = pagesForScope(scope);
  const current = currentPageForScope(scope);
  const index = pages.findIndex(([key]) => key === current);
  if (index < 0) return "";
  return pages.slice(index + 1).find(([key]) => !APPENDIX_PAGES.has(key))?.[0] || "";
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
  // Salvar sem avancar, nas duas. A consulta so gravava por "Salvar e avancar",
  // e por isso a ultima etapa e o apendice nao tinham como gravar: a conduta
  // trazida de Medicamentos ficava so no rascunho. Onde nao ha para onde
  // avancar, salvar e a acao principal da pagina.
  return `<div class="actions page-actions">
    ${nextPage ? `<button class="primary" type="button" data-action="save-next-page" data-scope="${scope}">Salvar e avancar</button>` : ""}
    <button class="${nextPage ? "secondary" : "primary"}" type="submit">${recordLabel}</button>
    ${finalizeButton(scope, current)}
  </div>`;
}

// "Finalizar" so na ultima etapa do atendimento, e so enquanto nao finalizado.
// O apendice nao e etapa: dele nao se finaliza.
function finalizeButton(scope, current = {}) {
  const etapas = pagesForScope(scope).filter(([key]) => !APPENDIX_PAGES.has(key));
  const ultima = etapas[etapas.length - 1]?.[0];
  if (current.finalizadoEm || currentPageForScope(scope) !== ultima) return "";
  return `<button class="secondary" type="button" data-action="finalize-record" data-scope="${scope}">Finalizar ${scope === "return" ? "retorno" : "consulta"}</button>`;
}

function bindGlobalEvents() {
  app.querySelectorAll('[data-action="resolve-sync-conflict"]').forEach(button => {
    button.addEventListener("click", () => resolveVisibleConflict(button.dataset.choice));
  });
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
    draftGuard.replaced(); aiOperations.reset(); unsavedWork.limpar();
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

async function resolveVisibleConflict(choice) {
  const conflict = syncConflict;
  const ownerId = authSession?.user?.id;
  if (resolvingConflict || !conflict || conflict.ownerId !== ownerId) return;
  if (haTrabalhoNaoSalvo()) {
    alert("Salve ou descarte o rascunho em edição antes de resolver o conflito.");
    return;
  }
  const collection = { patient: "patients", consultation: "consultations", return: "returns" }[conflict.kind];
  const current = collection ? state[collection].find(row => row.id === conflict.recordId)
    : { theme: state.theme, doctor: state.doctor };
  if (JSON.stringify(current) !== JSON.stringify(conflict.local)) {
    syncError = "O registro foi editado desde a comparação. Recarregando as versões para revisão.";
    syncConflict = null;
    await syncWithAccount();
    render();
    return;
  }
  resolvingConflict = true;
  try {
    // Primeiro arquiva as duas versões no banco. Sem confirmação, a escolha
    // não é aplicada nem a referência da versão anterior é alterada.
    await archiveSyncConflict(conflict, choice, ownerId);
    if (authSession?.user?.id !== ownerId || syncConflict !== conflict) return;
    const stillCurrent = collection ? state[collection].find(row => row.id === conflict.recordId)
      : { theme: state.theme, doctor: state.doctor };
    if (JSON.stringify(stillCurrent) !== JSON.stringify(conflict.local)) {
      syncConflict = null;
      await syncWithAccount();
      return;
    }
    if (choice === "remote") {
      if (collection) state[collection] = state[collection].map(row =>
        row.id === conflict.recordId ? conflict.remote : row);
      else { state.theme = conflict.remote.theme; state.doctor = conflict.remote.doctor; }
      const error = await saveState(state, ownerId);
      if (error) throw new Error(error);
    }
    resolveRecordConflict(conflict, choice, ownerId);
    syncConflict = null;
    syncError = "";
    await syncWithAccount();
    render();
  } catch (error) {
    syncError = error.message;
    render();
  } finally {
    resolvingConflict = false;
  }
}

function bindViewEvents() {
  bindAutoDraft();
  paintAnamnesisAiMarks();
  paintIdentificationAiMarks();
  paintReturnAssessmentAiMarks();
  paintAiBusyState();
  bindAutoExpandingTextareas();
  bindMedicationLookup();
  bindRiskScreen();
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
    showSuggestions(localMedicationSuggestions(term));
  });

  input.addEventListener("focus", () => showSuggestions(localMedicationSuggestions(input.value)));
}

const RISK_SCREEN_LABELS = Object.freeze({
  ideacao_suicida: "Ideação suicida",
  plano_suicida: "Plano suicida",
  intencao_suicida: "Intenção suicida",
  acesso_meios_letais: "Acesso a meios letais",
  tentativa_previa: "Tentativa prévia de suicídio",
  autoagressao: "Autoagressão/automutilação",
  desesperanca: "Desesperança"
});

// Segunda opiniao independente da extracao por RAG/GPT que ja preenche
// riscoSuicidioIndicadores (ANAMNESIS_AI_FIELDS.suicide_risk, aplicada em
// applyAnamnesisAiResult). Cobre o modo manual, onde aquela extracao nunca
// roda, e o caso em que ela classificou errado um indicador de risco.
function bindRiskScreen() {
  const form = app.querySelector("#consult-form");
  if (!form || !app.querySelector("#risk-screen-banner")) return;
  const readCombinedText = () => {
    const qphda = (form.querySelector("[name='qphda']")?.value || "").trim();
    if (qphda) return qphda;
    const queixa = form.querySelector("[name='queixa']")?.value || "";
    const hda = form.querySelector("[name='hdaManual']")?.value || "";
    return [queixa && `QP: ${queixa}`, hda && `HDA: ${hda}`].filter(Boolean).join("\n\n");
  };
  ["qphda", "queixa", "hdaManual"].forEach(name => {
    form.querySelector(`[name='${name}']`)?.addEventListener("input", () => scheduleRiskScreen(readCombinedText()));
  });
}

function scheduleRiskScreen(text) {
  clearTimeout(riskScreenTimer);
  const trimmed = text.trim();
  const banner = app.querySelector("#risk-screen-banner");
  if (!banner) return;
  if (trimmed.length < 20) {
    banner.innerHTML = "";
    return;
  }
  const sequence = ++riskScreenSequence;
  riskScreenTimer = setTimeout(async () => {
    const loadingBanner = app.querySelector("#risk-screen-banner");
    if (loadingBanner) loadingBanner.innerHTML = riskScreenStatusMarkup("Analisando indícios de risco no texto ditado...");
    try {
      const data = await requestRiskScreen(trimmed);
      if (sequence !== riskScreenSequence) return;
      const target = app.querySelector("#risk-screen-banner");
      if (target) target.innerHTML = riskScreenMarkup(data);
    } catch (error) {
      if (sequence !== riskScreenSequence) return;
      const target = app.querySelector("#risk-screen-banner");
      if (target) target.innerHTML = riskScreenStatusMarkup(`Triagem de risco indisponível: ${error.message}`, true);
    }
  }, 2000);
}

function riskScreenStatusMarkup(message, isError = false) {
  return `<div class="risk-screen-status ${isError ? "risk-screen-error" : ""}">${escapeHtml(message)}</div>`;
}

function riskScreenMarkup(data) {
  const threshold = typeof data.threshold === "number" ? data.threshold : 0.6;
  const indicators = Array.isArray(data.indicators) ? data.indicators : [];
  const flagged = indicators.filter(item => item.probability >= threshold);
  if (!flagged.length) {
    return `<div class="risk-screen-status risk-screen-clear">Triagem automática: nenhum indício relevante de risco identificado no texto até agora. Continue a avaliação clínica normalmente.</div>`;
  }
  return `
    <div class="risk-screen-alert" role="alert">
      <strong>Triagem automática sinalizou possível indício de risco no texto — revisar antes de salvar:</strong>
      <ul>
        ${flagged.map(item => `<li>${escapeHtml(RISK_SCREEN_LABELS[item.key] || item.key)} (${Math.round(item.probability * 100)}%)</li>`).join("")}
      </ul>
      <small>Sinalização automática por IA, não é diagnóstico nem substitui avaliação clínica. Confirme os itens correspondentes no bloco "Risco de suicídio e desesperança" da anamnese.</small>
    </div>
  `;
}

async function selectMedicationLookup(name) {
  const scope = view === "return" ? "return" : "consultation";
  const target = scope === "return" ? draft.return : draft.consultation;
  const loading = {
    medicationGeneric: name,
    medicationTips: "",
    // So a troca de farmaco: nao ha chamada nenhuma acontecendo aqui que este
    // status devesse descrever. O que carrega de verdade e o capitulo do
    // livro, embaixo, com o proprio status dele (medicationChapterStatus).
    medicationOnlineStatus: ""
  };
  if (scope === "return") draft.return = { ...(target || {}), ...loading };
  else draft.consultation = { ...(target || {}), ...loading };
  render();

  // Trocou de farmaco: o tip e o capitulo do anterior saem junto, pelo mesmo
  // motivo do clearMedicationLookup — o capitulo da duloxetina na tela enquanto
  // ele pesquisa outro farmaco e pior do que tela vazia.
  const information = { medicationGeneric: name, medicationTips: "", medicationChapter: null };
  if (scope === "return") draft.return = { ...(draft.return || {}), ...information };
  else draft.consultation = { ...(draft.consultation || {}), ...information };
  render();
  // O capitulo e local: nao custa chamada de API nem espera perceptivel, entao
  // abre sozinho. Farmaco sem capitulo no livro cai no aviso de sempre, e a
  // ficha da IA passa a ser a contingencia — que e o lugar dela.
  await loadBookChapter(scope, name);
}

function clearMedicationLookup() {
  const scope = view === "return" ? "return" : "consultation";
  const cleared = {
    medicationGeneric: "", medicationNameText: "", medicationBrands: "", medicationClass: "",
    medicationPresentation: "", medicationSafety: "", medicationBestUse: "", medicationMechanism: "",
    medicationClassMechanism: "", medicationInitialDose: "", medicationTitration: "", medicationTargetDose: "",
    medicationCeiling: "", medicationAvoidWith: "", medicationSideEffects: "", medicationMonitoringShort: "",
    medicationMonitoring: "", medicationSpecialPopulations: "", medicationOnlineStatus: "",
    medicationActiveIngredient: "", medicationPresentationHighlight: "", medicationRecommendedDose: "",
    medicationMainEffects: "",
    // Tip e do farmaco, nao da tela: sem limpar, o BIPP TIPS da duloxetina
    // ficaria na caixa enquanto o medico pesquisa outro medicamento.
    medicationTips: "",
    medicationChapter: null, medicationChapterStatus: ""
  };
  if (scope === "return") draft.return = { ...(draft.return || {}), ...cleared };
  else draft.consultation = { ...(draft.consultation || {}), ...cleared };
  render();
}

// Qual ramo do rascunho este formulario alimenta. O mesmo mapa que
// updateDraftFromForm usa, e por isso o mesmo que saveClinicalRecord limpa.
function draftScopeOfForm(form) {
  return { "consult-form": "consultation", "return-form": "return", "patient-form": "patient" }[form?.id] || "";
}

function bindAutoDraft() {
  const forms = app.querySelectorAll("form");
  forms.forEach(form => {
    form.addEventListener("input", event => {
      clinicalDraftRevision += 1;
      unsavedWork.tocou(draftScopeOfForm(form));
      updateDraftFromForm(form);
      // Texto do documento mexido a mao: a partir daqui, mudar dias ou destino
      // nao o remonta por cima do que o medico escreveu.
      if (event.target?.name === "documento_texto") {
        const chave = form.id === "return-form" ? "return" : "consultation";
        draft[chave] = { ...(draft[chave] || {}), documento_editado: "1" };
      }
      // A historia clinica passa a ser do medico quando ele escreve NELA. Antes
      // bastava a pagina estar aberta: qualquer tecla em qualquer campo marcava
      // o texto do modelo como dele, e ele nunca mais era remontado.
      if (event.target?.name === "evolution") {
        const chave = form.id === "return-form" ? "return" : "consultation";
        draft[chave] = { ...(draft[chave] || {}), evolutionAutoGenerated: false, evolucaoOrigem: "medico" };
      }
      if (form.id === "consult-form" && consultationPage === "anamnese" && ["queixa", "hdaManual", "medicos", "qphda", "tratamentoFarmacoPrevioRelato"].includes(event.target?.name)) {
        const target = draft.consultation || defaultConsultation();
        target.anamnesisDoctorTextOverrides = { ...(target.anamnesisDoctorTextOverrides || {}), [event.target.name]: true };
        draft.consultation = target;
      }
      // Editar um campo de identificacao marcado pela IA e a decisao dele por
      // cima da dela: a marca sai no mesmo instante, sem esperar render().
      if (form.id === "patient-form" && draft.patient?.identificationAiMarks?.[event.target?.name]) {
        draft.patient.identificationAiMarks = withoutIdentificationAiMark(draft.patient.identificationAiMarks, event.target.name);
        paintIdentificationAiMarks();
      }
    });
    form.addEventListener("change", event => {
      clinicalDraftRevision += 1;
      unsavedWork.tocou(draftScopeOfForm(form));
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
      // Marcar ou desmarcar escala muda a pagina (abre ou fecha o cartao).
      // Responder um item muda so o resultado daquela escala: redesenha a caixa
      // dela, e nao a pagina, para a rolagem nao sair do item.
      if (event.target?.name === "escalasAplicadas") { render(); return; }
      if (event.target?.dataset?.escala) { refreshScaleResult(event.target.dataset.escala); return; }
      // Documentos: trocar o tipo recomeca o texto; mudar um campo o remonta,
      // se o medico ainda nao o editou a mao.
      if (event.target?.name === "documento_tipo") { refreshDocumentText(currentScope(), true); return; }
      if (/^(documento_|medico_)/.test(event.target?.name || "") && event.target.name !== "documento_texto") {
        refreshDocumentText(currentScope());
        return;
      }
      recordAnamnesisDoctorOverride(event.target);
      recordReturnAssessmentDoctorOverride(event.target);
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
      // Marcar a conduta do retorno faz o texto da evolucao aparecer logo
      // abaixo, ja escrito com o que acabou de ser assinalado. Sem este
      // desenho, a tela so mudaria na proxima acao que redesenhasse a pagina.
      // "ajusteAcrescimo" entra por `change`, e nao por `input`: redesenhar a
      // cada tecla tiraria o cursor de dentro do campo. Ao sair dele, o texto
      // aparece.
      if (["ajusteHipotesesSelecionada", "ajusteMedicacaoSelecionada", "ajusteCondutaSelecionada", "ajusteAcrescimo"].includes(event.target?.name)) {
        render();
        return;
      }
      // A resposta da gestacao abre o campo seguinte -- data da DUM, ou o aviso
      // do beta-hCG. Sem redesenhar, a pergunta que ela levanta nao aparece.
      if (event.target?.name === "gravidez") { render(); return; }
      // Responder se havia acompanhante abre (ou fecha) o vinculo, o nome e
      // quem informou -- e apaga o aviso de multiplas vozes, se ele estava la.
      if (event.target?.name === "acompanhantePresente") { render(); return; }
      // Trocar a fonte da resposta no Tratamento muda a propria barra de acoes:
      // Guidelines nao tem Refinar. Sem redesenhar, o botao ficaria na tela
      // depois de escolhido o modo que nao o tem -- e a tela ofereceria uma
      // segunda passada que aquele modo nao faz.
      if (event.target?.name === "treatmentAiMode") { render(); return; }
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
  // As caixas que esta acao decidiu. A do clique sempre; as demais quando a
  // regra de negacao mexe nelas por tabela -- marcar "Nega sintomas" desmarca
  // o resto, e desmarcado por ele tambem e decisao dele.
  const tocadas = [key(control.value)];
  overrides[key(control.value)] = control.checked;
  const denialOptions = ["Nega sintomas relacionados", "Nega ideacao, plano ou intencao suicida", "Nenhum"];
  if (control.checked && denialOptions.includes(control.value)) {
    allowed.forEach(option => { overrides[key(option)] = option === control.value; tocadas.push(key(option)); });
  } else if (control.checked) {
    allowed.filter(option => denialOptions.includes(option)).forEach(option => { overrides[key(option)] = false; tocadas.push(key(option)); });
  }
  target.anamnesisDoctorOverrides = overrides;
  target.anamnesisAiMarks = withoutAiMarks(target.anamnesisAiMarks, tocadas);
  draft.consultation = target;
  // Sem esperar por render(): marcar uma caixa da anamnese nao redesenha a
  // pagina, e a marca tem de sair no mesmo instante em que ele clica.
  paintAnamnesisAiMarks();
}

function bindPatientForm() {
  const form = app.querySelector("#patient-form");
  if (!form) return;
  bindEnterAvanca(form);
  form.querySelector("[name='cep']")?.addEventListener("blur", async event => {
    try {
      const address = await fetchCep(event.target.value);
      Object.assign(draft.patient || {}, formToObject(form), address);
      render();
    } catch {
      // CEP incompleto/invalido: silencioso, sem caixa de status para avisar.
    }
  });
  bindPhoneInput(form.querySelector("[name='telefone']"));
  form.addEventListener("submit", async event => {
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
    if (!await persist()) return;
    unsavedWork.salvo("patient");
    view = pendingViewAfterPatient || "consultation";
    draftGuard.replaced(); aiOperations.reset(); unsavedWork.limpar();
    if (view === "consultation") draft.consultation = defaultConsultation();
    if (view === "return") draft.return = defaultReturn();
    pendingViewAfterPatient = "";
    render();
  });
}

// Mascara sem re-render: o cursor fica onde estava, contado em digitos, e o
// atalho do WhatsApp aparece so quando o numero fica completo.
function bindPhoneInput(input) {
  if (!input) return;
  const link = input.parentElement?.querySelector(".whatsapp-link");
  const syncLink = () => {
    const href = whatsappLink(input.value);
    if (!link) return;
    link.hidden = !href;
    link.href = href || "#";
  };
  input.addEventListener("input", () => {
    const caret = input.selectionStart ?? input.value.length;
    const digitsBeforeCaret = input.value.slice(0, caret).replace(/\D/g, "").length;
    const formatted = formatPhone(input.value);
    if (formatted !== input.value) {
      input.value = formatted;
      let position = 0;
      for (let seen = 0; position < formatted.length && seen < digitsBeforeCaret; position++) {
        if (/\d/.test(formatted[position])) seen++;
      }
      input.setSelectionRange(position, position);
    }
    syncLink();
  });
}

// O proximo campo na ordem da tela. Botoes ficam fora de proposito: Enter na QP
// deve cair na HDA, nunca num botao que uma tecla a mais dispararia.
function focarProximoCampo(form, atual) {
  const campos = Array.from(form.querySelectorAll("input, select, textarea")).filter(campo =>
    !campo.disabled && campo.type !== "hidden" && campo.offsetParent !== null);
  const proximo = campos[campos.indexOf(atual) + 1];
  if (proximo) proximo.focus();
}

// Enter ANDA, Shift+Enter quebra a linha -- em TODO campo de texto, inclusive
// as caixas longas. A quebra automatica na margem ja cuida do paragrafo; quem
// aperta Enter num formulario esta dizendo "terminei aqui", nao "quero uma
// linha nova". Vale para os tres formularios (consulta, retorno, paciente)
// para a tecla nao significar uma coisa numa tela e outra na seguinte.
//
// O preventDefault tambem guarda o que ja guardava: com o botao de salvar em
// toda pagina, Enter num campo de uma linha submeteria o formulario e gravaria
// a consulta no meio da digitacao. Salvar e clique.
function bindEnterAvanca(form) {
  form.addEventListener("keydown", event => {
    const campo = event.target;
    if (event.key !== "Enter" || event.shiftKey) return;
    const tag = campo?.tagName;
    const ehCampo = tag === "TEXTAREA"
      || (tag === "INPUT" && campo.type !== "submit" && campo.type !== "button");
    if (!ehCampo) return;
    event.preventDefault();
    focarProximoCampo(form, campo);
  });
}

function bindConsultForm() {
  const form = app.querySelector("#consult-form");
  if (!form) return;
  bindEnterAvanca(form);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (voiceRecording.isBusy()) {
      alert("Encerre a gravação e aguarde a transcrição antes de salvar.");
      return;
    }
    updateDraftFromForm(form);
    if (!await saveClinicalRecord("consultation")) return;
    render();
  });
}

function bindReturnForm() {
  const form = app.querySelector("#return-form");
  if (!form) return;
  bindEnterAvanca(form);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    updateDraftFromForm(form);
    if (!await saveClinicalRecord("return")) return;
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
      if (action === "skip-to-diagnosis") await skipToDiagnosis(element);
      if (action === "generate-diagnosis") await generateDiagnosisFromClinicalData(element);
      if (action === "refine-diagnosis") await generateDiagnosisFromClinicalData(element, "diagnosis_review");
      if (action === "generate-treatment") await generateTreatmentFromClinicalData(element);
      if (action === "refine-treatment") await generateTreatmentFromClinicalData(element, "treatment_review");
      if (action === "generate-return-plan") await generateReturnPlanFromClinicalData(element);
      if (action === "generate-evolution") await generateEvolutionFromClinicalData(element);
      if (action === "generate-medication-ai") await generateMedicationFromClinicalData(element);
      if (action === "clear-medication-lookup") clearMedicationLookup();
      if (action === "set-anamnesis-mode") setAnamnesisInputMode(element.dataset.mode);
      if (action === "set-appendix-search") setAppendixSearchMode(element.dataset.mode);
      if (action === "clear-appendix-symptom") clearAppendixSymptom();
      if (action === "clear-scale") clearScaleAnswers(element.dataset.escala);
      if (action === "apply-monitoring-exams") applyMonitoringExams(element);
      if (action === "mental-exam-normal") markMentalExamNormal(element);
      if (action === "finalize-record") await finalizeCurrentRecord(element);
      if (action === "generate-document") generateDocument(element);
      if (action === "export-document") exportDocument(element);
      if (action === "reexport-document") reexportDocument(element.dataset.indice);
      if (action === "save-doctor") saveDoctorData(element);
      if (action === "generate-appendix-symptom") await generateAppendixSymptomConduct(element);
      if (action === "adopt-appendix-conduct") adoptAppendixConduct(element.dataset.conduta || "");
      if (action === "clear-patient") { draft.patient = {}; render(); }
      if (action === "delete-patient") deletePatient();
      if (action === "restore-patient") restoreArchivedPatient(element.dataset.id);
      if (action === "purge-patient") purgeArchivedPatient(element.dataset.id);
      if (action === "voice") voiceRecording.startVoice(element.dataset.target, element);
      if (action === "edit-current-patient") { view = "patient"; draft.patient = structuredClone(getPatient()); render(); }
      if (action === "edit-entry") editEntry(element.dataset.id, element.dataset.type);
      if (action === "new-consultation") { draftGuard.replaced(); aiOperations.reset(); unsavedWork.limpar(); draft.consultation = defaultConsultation(); consultationPage = "anamnese"; consultationUnlocked = 1; render(); }
      if (action === "new-return") startNewReturn();
      if (action === "back-to-record") { view = "record"; render(); }
      if (action === "pdf-entry") pdfEntry(element.dataset.id, element.dataset.type);
      if (action === "pdf-summary") pdfClinicalSummary();
      if (action === "delete-entry") deleteEntry(element.dataset.id, element.dataset.type);
      if (action === "exit-now") await endSession();
      if (action === "import-unassigned") await importUnassignedRecords();
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

// Os registros anteriores deste paciente, para a escala mostrar a aplicacao
// anterior ao lado da de hoje. Na consulta e no retorno, o mesmo criterio: o
// registro mais recente ANTES deste, e nao o mais recente de todos.
function scaleHistory(current = {}) {
  return previousScaleEntries(entriesForPatient(selectedPatientId), current);
}

function refreshScaleResult(id) {
  const scale = scaleById(id);
  const caixa = app.querySelector(`#resultado-${id}`);
  if (!scale || !caixa) return;
  const form = currentClinicalDraft();
  caixa.outerHTML = scaleResultView(scale, form, scaleHistory(form));
}

// "Marcar estes exames", no cartao de Exames do Tratamento. Soma aos exames ja
// marcados, nunca tira; o que nao tem opcao propria (neutrofilos, troponina)
// vai para o "Outro", que e marcado junto para o campo aparecer na tela.
function applyMonitoringExams(element) {
  const formulario = element.closest("form");
  if (formulario) updateDraftFromForm(formulario);
  const alvo = { ...(draft.consultation || {}) };
  const blocos = monitoringFor(alvo.tratamentoMedicamentosSelecionados, { podeEngravidar: mayBePregnant(getPatient() || {}) });
  const { opcoes, extras } = monitoringExamSelection(blocos);
  const marcados = new Set(arrayValue(alvo.examesSolicitados));
  opcoes.forEach(opcao => marcados.add(opcao));
  const outros = String(alvo.examesSolicitadosOutro || "").split(/\s*,\s*/).filter(Boolean);
  const novos = extras.filter(extra => !outros.some(outro => normalizeText(outro) === normalizeText(extra)));
  if (novos.length || outros.length) marcados.add("Outro");
  alvo.examesSolicitados = [...marcados];
  alvo.examesSolicitadosOutro = [...outros, ...novos].join(", ");
  alvo.examesLaboratoriais = requestedExamsText(alvo);
  draft.consultation = alvo;
  render();
}

// Radio nao se desmarca clicando de novo. Sem isto, a pergunta condicional
// respondida por engano (a 5 da ASQ, o plano da C-SSRS) ficaria no registro.
// "Sem alteracao" nos dominios do exame psiquico que estao em branco. O que ja
// foi marcado fica como esta: o botao nunca troca achado por normalidade.
function markMentalExamNormal(element) {
  const formulario = element.closest("form");
  if (formulario) updateDraftFromForm(formulario);
  const chave = currentScope();
  draft[chave] = { ...(draft[chave] || {}), ...mentalExamNormalFill(draft[chave] || {}) };
  render();
}

// Salva e finaliza. Finalizado continua editavel; o que muda depois na
// historia clinica, no diagnostico ou no tratamento guarda a versao anterior
// (withVersionHistory).
async function finalizeCurrentRecord(element) {
  const scope = element.dataset.scope === "return" ? "return" : "consultation";
  const tipo = scope === "return" ? "o retorno" : "a consulta";
  if (!confirm(`Finalizar ${tipo}? Depois de finalizado, o que for alterado na história clínica, no diagnóstico ou no tratamento fica registrado, e a versão anterior é guardada.`)) return;
  const formulario = element.closest("form");
  if (formulario) updateDraftFromForm(formulario);
  const salvo = await saveClinicalRecord(scope);
  if (!salvo) return;
  const agora = new Date().toISOString();
  upsert(scope === "return" ? "returns" : "consultations", { ...salvo, finalizadoEm: agora, updatedAt: agora });
  draft[scope] = { ...(draft[scope] || {}), finalizadoEm: agora, updatedAt: agora };
  if (!await persist()) return;
  render();
}

function clearScaleAnswers(id) {
  const scale = scaleById(id);
  if (!scale) return;
  const scope = view === "return" ? "return" : "consultation";
  const alvo = { ...(draft[scope] || {}) };
  scale.itens.forEach((_, index) => { delete alvo[scaleFieldName(scale, index)]; });
  draft[scope] = alvo;
  render();
}

// Documentos (views/documents.js). O texto e montado do atendimento aberto; no
// retorno, o diagnostico vem da consulta a que ele responde.
function documentDoctor(form = {}) {
  return { ...(state.doctor || {}), ...doctorFromForm(form) };
}

function documentTextFor(scope, form = {}) {
  const isReturn = scope === "return";
  return buildDocumentText(arrayValue(form.documento_tipo)[0], {
    form,
    patient: getPatient() || {},
    doctor: documentDoctor(form),
    history: previousScaleEntries(entriesForPatient(selectedPatientId), form),
    previous: isReturn ? previousEntryForReturn(form, selectedPatientId) : null,
    isReturn
  });
}

function documentViewOptions(scope, form = {}) {
  return { doctor: state.doctor || {}, textoGerado: documentTextFor(scope, form), isReturn: scope === "return" };
}

// Texto vazio no rascunho = a tela mostra o montado. Mudar um campo do
// documento remonta o texto, a menos que o medico ja o tenha editado a mao --
// ai so remonta pelo botao. Trocar o tipo sempre recomeca: o texto de um
// atestado nao serve de relatorio.
function refreshDocumentText(scope, trocouTipo = false) {
  const alvo = { ...(draft[scope] || {}) };
  if (trocouTipo || !alvo.documento_editado) {
    alvo.documento_texto = "";
    alvo.documento_editado = "";
  }
  alvo.documento_status = "";
  draft[scope] = alvo;
  render();
}

function currentScope() {
  return view === "return" ? "return" : "consultation";
}

function generateDocument(element) {
  const formulario = element.closest("form");
  if (formulario) updateDraftFromForm(formulario);
  refreshDocumentText(currentScope(), true);
}

// Exportar e emitir: o PDF sai, e o atendimento guarda o que foi entregue --
// tipo, resumo, data e o texto exato, para exportar de novo sem remontar.
function exportDocument(element) {
  const formulario = element.closest("form");
  if (formulario) updateDraftFromForm(formulario);
  const scope = currentScope();
  const alvo = { ...(draft[scope] || {}) };
  const tipo = documentType(arrayValue(alvo.documento_tipo)[0]);
  const texto = String(alvo.documento_texto || "").trim() || documentTextFor(scope, alvo);
  const paciente = getPatient() || {};
  const data = new Date().toLocaleDateString("pt-BR").replaceAll("/", "-");
  exportTextAsPdf(tipo.titulo, texto, `${paciente.nome || "Paciente"} - ${tipo.titulo} - ${data}`, { rodape: "" });
  alvo.documentosEmitidos = [...(Array.isArray(alvo.documentosEmitidos) ? alvo.documentosEmitidos : []), issuedDocument(tipo.id, alvo, texto)];
  alvo.documento_status = scope === "return"
    ? `${tipo.titulo}: PDF gerado. Entra no retorno quando você salvar, no Ajuste de conduta.`
    : `${tipo.titulo}: PDF gerado. Entra na consulta quando você salvar.`;
  draft[scope] = alvo;
  render();
}

function reexportDocument(indice) {
  const item = (draft[currentScope()]?.documentosEmitidos || [])[Number(indice)];
  if (!item) return;
  const paciente = getPatient() || {};
  const data = new Date(item.emitidoEm || Date.now()).toLocaleDateString("pt-BR").replaceAll("/", "-");
  exportTextAsPdf(item.titulo, item.texto, `${paciente.nome || "Paciente"} - ${item.titulo} - ${data}`, { rodape: "" });
}

// Os dados de assinatura sao do medico, nao do atendimento: vao para
// state.doctor, que sincroniza com a conta como o resto do estado.
function saveDoctorData(element) {
  const formulario = element.closest("form");
  if (formulario) updateDraftFromForm(formulario);
  const scope = currentScope();
  state.doctor = { ...(state.doctor || {}), ...doctorFromForm(draft[scope] || {}) };
  persist();
  refreshDocumentText(scope);
  draft[scope] = { ...draft[scope], documento_status: "Dados do médico salvos." };
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
  // A Evolucao do retorno so libera a saida completa. Barra aqui, e nao no
  // `required` do HTML, porque o botao nao submete o formulario e porque a
  // mensagem precisa dizer QUAL linha falta -- num caso com quatro hipoteses e
  // tres farmacos, "preencha os campos" nao ajuda ninguem.
  if (scope === "return" && completedPage === "evolucao-retorno") {
    const faltando = missingReturnAssessment(draft.return || {}, previousEntryForReturn(draft.return || {}, selectedPatientId));
    if (faltando.length) {
      alert(`Falta responder antes de avancar:\n\n- ${faltando.join("\n- ")}`);
      return;
    }
  }
  if (!await saveClinicalRecord(scope)) return;
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

// O caso que ele descreveu quando pediu o acervo de diretrizes: paciente que
// chega com diagnostico fechado, ele escreve a hipotese e vai tratar. Pelo
// fluxo normal isso custava cinco cliques em "Salvar e avancar" sobre paginas
// em branco, so para destravar a aba do Tratamento.
//
// NAO e o atalho livre que existia antes de 2026 e foi removido de proposito. A
// diferenca esta na primeira linha: aqui SALVA antes de destravar. O problema
// das abas livres era chegar a uma pagina com o que estava na tela nao gravado
// -- e continua barrado. O que muda e que ele nao precisa mais fingir que
// percorreu cinco etapas para chegar a sexta.
//
// Destrava tudo, e nao so ate o Tratamento: as paginas puladas continuam
// alcancaveis pelas abas, e ele volta e preenche na ordem que quiser. Trancar o
// que ficou para tras puniria justamente quem usou o atalho.
//
// O que ele perde ao pular a anamnese e a triagem de risco, que le o texto
// dela. A pagina segue ali, e o aviso do cartao diz isso.
async function skipToDiagnosis(element) {
  if (voiceRecording.isBusy()) {
    alert("Encerre a gravação e aguarde a transcrição antes de avançar.");
    return;
  }
  const form = element.closest("form");
  if (form) updateDraftFromForm(form);
  if (!await saveClinicalRecord("consultation")) return;
  unlockAllPages("consultation");
  consultationPage = "diagnostico";
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

async function saveClinicalRecord(scope) {
  if (!selectedPatientId) return null;
  const now = new Date().toISOString();
  if (scope === "consultation") {
    const data = sanitizeConsultationRecord({ ...(draft.consultation || defaultConsultation()), patientId: selectedPatientId, type: "consultation" });
    data.evolution = normalizeEvolutionNarrative(data.evolution);
    if (evolutionNeedsRebuild(data, getPatient() || {})) {
      data.evolution = buildEvolutionNarrative(data, getPatient() || {});
      data.evolutionAutoGenerated = true;
      data.evolucaoOrigem = "local";
    }
    if (!data.id) data.id = uid("consultation");
    data.updatedAt = now;
    data.createdAt = data.createdAt || now;
    const registro = withVersionHistory(findEntry(data.id, "consultation"), data, now);
    upsert("consultations", registro);
    draft.consultation = { ...structuredClone(registro), ...screenOnlyFields(draft.consultation) };
    if (!await persist()) return null;
    unsavedWork.salvo("consultation");
    return registro;
  }
  if (scope === "return") {
    const previous = previousEntryForReturn(draft.return || {}, selectedPatientId);
    const data = sanitizeConsultationRecord({ ...(draft.return || defaultReturn()), patientId: selectedPatientId, type: "return", previousEntryId: draft.return?.previousEntryId || previous?.id || "" });
    data.evolution = normalizeEvolutionNarrative(data.evolution);
    // Decidido antes de herdar o id do retorno ja gravado: e o rascunho que diz
    // se o texto e do modelo ou do medico.
    const refazer = evolutionNeedsRebuild(data, getPatient() || {});
    const linkedReturn = state.returns.find(entry =>
      entry.patientId === selectedPatientId
      && entry.previousEntryId === data.previousEntryId
      && entry.id !== data.id
      && isActive(entry)
    );
    if (linkedReturn) {
      data.id = linkedReturn.id;
      data.createdAt = linkedReturn.createdAt;
    }
    if (refazer) {
      data.evolution = buildEvolutionNarrative(data, getPatient() || {}, previous, true);
      data.evolutionAutoGenerated = true;
      data.evolucaoOrigem = "local";
    }
    if (!data.id) data.id = uid("return");
    data.updatedAt = now;
    data.createdAt = data.createdAt || now;
    const registro = withVersionHistory(findEntry(data.id, "return"), data, now);
    upsert("returns", registro);
    draft.return = { ...structuredClone(registro), ...screenOnlyFields(draft.return) };
    if (!await persist()) return null;
    unsavedWork.salvo("return");
    return registro;
  }
  return null;
}

// Recebe as duas formas em vez de anexar "s": "opcao medicamentosa" no plural
// e "opcoes medicamentosas", nao "opcao medicamentosas".
// Preambulo identico nos cinco geradores: grava o que esta na tela antes de
// gerar — sem isso a IA raciocina sobre o registro anterior — e descobre se o
// alvo e a consulta ou o retorno.
// O rascunho de AGORA. Depois de uma espera longa, o `target` lido antes dela
// esta velho: cada mesclagem cria um objeto novo, e o formulario segue editavel.
function draftTarget(scope) {
  return (scope === "return" ? draft.return : draft.consultation) || {};
}

function withDecisionId(suggestion, scope, kind, id) {
  if (!id) return suggestion;
  return {
    ...suggestion,
    aiDecisionIds: { ...(draftTarget(scope).aiDecisionIds || {}), [kind]: id }
  };
}

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
  const vigente = draftGuard.capture();
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
  const operacao = aiOperations.begin("diagnosis");
  setClinicalAiStatus(scope, revisao ? "Refinando o diagnostico com a fonte especializada..." : "Consultando IA real para diagnostico...");
  render();
  let suggestion;
  try {
    const context = clinicalAiContext(scope);
    const { result, sources, webSources, mode, codeWarnings, decisionId } = await requestClinicalAi(kind, buildClinicalAiPrompt(kind, context.target, context.patient, context.previous, context.isReturn, null, context.history), revisao ? "rag" : context.target?.aiMode, buildRagQuery(kind, context.target), buildWebQuery(kind, context.target), "", ragPatientScopes(context.patient), revisao ? selectedDiagnosisText(context.target || {}).split("\n").filter(Boolean) : []);
    // A procedencia da resposta e a do modo que respondeu: trechos do acervo no
    // RAG, paginas da web na Nuvem. So um dos dois vem preenchido por chamada.
    suggestion = withDecisionId(diagnosisSuggestionFromAi({ result, target: draftTarget(scope), sources: sourcesOfMode(mode, sources, webSources), mode, codeWarnings, revisao }), scope, kind, decisionId);
    if (revisao) suggestion.aiStatus = `${mode === "rag" ? "Refinado pela fonte especializada" : "Refinado pela web, porque o acervo não sustentou"}. ${suggestion.aiStatus}`;
  } catch (error) {
    suggestion = revisao ? diagnosisReviewFailure(error) : diagnosisSuggestionFromLocalCatalogue(draftTarget(scope), error);
  }
  // Uma chamada mais nova desta etapa ja assumiu: esta resposta esta velha e
  // nao grava. Nao libera o botao tampouco -- quem o fechou foi a mais nova.
  if (!operacao.atual()) return;
  operacao.encerrar();
  if (!vigente()) return;
  if (scope === "return") draft.return = { ...(draft.return || {}), ...suggestion };
  else draft.consultation = { ...(draft.consultation || {}), ...suggestion };
  render();
}

async function generateTreatmentFromClinicalData(element, kind = "treatment") {
  const { scope, target } = syncedTarget(element);
  const vigente = draftGuard.capture();
  const diagnosisText = treatmentDiagnosisText(target || {});
  if (!diagnosisText) return alert("Selecione ao menos uma hipotese diagnostica antes de gerar o tratamento.");
  const revisao = kind === "treatment_review";
  if (revisao && !treatmentOptionLines(target?.tratamentoAiMedicamentos).length
      && !treatmentOptionLines(target?.tratamentoAiAbordagens).length) {
    return alert("Gere o tratamento antes de refinar: o refinamento revisa a primeira passada, nao a substitui.");
  }
  const operacao = aiOperations.begin("treatment");
  const aviso = revisao ? "Refinando o tratamento com a fonte especializada..." : "Consultando IA real para tratamento...";
  setClinicalAiStatus(scope, aviso);
  if (scope === "return") draft.return = { ...(draft.return || {}), treatmentStatus: aviso };
  else draft.consultation = { ...(draft.consultation || {}), treatmentStatus: aviso };
  render();
  let suggestion;
  try {
    const context = clinicalAiContext(scope);
    // O refino continua indo ao RAG, e nao existe em Guidelines: o botao nao
    // aparece nesse modo, e a fonte especializada da revisao e o tratado.
    const modoEscolhido = revisao ? "rag" : treatmentAiMode(context.target);
    // A faixa etaria so entra na consulta das diretrizes: la o arquivo da
    // infancia e um documento a parte e precisa ser chamado; no acervo de
    // livros quem faz esse trabalho e o ragPatientScopes, por cima da busca.
    const { result, sources, webSources, mode, decisionId } = await requestClinicalAi(kind, buildClinicalAiPrompt(kind, context.target, context.patient, context.previous, context.isReturn, null, context.history), modoEscolhido, buildRagQuery(kind, context.target, modoEscolhido === "guidelines" ? { paciente: context.patient } : {}), buildWebQuery(kind, context.target), "", ragPatientScopes(context.patient), [], treatmentDiagnosisText(context.target || {}));
    // O rascunho de agora, nao o de antes da espera: o que ele marcou enquanto a
    // IA respondia tem de sobreviver. O seletor de modo fica de fora do que
    // volta -- guarda a ESCOLHA dele --, e por isso nada aqui o reescreve.
    suggestion = withDecisionId(treatmentSuggestionFromAi({ result, target: draftTarget(scope), sources: sourcesOfMode(mode, sources, webSources), mode, revisao }), scope, kind, decisionId);
  } catch (error) {
    // Tres modos, tres nomes. A falha precisa dizer QUE fonte falhou: em
    // Guidelines a recusa por falta de cobertura e resposta legitima -- as
    // diretrizes nao cobrem este caso --, e chama-la de "RAG indisponivel"
    // mandaria procurar defeito onde nao ha.
    const rotulo = { rag: "RAG", guidelines: "Diretrizes", current: "IA" }[treatmentAiMode(target || {})];
    const recado = statusFailure(`${rotulo} sem resposta`, error.message);
    suggestion = { ragSourcesTratamento: [], treatmentStatus: recado, aiStatus: recado };
  }
  // Uma chamada mais nova desta etapa ja assumiu: esta resposta esta velha e
  // nao grava. Nao libera o botao tampouco -- quem o fechou foi a mais nova.
  if (!operacao.atual()) return;
  operacao.encerrar();
  if (!vigente()) return;
  if (scope === "return") draft.return = { ...(draft.return || {}), ...suggestion };
  else draft.consultation = { ...(draft.consultation || {}), ...suggestion };
  render();
}


// O Ajuste de conduta do retorno. So roda no retorno, e so depois da Evolucao:
// o que a IA conclui aqui e conclusao SOBRE o que o medico marcou la, e a
// pagina anterior nao deixa avancar incompleta justamente para que esta nao
// receba buraco.
async function generateReturnPlanFromClinicalData(element) {
  const { scope, target } = syncedTarget(element);
  const faltando = missingReturnAssessment(target || {}, previousEntryForReturn(target || {}, selectedPatientId));
  if (faltando.length) {
    return alert(`Complete a Evolucao antes de gerar o ajuste. Falta:\n\n- ${faltando.join("\n- ")}`);
  }
  const vigente = draftGuard.capture();
  const operacao = aiOperations.begin("return-plan");
  const gravar = dados => {
    if (!vigente() || !operacao.atual()) return;
    if (scope === "return") draft.return = { ...(draft.return || {}), ...dados };
    else draft.consultation = { ...(draft.consultation || {}), ...dados };
  };
  gravar({ returnPlanStatus: "Consultando a literatura de conduta..." });
  render();
  try {
    const context = clinicalAiContext(scope);
    const modoEscolhido = context.target?.returnPlanAiMode || "rag";
    const { result, sources, webSources, mode, decisionId } = await requestClinicalAi(
      "return_plan",
      buildClinicalAiPrompt("return_plan", context.target, context.patient, context.previous, context.isReturn, null, context.history),
      modoEscolhido,
      buildRagQuery("return_plan", context.target, modoEscolhido === "guidelines" ? { paciente: context.patient } : {}),
      buildWebQuery("return_plan", context.target), "", ragPatientScopes(context.patient),
      [], treatmentDiagnosisText(context.target || {}));
    // O rascunho de agora, nao o de antes da espera: o que ele marcou enquanto a
    // IA respondia tem de sobreviver.
    gravar(withDecisionId(returnPlanSuggestionFromAi({ result, target: draftTarget(scope), sources: sourcesOfMode(mode, sources, webSources), mode }), scope, "return_plan", decisionId));
  } catch (error) {
    gravar({
      ragSourcesAjuste: [],
      returnPlanStatus: statusFailure(`${{ rag: "RAG", guidelines: "Diretrizes", current: "IA" }[target?.returnPlanAiMode || "rag"] || "IA"} sem resposta`, error.message)
    });
  }
  // Uma chamada mais nova desta etapa ja assumiu: esta resposta esta velha e
  // nao grava. Nao libera o botao tampouco -- quem o fechou foi a mais nova.
  if (!operacao.atual()) return;
  operacao.encerrar();
  if (!vigente()) return;
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
  const vigente = draftGuard.capture();
  const operacao = aiOperations.begin("appendix-symptom");
  const gravar = dados => {
    if (!vigente() || !operacao.atual()) return;
    if (scope === "return") draft.return = { ...(draft.return || {}), ...dados };
    else draft.consultation = { ...(draft.consultation || {}), ...dados };
  };
  gravar({ appendixSymptomStatus: "Consultando a literatura de manejo sintomatico..." });
  render();
  try {
    const context = clinicalAiContext(scope);
    const sombra = { ...(context.target || {}), sintomasResiduais: [sintoma], sintomasResiduaisOutro: "" };
    const { result, sources, webSources, mode, decisionId } = await requestClinicalAi(
      "symptomatic",
      buildClinicalAiPrompt("symptomatic", sombra, context.patient, context.previous, context.isReturn, null, context.history),
      context.target?.symptomaticAiMode || "rag",
      buildRagQuery("symptomatic", sombra), buildWebQuery("symptomatic", sombra), "", ragPatientScopes(context.patient));
    const linhas = targetSymptomConductLines(result);
    gravar(withDecisionId({
      appendixSymptomConducts: linhas.join("\n"),
      ragSourcesSintomatico: sourcesOfMode(mode, sources, webSources),
      appendixSymptomStatus: linhas.length
        ? `${countLabel(linhas.length, "linha")} de manejo. Leve para o Tratamento o que voce adotar — o resto fica so nesta consulta.`
        : "Nenhuma conduta encontrada para este sintoma."
    }, scope, "symptomatic", decisionId));
  } catch (error) {
    gravar({ ragSourcesSintomatico: [], appendixSymptomStatus: statusFailure("Literatura de manejo sintomático indisponível", error.message) });
  }
  // Uma chamada mais nova desta etapa ja assumiu: esta resposta esta velha e
  // nao grava. Nao libera o botao tampouco -- quem o fechou foi a mais nova.
  if (!operacao.atual()) return;
  operacao.encerrar();
  if (!vigente()) return;
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
  // No retorno, que nao tem Tratamento, a conduta vai para o Ajuste de conduta,
  // em "Acrescentar". Nao para as caixas da IA: um novo "Gerar" reescreve
  // aquela lista, e a linha adotada sumiria junto. "Acrescentar" e o campo
  // dele, que a IA nao toca, e entra no prontuario como o assinalado.
  if (scope === "return") {
    const atual = String(target.ajusteAcrescimo || "").trim();
    const jaEsta = atual.split("\n").some(item => normalizeText(item) === normalizeText(linha));
    draft.return = {
      ...(draft.return || {}),
      ajusteAcrescimo: jaEsta ? atual : [atual, linha].filter(Boolean).join("\n"),
      appendixSymptomStatus: `"${linha}" foi para o Ajuste de conduta, em Acrescentar.`
    };
    render();
    return;
  }
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
  const { scope } = syncedTarget(element);
  const vigente = draftGuard.capture();
  const operacao = aiOperations.begin("evolution");
  setClinicalAiStatus(scope, "Consultando IA real para evolução clínica...");
  render();
  let suggestion;
  try {
    const context = clinicalAiContext(scope);
    const { result, sources, webSources, mode, decisionId } = await requestClinicalAi(
      "evolution",
      buildClinicalAiPrompt("evolution", context.target, context.patient, context.previous, context.isReturn),
      context.target?.evolutionAiMode || "rag",
      buildRagQuery("evolution", context.target),
      buildWebQuery("evolution", context.target));
    const text = normalizeEvolutionNarrative(result.markdown);
    suggestion = withDecisionId({
      evolution: text,
      // Texto da IA que ele revisa: nao pode ser trocado pelo modelo local ao
      // salvar -- ficaria a procedencia do RAG ao lado de um texto que nao
      // saiu dela.
      evolutionAutoGenerated: false,
      evolucaoOrigem: mode === "rag" ? "rag" : "nuvem",
      ragSourcesEvolucao: sourcesOfMode(mode, sources, webSources),
      aiStatus: "Evolução gerada pela IA real. Revise antes de salvar.",
    }, scope, "evolution", decisionId);
  } catch (error) {
    const context = clinicalAiContext(scope);
    suggestion = evolutionSuggestionOnAiFailure({ target: context.target, patient: context.patient, previous: context.previous, isReturn: context.isReturn, error });
  }
  // Uma chamada mais nova desta etapa ja assumiu: esta resposta esta velha e
  // nao grava. Nao libera o botao tampouco -- quem o fechou foi a mais nova.
  if (!operacao.atual()) return;
  operacao.encerrar();
  if (!vigente()) return;
  if (scope === "return") draft.return = { ...(draft.return || {}), ...suggestion };
  else draft.consultation = { ...(draft.consultation || {}), ...suggestion };
  render();
}

// Uma passada so. O "Refinar" da ficha saiu da tela em 02/09/2026, por decisao
// dele -- tres botoes numa consulta que e uma pergunta so --, e o ramo de
// revisao que tinha ficado aqui nao era mais chamado por nada. A etapa
// `medication_review` continua no servidor, com schema, escopo e testes, para o
// dia em que o botao voltar.
async function generateMedicationFromClinicalData(element) {
  const { scope, target } = syncedTarget(element);
  const vigente = draftGuard.capture();
  if (!target?.medicationGeneric?.trim()) return alert("Digite o nome do medicamento antes de consultar a IA.");
  const operacao = aiOperations.begin("medication");
  const aviso = "Consultando IA real para medicamento...";
  setClinicalAiStatus(scope, aviso);
  // O aviso vai para `medicationOnlineStatus`, que e o campo que a pagina
  // Medicamentos desenha. Ate aqui ia para `medicationStatus`, que NENHUM view
  // le: durante a espera o painel ficava com a mensagem de sucesso do farmaco
  // anterior, sem nada dizendo que havia consulta em curso.
  const emEspera = { medicationOnlineStatus: aviso, medicationAcervoAviso: "" };
  if (scope === "return") draft.return = { ...(draft.return || {}), ...emEspera };
  else draft.consultation = { ...(draft.consultation || {}), ...emEspera };
  render();
  let suggestion;
  try {
    const context = clinicalAiContext(scope);
    const { result, sources, webSources, mode, decisionId } = await requestClinicalAi(
      "medication",
      buildClinicalAiPrompt("medication", context.target, context.patient, context.previous, context.isReturn),
      context.target?.pharmaAiMode || "rag",
      buildRagQuery("medication", context.target),
      buildWebQuery("medication", context.target),
      // O acervo e de psiquiatria. Se o trecho recuperado nao cita o farmaco
      // perguntado, ele nao sustenta a ficha -- e o servidor vai a web, que e
      // quem sabe de losartana, metformina e omeprazol.
      context.target?.medicationGeneric || "");
    // O acervo nao tinha o farmaco e o servidor foi a web. A CAIXA DE FONTES ja
    // conta isso -- e o painel muda para "Pesquisado na web" --, mas o seletor
    // nao pode virar junto: ele guarda a ESCOLHA dele, e nao o que aconteceu
    // nesta chamada. Gravando o modo devolvido, uma consulta a losartana deixava
    // o radio em IA Nuvem, e o proximo farmaco -- psiquiatrico, com livro no
    // acervo -- sairia da web sem ninguem ter pedido.
    const escolhido = context.target?.pharmaAiMode || "rag";
    const caiuParaWeb = escolhido === "rag" && mode === "current";
    suggestion = withDecisionId({
      medicationNameText: result.medication || target.medicationGeneric,
      medicationClassMechanism: result.class_and_mechanism || "",
      medicationInitialDose: result.initial_dose || "",
      medicationTitration: result.titration || "",
      medicationTargetDose: result.target_dose || "",
      medicationCeiling: result.ceiling || "",
      medicationAvoidWith: result.avoid_with || "",
      medicationSideEffects: result.side_effects || "",
      medicationMonitoringShort: result.monitoring || "",
      // Os tres campos longos da ficha antiga saem de cena, e sao limpos: ficha
      // telegrafica de um farmaco ao lado da prosa do farmaco anterior seria o
      // pior dos dois mundos.
      medicationPresentation: "",
      medicationSafety: "",
      medicationBestUse: "",
      // Campo proprio, e nao mais uma variante do status: "o acervo nao tinha
      // este farmaco" e um aviso de SUSTENTACAO da ficha, nao uma mensagem de
      // andamento, e a tela precisa desenha-lo diferente. O texto existia desde
      // sempre e nunca chegou a tela -- era escrito em `medicationStatus`, que
      // nenhum view renderiza. Vazio quando o livro sustentou a ficha: aviso
      // que aparece sempre deixa de ser aviso.
      medicationAcervoAviso: caiuParaWeb
        ? "Nenhum livro do acervo traz esse fármaco — a ficha foi pesquisada na web. Confira a bula vigente antes de prescrever."
        : "",
      medicationOnlineStatus: "Resposta de medicamento gerada pela IA real. Revise com bula brasileira e dados do paciente.",
      medicationTips: await fetchMedicationTips(context, target),
      aiStatus: "Resposta gerada pela IA real. Revise antes de salvar.",
      ragSourcesMedicamento: sourcesOfMode(mode, sources, webSources)
    }, scope, "medication", decisionId);
  } catch (error) {
    const wasRag = (target?.pharmaAiMode || "rag") === "rag";
    suggestion = {
      ragSourcesMedicamento: [],
      medicationAcervoAviso: "",
      medicationOnlineStatus: statusFailure(wasRag ? "RAG indisponível" : "IA indisponível", error.message, wasRag ? "Tente novamente ou troque para IA Nuvem." : "Tente novamente em instantes."),
      aiStatus: statusFailure(wasRag ? "RAG indisponível" : "IA indisponível", error.message)
    };
  }
  // Uma chamada mais nova desta etapa ja assumiu: esta resposta esta velha e
  // nao grava. Nao libera o botao tampouco -- quem o fechou foi a mais nova.
  if (!operacao.atual()) return;
  operacao.encerrar();
  if (!vigente()) return;
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
// O capitulo do livro deixou de ser o "Mostrar tudo" e virou a ficha, em
// 31/08/2026, por decisao dele diante da ficha da risperidona: "nao e essa
// enxurrada de informacao que interessa -- isso ai tem na bula".
//
// A inversao era gritante depois de escrita. O programa tem o livro inteiro
// local -- 186 capitulos, verbatim --, com nomes comerciais no Brasil, situacao
// na Rename do SUS, indicacoes de bula da ANVISA e do FDA, off-label,
// contraindicacoes, testes laboratoriais sugeridos, interacoes e os BIPP TIPS.
// Custo zero e resposta imediata. E ele estava escondido atras de um botao,
// enquanto o que abria por padrao era uma chamada de API parafraseando a bula.
//
// Agora o capitulo carrega sozinho ao escolher o farmaco. O botao que fechava
// e reabria saiu em 02/09/2026: o proprio cabecalho do capitulo faz isso, num
// <details>, e a barra de acoes voltou a ter um botao so.
async function loadBookChapter(scope, nome) {
  const aplica = dados => {
    if (scope === "return") draft.return = { ...(draft.return || {}), ...dados };
    else draft.consultation = { ...(draft.consultation || {}), ...dados };
    render();
  };
  const alvo = String(nome || "").trim();
  if (!alvo) return aplica({ medicationChapter: null, medicationChapterStatus: "" });
  aplica({ medicationChapterStatus: "Abrindo o capitulo do livro..." });
  try {
    const resposta = await fetch(`/api/book-chapter?medicamento=${encodeURIComponent(alvo)}`, { headers: await authHeaders() });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) return aplica({ medicationChapter: null, medicationChapterStatus: dados.error || "Nao foi possivel abrir o capitulo." });
    aplica({ medicationChapter: dados, medicationChapterStatus: "" });
  } catch (error) {
    aplica({ medicationChapter: null, medicationChapterStatus: statusFailure("Capítulo indisponível", error.message) });
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
      buildRagQuery("medication_tips", context.target),
      "",
      // Sem o farmaco no trecho nao ha BIPP TIPS dele. Antes, um farmaco fora do
      // acervo devolvia a secao de OUTRO farmaco, com o nome certo no titulo.
      context.target?.medicationGeneric || ""
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
    isReturn: scope === "return",
    // TODOS os atendimentos deste paciente, e nao os do caso. O que funcionou
    // em outro episodio e justamente o que nao esta na cadeia deste -- e e a
    // informacao que mais pesa na escolha do farmaco de hoje. Quem recorta por
    // etapa e o proprio prompt (pharmacologicalHistoryLines).
    history: entriesForPatient(selectedPatientId)
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
  // So transporte -- ver reportedMedicationTreatmentLines em medicationTrial.js:
  // nenhum codigo classifica ou valida o que entra aqui, so carrega para o
  // Tratamento. Decisao do Dr. Regis, 24/09/2026.
  if (!textOverrides.tratamentoFarmacoPrevioRelato) target.tratamentoFarmacoPrevioRelato = result.previous_pharmacological_treatment_report || target.tratamentoFarmacoPrevioRelato || "";
  const overrides = target.anamnesisDoctorOverrides || {};
  const propostoPorCampo = {};
  Object.entries(ANAMNESIS_AI_FIELDS).forEach(([aiKey, [formKey, allowed]]) => {
    const suggested = new Set(canonicalAiSelections(result[aiKey], allowed));
    const denialOptions = ["Nega sintomas relacionados", "Nega ideacao, plano ou intencao suicida", "Nenhum"];
    if ([...suggested].some(option => !denialOptions.includes(option))) {
      denialOptions.forEach(option => suggested.delete(option));
    }
    propostoPorCampo[formKey] = suggested;
    target[formKey] = allowed.filter(option => {
      const overrideKey = `${formKey}:${option}`;
      return Object.hasOwn(overrides, overrideKey) ? overrides[overrideKey] : suggested.has(option);
    });
  });
  // De quem e cada caixa. Calculado AQUI, onde as tres informacoes existem ao
  // mesmo tempo -- o que a IA propos, o que ele ja tinha decidido e o que
  // sobrou marcado. Depois desta linha a tela nao tem como reconstruir isso.
  target.anamnesisAiMarks = anamnesisAiMarks(target, propostoPorCampo, overrides);
  target.anamnesisProcessedAt = new Date().toISOString();
  target.anamnesisProcessedTranscript = target.qphda;
  draft.consultation = target;
}

// Preenche na ficha do paciente so o que a transcricao trouxe e o cadastro
// ainda nao tinha -- nome social, nascimento, ocupacao, religiao, estado
// civil, CEP. Escreve direto em state.patients (via getPatient()), nunca em
// draft.patient: durante uma consulta em andamento draft.patient pode nao
// existir ou estar desatualizado, mas toda tela que abre o cadastro relê de
// getPatient(). Grava na hora (persist()) porque o cadastro tem ciclo de
// salvamento proprio, que a consulta em andamento nao toca -- sem isso, o
// dado extraido se perderia se a sessao terminasse antes de o medico abrir a
// aba Paciente.
async function applyIdentificationAiResult(suggestions = {}) {
  const current = getPatient();
  if (!current || !suggestions || typeof suggestions !== "object") return;
  const patient = { ...current };
  const marks = { ...(patient.identificationAiMarks || {}) };
  let changed = false;
  const setIfBlank = (campo, valor) => {
    if (String(patient[campo] || "").trim()) return false;
    const texto = String(valor || "").trim();
    if (!texto) return false;
    patient[campo] = texto;
    marks[campo] = true;
    changed = true;
    return true;
  };
  setIfBlank("nomeSocial", suggestions.nome_social);
  setIfBlank("ocupacao", suggestions.ocupacao);
  // Data parcial ("marco de 1980") nao preenche: preferimos vazio a chutar dia.
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(suggestions.nascimento || "").trim())) {
    setIfBlank("nascimento", suggestions.nascimento);
  }
  // Sem lista fixa que bata, a proposta e descartada: os selects de religiao e
  // estado civil nao tem "Outro" para guardar um texto fora da lista.
  const religiao = canonicalAiSelections([suggestions.religiao], optionGroups.religiao)[0];
  if (religiao) setIfBlank("religiao", religiao);
  const estadoCivil = canonicalAiSelections([suggestions.estado_civil], optionGroups.estadoCivil)[0];
  if (estadoCivil) setIfBlank("estadoCivil", estadoCivil);
  const cepDigits = String(suggestions.cep || "").replace(/\D/g, "");
  if (cepDigits.length === 8 && setIfBlank("cep", cepDigits)) {
    try {
      const address = await fetchCep(cepDigits);
      setIfBlank("endereco", address.endereco);
      setIfBlank("bairro", address.bairro);
      setIfBlank("cidade", address.cidade);
      setIfBlank("estado", address.estado);
    } catch {
      // CEP incompleto/invalido: falha silenciosa, mesmo comportamento do
      // blur manual em bindPatientForm.
    }
  }
  if (!changed) return;
  patient.identificationAiMarks = marks;
  patient.updatedAt = new Date().toISOString();
  state.patients = state.patients.map(item => item.id === patient.id ? patient : item);
  if (draft.patient?.id === patient.id) draft.patient = structuredClone(patient);
  persist();
}

// A marca de origem e aplicada no DOM depois de desenhar, e nao dentro do HTML
// dos chips. Duas razoes: as caixas da anamnese saem de tres renderizadores
// diferentes (chips, multipleChoiceField, suicideRiskFields) e passar a marca
// por todos eles espalharia o assunto; e ha caminhos que mexem nas caixas SEM
// redesenhar a pagina (o toque do medico, e a extracao que sincroniza direto
// para nao perder a rolagem), que aqui ficam cobertos pela mesma funcao.
// O `disabled` sai do estado, e nao do DOM: render() recria os botoes a cada
// mudanca de status -- inclusive a que anuncia "Consultando..." -- e um
// atributo posto na mao seria apagado no desenho seguinte.
function paintAiBusyState() {
  if (!app) return;
  Object.entries(AI_BUSY_BUTTONS).forEach(([chave, acoes]) => {
    const ocupada = aiOperations.ocupada(chave);
    acoes.forEach(acao => {
      app.querySelectorAll(`[data-action="${acao}"]`).forEach(botao => {
        // Nao mexe no que ja esta fechado por outro motivo: o "Refinar" fecha
        // sozinho enquanto nao ha hipotese assinalada, e reabri-lo aqui
        // ofereceria uma segunda passada sobre nada.
        if (!ocupada && botao.dataset.aiBusy !== "1") return;
        botao.disabled = ocupada;
        if (ocupada) botao.dataset.aiBusy = "1";
        else delete botao.dataset.aiBusy;
      });
    });
  });
}

function paintAnamnesisAiMarks() {
  if (view !== "consultation" || consultationPage !== "anamnese") return;
  const form = app.querySelector("#consult-form");
  if (!form) return;
  const marcas = (draft.consultation || {}).anamnesisAiMarks || {};
  Object.values(ANAMNESIS_AI_FIELDS).forEach(([formKey]) => {
    form.querySelectorAll(`input[type="checkbox"][name="${CSS.escape(formKey)}"]`).forEach(control => {
      const daIa = control.checked && marcas[`${formKey}:${control.value}`] === true;
      const chip = control.closest(".chip");
      if (!chip) return;
      chip.classList.toggle("chip-ai", daIa);
      // O contorno sozinho e decorativo: quem navega por leitor de tela, ou
      // quem nao distingue o tracejado, precisa da frase.
      if (daIa) chip.title = "Marcado pela extração da IA a partir da transcrição. Confira: ao tocar, passa a ser seu.";
      else if (chip.title.startsWith("Marcado pela extração")) chip.removeAttribute("title");
    });
  });
}

// Mesma ideia de paintAnamnesisAiMarks, para a Avaliacao de evolucao do
// retorno. Aqui a marca e por CAMPO (nao por "campo:opcao"): a regra "so
// preenche linha em branco" ja garante que todo campo marcado veio da IA, e um
// campo radio so tem uma opcao marcada por vez, entao nao ha o que
// reconciliar -- a mesma razao pela qual identificationOrigin.js dispensa a
// logica de anamnesisOrigin.js.
function paintReturnAssessmentAiMarks() {
  if (view !== "return" || returnPage !== "evolucao-retorno") return;
  const form = app.querySelector("#return-form");
  if (!form) return;
  const marcas = (draft.return || {}).returnAssessmentAiMarks || {};
  form.querySelectorAll("input[type='radio'], input[type='checkbox']").forEach(control => {
    if (!control.name) return;
    const chip = control.closest(".chip");
    if (!chip) return;
    const daIa = control.checked && Boolean(marcas[control.name]);
    chip.classList.toggle("chip-ai", daIa);
    if (daIa) chip.title = "Preenchido pela extração da IA a partir da transcrição. Confira: ao tocar, passa a ser seu.";
    else if (chip.title.startsWith("Preenchido pela extração")) chip.removeAttribute("title");
  });
}

function recordReturnAssessmentDoctorOverride(control) {
  if (view !== "return" || returnPage !== "evolucao-retorno" || !control?.name) return;
  const target = draft.return || defaultReturn();
  if (!target.returnAssessmentAiMarks?.[control.name]) return;
  target.returnAssessmentAiMarks = withoutIdentificationAiMark(target.returnAssessmentAiMarks, control.name);
  draft.return = target;
  paintReturnAssessmentAiMarks();
}

const IDENTIFICATION_MARK_FIELDS = ["nomeSocial", "nascimento", "ocupacao", "religiao", "estadoCivil", "cep", "endereco", "bairro", "cidade", "estado"];

// Mesma ideia de paintAnamnesisAiMarks, para campo de texto/select em vez de
// caixa de marcar: toggle direto no DOM, sem render(), para nao tirar o
// cursor do campo que o medico esta editando.
function paintIdentificationAiMarks() {
  if (view !== "patient") return;
  const form = app.querySelector("#patient-form");
  if (!form) return;
  const marcas = (draft.patient || {}).identificationAiMarks || {};
  IDENTIFICATION_MARK_FIELDS.forEach(campo => {
    const control = form.querySelector(`[name="${CSS.escape(campo)}"]`);
    const label = control?.closest("label");
    if (!label) return;
    const daIa = Boolean(marcas[campo]);
    label.classList.toggle("field-ai", daIa);
    if (daIa) label.title = "Preenchido pela extração da IA a partir da transcrição. Confira: ao editar, passa a ser seu.";
    else if (label.title.startsWith("Preenchido pela extração")) label.removeAttribute("title");
  });
}

// Ate 23/09/2026 isto restaurava o scroll em ate quatro tentativas escalonadas
// (imediata, requestAnimationFrame, 120ms, 450ms), porque a badge "IA" era
// `::before` dentro do fluxo do chip e engordava a caixa ao marcar varias de
// uma vez, deslocando a linha inteira. A badge passou a `position: absolute`
// (ver `.chip-ai` em theme.css) e parou de mexer no layout -- caixa de marcar
// tem tamanho fixo (22x22, `flex: none`) independente de marcada ou nao.
// Sem deslocamento, uma chamada so basta.
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
  paintAnamnesisAiMarks();
  window.scrollTo(scrollLeft, scrollTop);
}

async function processAnamnesisTranscriptSilently(transcript = "", options = {}) {
  const cleanTranscript = String(transcript || "").trim();
  if (!cleanTranscript || view !== "consultation") return;
  const sequence = ++anamnesisProcessingSequence;
  const baselineRevision = clinicalDraftRevision;
  const vigente = draftGuard.capture();
  const context = clinicalAiContext("consultation");
  const anamnesisTarget = { ...context.target, qphda: cleanTranscript };
  const { result } = await requestClinicalAi("anamnesis", buildClinicalAiPrompt("anamnesis", anamnesisTarget, context.patient), "rag", buildRagQuery("anamnesis", anamnesisTarget), "", "", ragPatientScopes(context.patient));
  if (sequence !== anamnesisProcessingSequence || view !== "consultation" || baselineRevision !== clinicalDraftRevision || !vigente()) return;
  applyAnamnesisAiResult(result, cleanTranscript);
  await applyIdentificationAiResult(result.identification_suggestions);
  if (options.preserveFocus) syncAnamnesisControlsFromDraft();
  else render();
}

// Mesma extracao por voz, agora para a conversa do retorno: transcreve, e a IA
// distribui o que foi dito pelos campos da Avaliacao de evolucao -- espinha
// fixa e blocos dinamicos do atendimento anterior. Espelha
// processAnamnesisTranscriptSilently linha por linha; a diferenca e o kind, o
// escopo do contexto e o aplicador.
async function processReturnTranscriptSilently(transcript = "", options = {}) {
  const cleanTranscript = String(transcript || "").trim();
  if (!cleanTranscript || view !== "return") return;
  const sequence = ++anamnesisProcessingSequence;
  const baselineRevision = clinicalDraftRevision;
  const vigente = draftGuard.capture();
  const context = clinicalAiContext("return");
  const returnTarget = { ...context.target, relatoRetorno: cleanTranscript };
  const { result } = await requestClinicalAi("return_assessment", buildClinicalAiPrompt("return_assessment", returnTarget, context.patient, context.previous, true), "rag", buildRagQuery("return_assessment", returnTarget), "", "", ragPatientScopes(context.patient));
  if (sequence !== anamnesisProcessingSequence || view !== "return" || baselineRevision !== clinicalDraftRevision || !vigente()) return;
  applyReturnAssessmentAiResult(result, context.previous, cleanTranscript);
  render();
}

// Mesmas opcoes de previousCaseRow, em views/exams.js -- os blocos dinamicos
// tem de casar com a MESMA lista de status que a tela usa para desenhar cada
// linha, senao a extracao proporia um valor que o radio nem sabe marcar.
const RETORNO_CRITERIO_STATUS = ["Confirmado", "Descartado", "Ainda não avaliado"];
const RETORNO_FARMACO_STATUS = ["Em uso como prescrito", "Em uso com dose alterada", "Interrompeu", "Nunca iniciou"];

// Os seis blocos dinamicos da Avaliacao de evolucao, na mesma ordem e com os
// mesmos rotulos que previousCaseBlocks (views/exams.js) usa para desenhar as
// linhas -- e o mesmo casamento por rotulo que o prompt recebeu
// (returnAssessmentPromptData, em clinicalAiService.js).
function returnAssessmentDynamicGroups(previous) {
  return [
    ["retornoHipotese", returnHypothesisLabels(previous || {}), "hipoteses", "evolucao", EVOLUCAO_OPCOES],
    ["retornoCriterio", pendingCriteriaFromPrevious(previous || {}), "criterios_pendentes", "status", RETORNO_CRITERIO_STATUS],
    ["retornoFarmaco", arrayValue(previous?.tratamentoMedicamentosSelecionados), "medicamentos", "situacao", RETORNO_FARMACO_STATUS],
    ["retornoAlvo", arrayValue(previous?.sintomasAlvoSelecionados), "sintomas_alvo", "evolucao", EVOLUCAO_OPCOES],
    ["retornoAchado", analysisFindingsForReturn(previous || {}), "achados", "evolucao", EVOLUCAO_OPCOES],
    ["retornoPendencia", pendingRefinementForReturn(previous || {}), "pendencias_refino", "status", RETORNO_CRITERIO_STATUS]
  ];
}

// Preenche na Avaliacao de evolucao so o que a conversa trouxe e a linha ainda
// nao tinha resposta -- espinha fixa (evolucao, adesao, efeitos,
// funcionalidade) e cada linha dos blocos dinamicos, casada pelo rotulo exato.
// Ao contrario da identificacao, aqui o alvo (draft.return) e o mesmo objeto
// vivo da tela: nao ha registro separado para redirecionar.
function applyReturnAssessmentAiResult(result = {}, previous = null, transcript = "") {
  const target = draft.return || defaultReturn();
  target.relatoRetorno = transcript || target.relatoRetorno || "";
  const marks = { ...(target.returnAssessmentAiMarks || {}) };
  let changed = false;
  const setIfBlank = (campo, valorBruto, opcoesPermitidas) => {
    if (arrayValue(target[campo]).filter(Boolean).length) return;
    const casado = canonicalAiSelections([valorBruto], opcoesPermitidas)[0];
    if (!casado) return;
    target[campo] = casado;
    marks[campo] = true;
    changed = true;
  };
  const setChipsIfBlank = (campo, valores, opcoesPermitidas) => {
    if (arrayValue(target[campo]).filter(Boolean).length) return;
    const casados = canonicalAiSelections(valores, opcoesPermitidas);
    if (!casados.length) return;
    target[campo] = casados;
    marks[campo] = true;
    changed = true;
  };
  setIfBlank("evolucaoClinicaRetorno", result.evolucao_clinica, EVOLUCAO_OPCOES);
  setIfBlank("adesao", result.adesao, ["Adequada", "Parcial ou irregular", "Não iniciou ou interrompeu"]);
  setChipsIfBlank("efeitos", result.efeitos, ["Nenhum", "Sedacao ou sonolencia", "Sintomas gastrointestinais", "Alteracao de peso ou metabolica", "Efeitos motores", "Disfuncao sexual", "Outro"]);
  setChipsIfBlank("funcionalidadeEventosRetorno", result.funcionalidade_eventos, ["Nenhum", "Prejuizo funcional", "Conflito, estressor ou luto", "Urgencia ou internacao", "Outro"]);
  returnAssessmentDynamicGroups(previous).forEach(([prefixo, rotulos, chaveResultado, chaveStatus, opcoesPermitidas]) => {
    const rotulosNormalizados = rotulos.map(normalizeText);
    (result[chaveResultado] || []).forEach(item => {
      const index = rotulosNormalizados.indexOf(normalizeText(item?.rotulo || ""));
      if (index === -1) return;
      setIfBlank(`${prefixo}_${index}`, item[chaveStatus], opcoesPermitidas);
    });
  });
  if (!changed) return;
  target.returnAssessmentAiMarks = marks;
  draft.return = target;
}

// Abaixo deste limiar o bloco fica de fora do Refinamento. Baixo de proposito
// -- a instrucao que o GPT seguia era "inclua mesmo que so para descartar",
// entao um bloco so deve ficar fora quando o caso realmente nao toca nele.
const REFINEMENT_SCOPE_THRESHOLD = 0.5;
// Mesmo teto que o schema antigo (maxItems: 12): limite de escopo, nao de
// julgamento -- o Jev julga os 31, so os 12 mais prováveis entram no prompt
// do Refinamento, pelo mesmo motivo de sempre (orcamento de tokens por minuto).
const REFINEMENT_SCOPE_MAX_BLOCKS = 12;

async function pickRefinementScope(form) {
  const state = buildRagQuery("refinement", form);
  const questions = protocolScopeQuestions();
  const { answers } = await requestJevJudge(state, questions);
  const escolhidos = Object.entries(answers || {})
    .filter(([, probabilidade]) => probabilidade >= REFINEMENT_SCOPE_THRESHOLD)
    .sort(([, a], [, b]) => b - a)
    .slice(0, REFINEMENT_SCOPE_MAX_BLOCKS)
    .map(([campo]) => campo);
  if (!escolhidos.length) throw new Error("Nenhum bloco do protocolo atingiu o limiar de relevancia.");
  return escolhidos;
}

function mandatoryRefinementBlocks(patient = {}) {
  const blocos = [];
  if (needsCaregiverHistory(patient)) blocos.push("crianca_adolescente");
  if (lifeStageOf(patient)?.id === "idoso") blocos.push("idoso");
  if (needsReproductiveHistory(patient)) blocos.push("saude_reprodutiva");
  return blocos;
}

async function prepareRefinementFromClinicalData() {
  const vigente = draftGuard.capture();
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
    // Etapa 1 do refinamento: que blocos do protocolo pedir. Ate 22/09/2026
    // isto era outra chamada GPT so para classificar (o teto de tokens por
    // minuto da conta nao deixava mandar o catalogo inteiro numa chamada so).
    // Agora e o Jev, calibrado e paralelo, sem gastar geracao de texto numa
    // decisao que e escolha entre 31 blocos fechados. Falhando, cai para
    // escopo nulo -- o motor manda o catalogo inteiro, que cabe no teto
    // sozinho, so mais lento -- e nao para o motor antigo (que so entra se a
    // geracao do Refinamento em si falhar, la na captura de baixo).
    let scope = null;
    if (protocolLoaded()) {
      scope = await pickRefinementScope(context.target).catch(error => {
        console.warn("Triagem de blocos via Jev indisponivel; refinamento sem filtro de escopo.", error);
        return null;
      });
      // OS BLOCOS DA FAIXA ENTRAM POR FORA DA TRIAGEM.
      //
      // O resto do escopo o Jev acerta bem. Estes tres nao: se a cobertura de
      // crianca, de idoso e de saude reprodutiva dependesse de o julgamento
      // lembrar de pedir o bloco, ele seria bom na maioria das vezes -- e a
      // minoria e justamente onde o dado muda a prescricao. Sao forcados pela
      // identificacao do paciente, que e fato, e nao juizo. Escopo nulo (Jev
      // fora do ar) ja manda o catalogo inteiro, que os inclui -- so entram
      // aqui quando ha uma lista para completar.
      if (scope) {
        const obrigatorios = mandatoryRefinementBlocks(context.patient);
        if (obrigatorios.length) scope = [...new Set([...scope, ...obrigatorios])];
      }
    }
    ({ result } = await requestClinicalAi(
      "refinement",
      buildClinicalAiPrompt("refinement", context.target, context.patient, null, false, scope),
      "rag",
      buildRagQuery("refinement", context.target), "", "", ragPatientScopes(context.patient)
    ));
    result = { ...result, origem: protocolLoaded() ? "protocolo" : "ia" };
  } catch {
    result = { ...localRefinementPlan(context.target), origem: "local" };
  }
  if (!vigente()) return;
  draft.consultation = { ...(draft.consultation || {}), refinementPlan: result, refinementPreparedAt: new Date().toISOString() };
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
    // A marca de texto do medico nao nasce aqui: ver o `input` da evolucao em
    // bindAutoDraft.
    draft[chave] = { ...(draft[chave] || {}), ...data };
  }
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

// O atendimento a que o retorno novo responde. Ate 14/09/2026 era a consulta
// sem retorno, e o terceiro atendimento de um paciente em acompanhamento nao
// tinha onde entrar. Agora e o ULTIMO atendimento, consulta ou retorno: cada
// atendimento continua com um retorno so, e o caso vira cadeia. Nulo quando o
// ultimo ja tem retorno -- so acontece com dois aparelhos sem conexao.
function returnCandidates() {
  const consultations = consultationsForPatient(selectedPatientId);
  const ultimo = consultations.length ? latestEntry(selectedPatientId) : null;
  const jaRespondido = ultimo && state.returns.some(entry =>
    entry.patientId === selectedPatientId && entry.previousEntryId === ultimo.id && isActive(entry));
  return { consultations, pendingEntry: ultimo && !jaRespondido ? ultimo : null };
}

function defaultReturn() {
  const { consultations, pendingEntry } = returnCandidates();
  if (!pendingEntry) {
    const latestSavedReturn = returnsForPatient(selectedPatientId)[0];
    if (latestSavedReturn) return structuredClone(latestSavedReturn);
  }
  const previousEntryId = pendingEntry?.id || consultations[0]?.id || "";
  return { patientId: selectedPatientId, label: "Retorno", type: "return", previousEntryId };
}

function startNewReturn() {
  const { pendingEntry } = returnCandidates();
  if (!pendingEntry) {
    alert("O último atendimento deste paciente já tem retorno. Abra o retorno salvo para continuar.");
    return;
  }
  draft.return = {
    patientId: selectedPatientId,
    label: "Retorno",
    type: "return",
    previousEntryId: pendingEntry.id
  };
  // O rascunho de retorno que estava na tela deixou de existir: nao ha o que
  // avisar na saida sobre um rascunho que nao esta mais em lugar nenhum. So o
  // ramo do retorno -- a consulta aberta continua como estava.
  unsavedWork.salvo("return");
  returnPage = "evolucao-retorno";
  returnUnlocked = 1;
  render();
}

// Arquivado e excluido nao aparecem em tela nenhuma: as listas passam todas por
// aqui.
function getPatient() {
  const patient = state.patients.find(item => item.id === selectedPatientId);
  return isActive(patient) ? patient : undefined;
}

function firstActivePatientId() {
  return (state.patients || []).find(isActive)?.id || "";
}

function patientIndex() {
  let index = PATIENT_INDEX_CACHE.get(state);
  if (!index) {
    index = { consultations: new Map(), returns: new Map() };
    [["consultations", state.consultations], ["returns", state.returns]].forEach(([key, entries]) => {
      (entries || []).forEach(entry => {
        const lista = index[key].get(entry.patientId);
        if (lista) lista.push(entry);
        else index[key].set(entry.patientId, [entry]);
      });
    });
    PATIENT_INDEX_CACHE.set(state, index);
  }
  return index;
}

function entriesForPatient(patientId) {
  return consultationsForPatient(patientId).concat(returnsForPatient(patientId))
    .sort(compareEntriesNewestFirst);
}

function consultationsForPatient(patientId) {
  return (patientIndex().consultations.get(patientId) || [])
    .filter(isActive)
    .sort(compareEntriesNewestFirst);
}

function returnsForPatient(patientId) {
  return (patientIndex().returns.get(patientId) || [])
    .filter(isActive)
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

// A consulta a que o retorno responde, mesmo arquivada. Sem ela -- excluida de
// vez --, nao ha anterior: ate 11/09/2026 caia na consulta mais recente do
// paciente, que podia ser POSTERIOR ao retorno, e a historia dizia "retorna
// apos registro previo de" uma data errada. O palpite so vale para retorno
// sem consulta registrada, que e o rascunho antigo.
//
// Desde 14/09/2026 (leva 4) o anterior pode ser um retorno. Nesse caso volta a
// visao do caso (caseViewForReturn): hipoteses e criterios da consulta que abriu
// o caso, e os medicamentos ja ajustados pelos retornos.
function previousEntryForReturn(form = {}, patientId = selectedPatientId) {
  if (form.previousEntryId) {
    const registros = state.consultations.concat(state.returns).filter(entry => !entry.excluidoEm);
    const propria = registros.find(entry => entry.id === form.previousEntryId);
    return propria ? caseViewForReturn(propria, registros) : null;
  }
  return consultationsForPatient(patientId)[0] || latestEntry(patientId);
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

async function persist() {
  // Gravacao local antes de tudo: se ela falhou, o aviso e mais grave que o de
  // sincronizacao — ali o registro existe no aparelho e so nao subiu; aqui ele
  // nao existe em lugar nenhum.
  const ownerId = authSession?.user?.id || "";
  const erro = await saveLocally(ownerId);
  if (erro) return false;
  if (ownerId && authSession?.user?.id === ownerId) syncWithAccount();
  return true;
}

// A gravacao no aparelho e assincrona desde 14/09/2026 (IndexedDB). O aviso so
// muda quando o resultado muda, para nao redesenhar a tela a cada tecla salva.
function saveLocally(ownerId = authSession?.user?.id || "") {
  return saveState(state, ownerId).then(erroLocal => {
    if ((authSession?.user?.id || "") === ownerId && erroLocal !== storageError) { storageError = erroLocal; render(); }
    return erroLocal;
  });
}

// O aparelho ja gravou; o que falta e avisar quando a copia remota nao
// acompanhou. Antes o erro ia para authError, que so aparece na tela de
// login — na pratica, silencio.
function syncWithAccount() {
  const ownerId = authSession?.user?.id;
  if (!ownerId) return syncChain;
  syncChain = syncChain.then(async () => {
    if (authSession?.user?.id !== ownerId) return;
    try {
      const antes = structuredClone(state);
      const daConta = await syncState(antes, mergeStates, 3, ownerId);
      if (authSession?.user?.id !== ownerId) return;
      if (daConta) absorbAccountState(daConta, antes);
      syncConflict = null;
      if (syncError) { syncError = ""; render(); }
    } catch (error) {
      syncError = error.message;
      syncConflict = error.conflict || null;
      render();
    }
  });
  return syncChain;
}

// O que a conta devolveu pode trazer o que outro aparelho gravou. Junta de
// novo com o estado de agora -- o medico pode ter salvo algo durante a ida a
// rede -- e so redesenha se chegou coisa nova, para nao tirar o cursor do
// campo a cada gravacao.
function absorbAccountState(daConta, snapshot) {
  const antes = JSON.stringify(state);
  state = withoutBookChapters(rebasePendingChanges(snapshot, state, daConta));
  if (JSON.stringify(state) === antes) return;
  saveLocally();
  if (!getPatient()) selectedPatientId = firstActivePatientId();
  render();
}

function pdfEntry(id, type) {
  const entry = findEntry(id, type);
  if (!entry) return;
  const patient = getPatient();
  const title = `${entry.label || "Evolução"}${patient?.nome ? ` — ${patient.nome}` : ""}`;
  const date = new Date(entry.createdAt || Date.now()).toLocaleDateString("pt-BR").replaceAll("/", "-");
  exportTextAsPdf(title, [recordReportText(entry), finalizationNote(entry)].filter(Boolean).join("\n\n"),`${patient?.nome || "Paciente"} - ${entry.label || "Evolução"} - ${date}`);
}

function pdfClinicalSummary() {
  const patient = getPatient() || {};
  const form = view === "return" ? (draft.return || {}) : (draft.consultation || {});
  const retornos = returnsForPatient(patient.id).filter(entry => entry.id !== form.id);
  const groups = clinicalSummaryGroups(form, patient, retornos);
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
  const shouldRebuild = Boolean(entry.evolution) && evolutionNeedsRebuild(entry, patient);
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
  draftGuard.replaced(); aiOperations.reset(); unsavedWork.limpar();
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

// Sem botao na tela hoje; arquiva, como o paciente, se voltar a ter.
function deleteEntry(id, type) {
  if (!confirm("Arquivar este registro? Ele sai do prontuário e continua guardado.")) return;
  state = archiveEntry(state, type === "consultation" ? "consultations" : "returns", id);
  persist();
  render();
}

function deletePatient() {
  const patient = getPatient();
  if (!patient || !confirm(`Arquivar ${patient.nome || "este paciente"}? Ele sai das listas e fica em "Pacientes arquivados", na página Paciente, de onde pode ser restaurado com todos os registros.`)) return;
  state = archivePatient(state, patient.id);
  selectedPatientId = firstActivePatientId();
  draft.patient = {};
  persist();
  view = "dashboard";
  render();
}

function restoreArchivedPatient(id) {
  state = restorePatient(state, id);
  selectedPatientId = id;
  draft.patient = structuredClone(getPatient() || {});
  persist();
  render();
}

// Duas travas, porque e a unica acao do programa que nao tem volta: o aviso da
// lei e o nome do paciente digitado.
function purgeArchivedPatient(id) {
  const patient = state.patients.find(item => item.id === id);
  if (!isArchived(patient)) return;
  const nome = patient.nome || "Sem nome";
  if (!confirm(`Excluir definitivamente o prontuário de ${nome}? Cadastro, consultas e retornos serão apagados neste aparelho, na sua conta e nos outros aparelhos na próxima sincronização. Não há como desfazer.\n\nA Lei 13.787/2018 manda guardar o prontuário por 20 anos a partir do último registro.`)) return;
  const digitado = prompt(`Para confirmar, digite o nome do paciente: ${nome}`);
  if (normalizeText(digitado || "").trim() !== normalizeText(nome).trim()) {
    alert("O nome não confere. Nada foi excluído.");
    return;
  }
  state = purgePatient(state, id);
  if (selectedPatientId === id) selectedPatientId = firstActivePatientId();
  persist();
  render();
}

function findEntry(id, type) {
  return (type === "consultation" ? state.consultations : state.returns).find(item => item.id === id);
}

// Sair encerra a sessao, desde 10/09/2026. Antes o botao so voltava ao Inicio:
// a sessao do Supabase continuava aberta, e quem sentasse depois no mesmo
// navegador entrava direto no prontuario. A pagina Sair ja e a confirmacao.
async function endSession() {
  if (voiceRecording.isBusy()) {
    alert("Encerre a gravação e aguarde a transcrição antes de sair.");
    return;
  }
  // Sem await: signOut() tira a sessao local na hora, e o aviso ao Supabase
  // termina sozinho. A tela de entrada nao espera a rede.
  const erro = await waitForLocalSave();
  if (erro) { storageError = erro; render(); return; }
  signOut().catch(() => {});
  authSession = null;
  state = { patients: [], consultations: [], returns: [] };
  selectedPatientId = "";
  unassignedRecords = 0;
  authError = "";
  syncError = "";
  syncConflict = null;
  draftGuard.replaced(); aiOperations.reset(); unsavedWork.limpar();
  draft = {};
  view = "dashboard";
  consultationPage = "anamnese";
  returnPage = "evolucao-retorno";
  consultationUnlocked = 1;
  returnUnlocked = 1;
  pendingViewAfterPatient = "";
  render();
}

