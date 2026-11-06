import { loadState, saveState } from "./services/storageService.js";
import { isConfigured, signIn, signOut, verifiedSession } from "./services/supabaseService.js";
import {
  DERMATOLOGY_ANAMNESIS_FIELDS,
  DERMATOLOGY_ASSESSMENT_FIELDS,
  DERMATOLOGY_ALARM_OPTIONS,
  DERMATOLOGY_EXPOSURE_OPTIONS,
  DERMATOLOGY_HISTORY_FIELDS,
  DERMATOLOGY_ONSET_OPTIONS,
  DERMATOLOGY_PHYSICAL_EXAM_FIELDS,
  DERMATOLOGY_PLAN_FIELDS,
  DERMATOLOGY_SYMPTOM_OPTIONS,
  DERMATOLOGIA_SPECIALTY,
  LESION_ARRANGEMENTS,
  LESION_COLORS,
  LESION_DISTRIBUTIONS,
  LESION_MORPHOLOGY,
  LESION_PALPATION,
  LESION_SURFACE,
  defaultDermatologyConsultation,
  newDermatologyLesion,
  sanitizeDermatologyRecord
} from "./specialties/dermatologia/index.js";
import { dermatologySourceStatus } from "./specialties/dermatologia/sources.js";
import { escapeHtml } from "./ui/html.js";

const app = document.querySelector("#app");
let state = { patients: [], consultations: [], returns: [] };
let session = null;
let localOnly = false;
let selectedPatientId = "";
let draft = null;
let authError = "";
let status = "";

function renderFatal(message) {
  if (!app) return;
  app.innerHTML = `<main class="auth-shell"><section class="auth-card"><h1>Não foi possível abrir o prontuário</h1><p>Recarregue a página. Se o problema continuar, verifique o servidor local.</p><p class="warning">${escapeHtml(message || "erro de inicialização")}</p></section></main>`;
}

window.addEventListener("error", event => renderFatal(event.error?.message || event.message));
window.addEventListener("unhandledrejection", event => renderFatal(event.reason?.message || event.reason));

const now = () => new Date().toISOString();
const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const activePatients = () => (state.patients || []).filter(p => !p.arquivadoEm && !p.excluidoEm);
const selectedPatient = () => activePatients().find(p => p.id === selectedPatientId);
function dermatologyState(value = {}) {
  return {
    ...value,
    patients: (value.patients || []).filter(item => !item.specialty || item.specialty === DERMATOLOGIA_SPECIALTY.id),
    consultations: (value.consultations || []).filter(item => !item.specialty || item.specialty === DERMATOLOGIA_SPECIALTY.id),
    returns: (value.returns || []).filter(item => !item.specialty || item.specialty === DERMATOLOGIA_SPECIALTY.id)
  };
}

Promise.all([verifiedSession().catch(() => null), isConfigured().catch(() => false)]).then(async ([verified, configured]) => {
  session = verified || null;
  localOnly = !configured;
  const loaded = await loadState(session?.user?.id || "");
  state = dermatologyState(loaded.state || state);
  selectedPatientId = activePatients()[0]?.id || "";
  render();
}).catch(error => { authError = error.message; render(); });

function render() {
  app.innerHTML = (!session && !localOnly) ? loginView() : shellView();
  bindEvents();
}

function loginView() {
  return `<main class="auth-shell"><section class="auth-card"><p class="eyebrow">${DERMATOLOGIA_SPECIALTY.label}</p><h1>${DERMATOLOGIA_SPECIALTY.productName}</h1><p>Entre para acessar seus prontuários dermatológicos.</p><form id="auth-form"><label>E-mail<input name="email" type="email" autocomplete="username" required /></label><label>Senha<input name="password" type="password" autocomplete="current-password" required /></label>${authError ? `<p class="warning">${escapeHtml(authError)}</p>` : ""}<button class="primary">Entrar</button></form></section></main>`;
}

function shellView() {
  const patient = selectedPatient();
  return `<div class="app-shell"><header class="topbar"><div class="brand"><span class="eyebrow">${DERMATOLOGIA_SPECIALTY.label}</span><h1>${DERMATOLOGIA_SPECIALTY.productName}</h1></div><div class="top-actions">${localOnly ? `<span class="status">Modo local</span>` : `<button data-action="logout">Sair</button>`}</div></header><main class="container"><section class="dashboard-grid"><aside class="panel"><div class="panel-heading"><h2>Pacientes</h2><button class="primary" data-action="new-patient">Novo</button></div>${activePatients().length ? activePatients().map(patientRow).join("") : `<p class="muted">Nenhum paciente cadastrado.</p>`}</aside><section class="panel workspace">${patient ? patientWorkspace(patient) : `<div class="empty-state"><h2>Comece por um paciente</h2><p>Cadastre o paciente para abrir a anamnese dermatológica.</p></div>`}</section></section><p class="field-hint">${escapeHtml(dermatologySourceStatus())}. O conteúdo clínico só será sugerido após validação e ativação explícita das fontes.</p>${status ? `<p class="status-line">${escapeHtml(status)}</p>` : ""}</main></div>`;
}

function patientRow(patient) {
  return `<button class="patient-row${patient.id === selectedPatientId ? " active" : ""}" data-patient="${escapeHtml(patient.id)}"><strong>${escapeHtml(patient.nome || "Sem nome")}</strong><small>${escapeHtml(patient.cpf || "")}</small></button>`;
}

function patientWorkspace(patient) {
  const consultations = (state.consultations || []).filter(c => c.patientId === patient.id && !c.excluidoEm);
  return `<div class="workspace-heading"><div><span class="eyebrow">Paciente</span><h2>${escapeHtml(patient.nome || "Sem nome")}</h2></div><button class="primary" data-action="new-consultation">Nova consulta</button></div>${draft ? consultationForm() : `<div class="empty-state"><p>${consultations.length ? `Este paciente tem ${consultations.length} consulta(s).` : "Ainda não há consultas."}</p><button data-action="new-consultation">Abrir atendimento</button></div>`}${consultations.length ? `<h3>Histórico</h3><div class="history-list">${consultations.map(c => `<button data-consultation="${escapeHtml(c.id)}">${escapeHtml(c.label || "Consulta dermatológica")} <small>${escapeHtml(c.updatedAt || "")}</small></button>`).join("")}</div>` : ""}`;
}

function consultationForm() {
  const record = draft.dermatology || (draft.dermatology = {});
  const section = (title, key, fields) => `<fieldset><legend>${title}</legend>${fields.map(([field, label]) => `<label>${label}<textarea data-section="${key}" data-field="${field}" rows="3">${escapeHtml(record[key]?.[field] || "")}</textarea></label>`).join("")}</fieldset>`;
  const checkboxes = (title, sectionKey, field, values) => `<div class="field-group"><span class="field-label">${title}</span><div class="chip-grid">${values.map(value => `<label class="chip"><input type="checkbox" data-section="${sectionKey}" data-field="${field}" value="${escapeHtml(value)}" ${(record[sectionKey]?.[field] || []).includes(value) ? "checked" : ""} />${escapeHtml(value)}</label>`).join("")}</div></div>`;
  const lesions = (draft.dermatology.lesions || []).map((lesion, index) => `<article class="panel lesion-card"><div class="panel-heading"><h3>${escapeHtml(lesion.label || `Lesão ${index + 1}`)}</h3><button type="button" data-action="remove-lesion" data-lesion-index="${index}">Remover</button></div><label>Localização<textarea rows="2" data-lesion-index="${index}" data-lesion-field="localizacao">${escapeHtml(lesion.localizacao || "")}</textarea></label><label>Dimensões<textarea rows="2" data-lesion-index="${index}" data-lesion-field="dimensoes">${escapeHtml(lesion.dimensoes || "")}</textarea></label><label>Sintomas e evolução<textarea rows="2" data-lesion-index="${index}" data-lesion-field="sintomas">${escapeHtml(lesion.sintomas || "")}</textarea></label></article>`).join("");
  return `<form id="consultation-form">${section("Queixa e história", "anamnese", DERMATOLOGY_ANAMNESIS_FIELDS)}${checkboxes("Sintomas associados", "anamnese", "sintomasSelecionados", DERMATOLOGY_SYMPTOM_OPTIONS)}${checkboxes("Início e padrão temporal", "anamnese", "inicioSelecionado", DERMATOLOGY_ONSET_OPTIONS)}${checkboxes("Exposições e gatilhos", "anamnese", "exposicoesSelecionadas", DERMATOLOGY_EXPOSURE_OPTIONS)}${section("Antecedentes dermatológicos", "antecedentes", DERMATOLOGY_HISTORY_FIELDS)}${section("Exame físico", "exameFisico", DERMATOLOGY_PHYSICAL_EXAM_FIELDS)}${checkboxes("Morfologia primária", "exameFisico", "morfologiaSelecionada", LESION_MORPHOLOGY)}${checkboxes("Distribuição e configuração", "exameFisico", "distribuicaoSelecionada", LESION_DISTRIBUTIONS)}${checkboxes("Arranjo", "exameFisico", "arranjoSelecionado", LESION_ARRANGEMENTS)}${checkboxes("Cor", "exameFisico", "corSelecionada", LESION_COLORS)}${checkboxes("Superfície", "exameFisico", "superficieSelecionada", LESION_SURFACE)}${checkboxes("Palpação", "exameFisico", "palpacaoSelecionada", LESION_PALPATION)}${checkboxes("Sinais de alarme", "avaliacao", "sinaisAlarmeSelecionados", DERMATOLOGY_ALARM_OPTIONS)}<div class="lesions-section"><div class="panel-heading"><h3>Lesões individualizadas</h3><button type="button" data-action="add-lesion">Adicionar lesão</button></div>${lesions || `<p class="muted">Adicione uma lesão para registrar localização, dimensões e evolução separadamente.</p>`}</div>${section("Avaliação", "avaliacao", DERMATOLOGY_ASSESSMENT_FIELDS)}${section("Conduta e seguimento", "conduta", DERMATOLOGY_PLAN_FIELDS)}<div class="actions"><button type="button" data-action="cancel-draft">Cancelar</button><button class="primary" data-action="save-consultation">Salvar consulta</button></div></form>`;
}

function bindEvents() {
  document.querySelector("#auth-form")?.addEventListener("submit", async event => { event.preventDefault(); const form = new FormData(event.currentTarget); try { session = await signIn(form.get("email"), form.get("password")); authError = ""; const loaded = await loadState(session.user.id); state = dermatologyState(loaded.state); selectedPatientId = activePatients()[0]?.id || ""; render(); } catch (error) { authError = error.message; render(); } });
  document.querySelectorAll("[data-patient]").forEach(button => button.addEventListener("click", () => { selectedPatientId = button.dataset.patient; draft = null; render(); }));
  document.querySelectorAll("[data-consultation]").forEach(button => button.addEventListener("click", () => { draft = structuredClone(state.consultations.find(c => c.id === button.dataset.consultation)); render(); }));
  document.querySelector("[data-action='logout']")?.addEventListener("click", async () => { await signOut(); session = null; render(); });
  document.querySelector("[data-action='new-patient']")?.addEventListener("click", newPatient);
  document.querySelector("[data-action='new-consultation']")?.addEventListener("click", newConsultation);
  document.querySelector("[data-action='cancel-draft']")?.addEventListener("click", () => { draft = null; render(); });
  document.querySelector("[data-action='add-lesion']")?.addEventListener("click", () => { draft.dermatology ||= {}; draft.dermatology.lesions ||= []; draft.dermatology.lesions.push(newDermatologyLesion({ label: `Lesão ${draft.dermatology.lesions.length + 1}` })); render(); });
  document.querySelectorAll("[data-action='remove-lesion']").forEach(button => button.addEventListener("click", () => { draft.dermatology.lesions.splice(Number(button.dataset.lesionIndex), 1); render(); }));
  document.querySelector("[data-action='save-consultation']")?.addEventListener("click", saveConsultation);
  document.querySelectorAll("textarea[data-section]").forEach(field => field.addEventListener("input", () => { const section = field.dataset.section; draft.dermatology ||= {}; draft.dermatology[section] ||= {}; draft.dermatology[section][field.dataset.field] = field.value; }));
  document.querySelectorAll("input[type='checkbox'][data-section]").forEach(field => field.addEventListener("change", () => { const section = field.dataset.section; const key = field.dataset.field; draft.dermatology ||= {}; draft.dermatology[section] ||= {}; draft.dermatology[section][key] = [...document.querySelectorAll(`input[data-section='${section}'][data-field='${key}']:checked`)].map(item => item.value); }));
  document.querySelectorAll("[data-lesion-index][data-lesion-field]").forEach(field => field.addEventListener("input", () => { const lesion = draft.dermatology.lesions[Number(field.dataset.lesionIndex)]; if (lesion) lesion[field.dataset.lesionField] = field.value; }));
}

function newPatient() {
  const nome = prompt("Nome do paciente:");
  if (!nome?.trim()) return;
  const patient = { id: uid(), nome: nome.trim(), createdAt: now(), updatedAt: now(), specialty: DERMATOLOGIA_SPECIALTY.id };
  state = { ...state, patients: [...(state.patients || []), patient] }; selectedPatientId = patient.id; status = "Paciente criado localmente."; saveState(state, session?.user?.id || "").then(() => render());
}

function newConsultation() {
  const patient = selectedPatient(); if (!patient) return;
  const count = (state.consultations || []).filter(c => c.patientId === patient.id).length + 1;
  draft = defaultDermatologyConsultation({ patientId: patient.id, sequence: count }); render();
}

async function saveConsultation(event) {
  event.preventDefault();
  const saved = sanitizeDermatologyRecord({ ...draft, id: draft.id || uid(), updatedAt: now(), createdAt: draft.createdAt || now() });
  const consultations = (state.consultations || []).filter(item => item.id !== saved.id).concat(saved);
  state = { ...state, consultations };
  const error = await saveState(state, session?.user?.id || "");
  status = error || "Consulta dermatológica salva neste aparelho."; draft = null; render();
}
