import { optionGroups } from "./data/examOptions.js?v=tratamento-1";
import { medications } from "./data/medications.js?v=medicamentos-1";
import { fetchCep } from "./services/cepService.js";
import { exportTextAsPdf } from "./services/pdfService.js?v=pdf-download-2";
import { loadState, saveState, uid } from "./services/storageService.js";
import { currentSession, pullState, pushState, signIn } from "./services/supabaseService.js";

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
const RECORD_SEARCH_TEXT_CACHE = new WeakMap();
const ENTRY_TIMESTAMP_CACHE = new WeakMap();
const MENTAL_EXAM_KEYS = Object.freeze([
  "aparencia",
  "consciencia",
  "atencao",
  "orientacao",
  "memoria",
  "sensopercepcao",
  "pensamentoCursoForma",
  "pensamentoConteudo",
  "linguagem",
  "humor",
  "afeto",
  "psicomotricidade",
  "vontade",
  "juizoCritico"
]);
const NORMAL_MENTAL_EXAM_FINDINGS = Object.freeze({
  aparencia: "apresenta aparencia cuidada, atitude colaborativa e contato visual adequado",
  consciencia: "consciente",
  atencao: "com atencao preservada",
  orientacao: "orientado no tempo e no espaco",
  memoria: "com funcoes mnesicas preservadas",
  sensopercepcao: "sem alteracoes sensoperceptivas",
  pensamentoCursoForma: "pensamento com curso e forma preservados",
  pensamentoConteudo: "sem alteracoes relevantes do conteudo do pensamento",
  linguagem: "com fala espontanea, coerente e compreensivel",
  humor: "eutimico",
  afeto: "afeto congruente e modulado",
  psicomotricidade: "psicomotricidade sem alteracoes relevantes",
  vontade: "vontade preservada",
  juizoCritico: "com juizo critico preservado"
});
const PROFESSIONAL_TERM_REPLACEMENTS = Object.freeze([
  [/\bnao\b/gi, "não"],
  [/\bideacao\b/gi, "ideação"],
  [/\bintencao\b/gi, "intenção"],
  [/\bativacao\b/gi, "ativação"],
  [/\bperseguicao\b/gi, "perseguição"],
  [/\breferencia\b/gi, "referência"],
  [/\bdesconfianca\b/gi, "desconfiança"],
  [/\bvozes ou ruidos\b/gi, "vozes ou ruídos"],
  [/\bdesorganizado\b/gi, "desorganizado"],
  [/\bsensacao\b/gi, "sensação"],
  [/\binterferencia\b/gi, "interferência"],
  [/\bpensamento psicotico\b/gi, "pensamento psicótico"],
  [/\bpsicotico\b/gi, "psicótico"],
  [/\bconcentracao\b/gi, "concentração"],
  [/\balucinacao\b/gi, "alucinação"],
  [/\bdelirio\b/gi, "delírio"],
  [/\bdoenca\b/gi, "doença"],
  [/\bespaco\b/gi, "espaço"],
  [/\bnegacao\b/gi, "negação"],
  [/\bcritica\b/gi, "crítica"],
  [/\bfuncoes mnesicas\b/gi, "funções mnésicas"],
  [/\bantipsicotico\b/gi, "antipsicótico"],
  [/\bprejuizo\b/gi, "prejuízo"],
  [/\bhabitos\b/gi, "hábitos"],
  [/\bsedacao\b/gi, "sedação"],
  [/\balteracao\b/gi, "alteração"],
  [/\bmetabolica\b/gi, "metabólica"],
  [/\bdisfuncao\b/gi, "disfunção"],
  [/\burgencia\b/gi, "urgência"],
  [/\binternacao\b/gi, "internação"]
]);
const EVOLUTION_REFRESH_PATTERNS = Object.freeze([
  /^\s*Paciente\s+/i,
  /Durante o rastreio/i,
  /Quanto ao\s+/i,
  /No rastreio (depressivo|psicótico)/i,
  /foram registrados:/i,
  /foram assinalados:/i,
  /registra-se nega/i,
  /associa[cç][aã]o com sem fator claro/i,
  /antecedentes m[eé]dicos de nega/i,
  /exame ps[ií]quico, apresenta-se/i
]);
const RETURN_BOILERPLATE_PHRASES = Object.freeze([
  "Sem antecedentes relevantes informados.",
  "Sem antecedentes ou habitos relevantes informados ate o momento.",
  "Sem alterações descritas no exame psíquico.",
  "Paciente sem alteracoes descritas no exame psiquico.",
  "Hipóteses diagnósticas não selecionadas.",
  "Conduta médica e exames não registrados."
]);
const HTML_ESCAPE_ENTITIES = Object.freeze({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;"
});
const consultationPages = [
  ["anamnese", "Anamnese"],
  ["psiquico", "Exame psiquico"],
  ["neurologico", "Exame fisico"],
  ["refinamento", "Refinamento"],
  ["resumo", "Resumo"],
  ["diagnostico", "Diagnostico"],
  ["tratamento", "Tratamento"],
  ["evolucao", "Historia clinica"],
  ["medicamentos", "Medicamentos"]
];
const returnPages = [
  ["evolucao-retorno", "Evolucao"],
  ["texto-retorno", "Texto final"]
];
const doctorDiagnosisOptions = [
  "Ausencia de psicopatologia de relevancia clinica - a mente esta funcionando dentro do esperado para os desafios atuais.",
  "Sintomas reativos/adaptativos - sofrimento como reacao a um problema especifico, como luto, termino ou estresse profissional.",
  "Z03.2 (CID-10) - Observacao por suspeita de transtornos mentais e de comportamento, quando a suspeita foi descartada.",
  "Z00.4 (CID-10) - Exame psiquiatrico geral, incluindo exames admissionais sem psicopatologia identificada."
];
const laboratoryExamRequestItems = [
  "Hemograma",
  "Sodio",
  "Potassio",
  "Glicemia de jejum",
  "Hemoglobina glicada (HbA1c)",
  "Perfil lipidico",
  "Creatinina",
  "Ureia",
  "TGO",
  "TGP",
  "TSH",
  "T4 livre",
  "Vitamina D",
  "Vitamina B12",
  "Folato"
];
const anamnesisQuestionGroups = [
  {
    title: "",
    items: [
      ["Impacto", [
        {
          key: "impactoSintomas",
          response: "multiple",
          question: "De que forma isso que voce esta sentindo atrapalha o seu trabalho, seus estudos ou suas relacoes?",
          options: ["Nenhuma", "Leve", "Moderado", "Grave", "Outro"],
          otherKey: "impactoSintomasOutro"
        }
      ]],
      ["Mania/hipomania", [
        {
          key: "maniaHipomaniaSintomas",
          response: "multiple",
          question: "Ja teve periodos, por dias, que voce ficou:",
          options: ["Nega sintomas relacionados", "Muito acelerado", "Com muita energia", "Falando mais", "Dormindo pouco", "Fazendo coisas impulsivas", "Outro"],
          otherKey: "maniaHipomaniaSintomasOutro"
        }
      ]],
      ["Ansiedade e panico", [
        {
          key: "ansiedadeSintomas",
          response: "multiple",
          options: [
            "Falta de controle",
            "Preocupacao excessiva",
            "Tensao corporal",
            "Dificuldade de focar",
            "Agitacao",
            "Irritabilidade",
            "Sintomas fisicos"
          ]
        }
      ]],
      ["Sono", [
        {
          key: "sonoCaracteristicas",
          response: "multiple",
          options: [
            "Sono reparador",
            "Sono nao reparador",
            "Dificuldade para adormecer",
            "Despertares noturnos",
            "Despertar precoce",
            "Dormir em excesso"
          ]
        }
      ]],
      ["Apetite", [
        {
          key: "apetiteCaracteristicas",
          response: "multiple",
          options: [
            "Reducao do apetite",
            "Aumento do apetite",
            "Compulsao alimentar",
            "Perda de peso recente",
            "Ganho de peso recente"
          ]
        }
      ]],
      ["Sintomas depressivos", [
        {
          key: "depressaoSintomas",
          response: "multiple",
          options: [
            "Desinteresse ou falta de prazer",
            "Desanimo ou desesperanca",
            "Cansaco ou falta de energia",
            "Dificuldade de concentracao",
            "Fala lenta",
            "Agitacao",
            "Baixa autoestima",
            "Sentimento de ruina",
            "Sentimento de estorvo para a familia"
          ]
        }
      ]]
    ]
  },
  {
    title: "Perguntas apos vinculo com o paciente",
    items: [
      ["Paranoia e sintomas psicoticos", [
        {
          key: "psicoseSintomas",
          response: "multiple",
          options: [
            "Nega sintomas relacionados",
            "Ideias de perseguicao",
            "Sensacao de estar sendo observado ou comentado",
            "Ideias de referencia",
            "Desconfianca excessiva",
            "Vozes ou ruidos sem fonte externa",
            "Visoes sem fonte externa",
            "Sensacoes tateis ou odores sem fonte externa",
            "Pensamento desorganizado",
            "Comportamento desorganizado",
            "Sensacao de controle ou interferencia no pensamento",
            "Outro"
          ],
          otherKey: "psicoseSintomasOutro"
        }
      ]],
      ["Habitos, substancias e comportamentos aditivos", [
        {
          key: "usoSubstanciasComportamentos",
          response: "multiple",
          options: [
            "Nicotina",
            "Alcool",
            "Cafeina",
            "Calmantes",
            "Estimulantes",
            "Cocaina",
            "Opioides",
            "Canabinoides",
            "Jogos de Azar",
            "Redes Sociais",
            "Compras Compulsivas",
            "Transtornos Alimentares"
          ]
        }
      ]],
      ["Risco de suicidio e desesperanca", [
        {
          key: "riscoSuicidioIndicadores",
          response: "multiple",
          options: [
            "Nega ideacao, plano ou intencao suicida",
            "Desesperanca",
            "Desejo de morrer ou de nao acordar",
            "Ideacao suicida",
            "Plano suicida definido",
            "Intencao suicida",
            "Acesso a meios potencialmente letais",
            "Comportamento preparatorio",
            "Tentativa de suicidio previa",
            "Autoagressao sem intencao suicida"
          ]
        },
        { key: "riscoSuicidioRazoesViver", label: "Fatores impeditivos", question: "O que te impede de fazer isso hoje?", response: "text" },
        { key: "riscoSuicidioRazoesParaViver", label: "Razoes para viver", question: "Quais sao suas razoes para viver?", response: "text" }
      ]]
    ]
  }
];

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
      if (remoteState) { state = remoteState; saveState(state); selectedPatientId = state.patients?.[0]?.id || ""; }
    } catch (error) { authError = error.message; }
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
        <span class="secure-status"><i></i> Ambiente clínico seguro</span>
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
        ${navButton("record", "Prontuario", "record")}
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

function consultationAccessPanel(consultations, form) {
  return `<div class="clinical-card record-access">
    <h4>Consultas deste paciente</h4>
    <div class="actions">
      <button class="secondary" type="button" data-action="new-consultation">Nova consulta</button>
      ${consultations.map(entry => `
        <button class="secondary ${entry.id === form.id ? "active" : ""}" type="button" data-action="edit-entry" data-id="${entry.id}" data-type="consultation">
          ${escapeHtml(entry.label)}
        </button>
      `).join("")}
    </div>
  </div>`;
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

function recordReturnAction(label) {
  return `
    <div class="warning record-opened">
      ${escapeHtml(label)}.
      <button class="secondary inline-action" type="button" data-action="back-to-record">Voltar ao prontuario</button>
    </div>
  `;
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

function returnAssessmentBody(form) {
  return `
    ${singleChoiceWithNotes("evolucaoClinicaRetorno", "Evolucao clinica", ["Melhora clínica", "Estabilidade clínica", "Piora clínica", "Novos sintomas"], form.evolucaoClinicaRetorno)}
    ${singleChoiceWithNotes("sonoRetorno", "Sono", ["Adequado e reparador", "Insônia", "Hipersonia", "Redução da necessidade de sono"], form.sonoRetorno)}
    ${singleChoiceWithNotes("humorAnsiedadeRetorno", "Humor e ansiedade", ["Eutímico", "Deprimido", "Ansioso", "Irritável", "Elevado ou oscilante", "Crise de pânico"], form.humorAnsiedadeRetorno)}
    ${singleChoiceWithNotes("adesao", "Adesao ao tratamento", ["Adequada", "Parcial ou irregular", "Não iniciou ou interrompeu"], form.adesao)}
    ${chips("efeitos", "Efeitos colaterais", ["Nenhum", "Sedacao ou sonolencia", "Sintomas gastrointestinais", "Alteracao de peso ou metabolica", "Efeitos motores", "Disfuncao sexual", "Outro"], form.efeitos)}
    ${chips("funcionalidadeEventosRetorno", "Funcionalidade e eventos relevantes", ["Nenhum", "Prejuizo funcional", "Conflito, estressor ou luto", "Urgencia ou internacao", "Risco ou autoagressao", "Outro"], form.funcionalidadeEventosRetorno)}
    ${chips("condutaMedicamentoRetorno", "Medicamento", ["Manter dose", "Aumentar dose", "Diminuir dose", "Retirar", "Trocar medicamento", "Acrescentar medicamento", "Outro"], form.condutaMedicamentoRetorno)}
  `;
}

function mentalExamBody(form) {
  const groups = [
    ["aparencia", "Aparencia, Atitude e Contato"],
    // consciencia estava fora desta lista: era lida no resumo, na evolucao e no
    // diagnostico, mas nao tinha controle na tela e chegava sempre vazia.
    ["consciencia", "Consciencia"],
    ["atencao", "Atencao/Vigilancia"], ["orientacao", "Orientacao"],
    ["memoria", "Memoria"], ["sensopercepcao", "Sensopercepcao"],
    ["pensamentoCursoForma", "Pensamento (Curso e Forma)"], ["pensamentoConteudo", "Pensamento (Conteudo)"],
    ["linguagem", "Linguagem"], ["humor", "Humor (Estado Basal)"], ["afeto", "Afeto (Resposta)"],
    ["psicomotricidade", "Psicomotricidade"], ["vontade", "Vontade"], ["juizoCritico", "Juizo Critico (Insight)"]
  ];
  return groups.map(([key, label]) => `
    ${chips(key, label, optionGroups[key].filter(option => option !== "NDN"), form[key])}
  `).join("");
}

function neurologicExamBody(form) {
  return `
    ${textarea("fisico", "Achados fisicos e neurologicos relevantes", form.fisico)}
  `;
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
    const selected = valueList(form[name]);
    const type = item.selection_mode === "multiple" ? "checkbox" : "radio";
    return `<article class="refinement-item"><h4>${escapeHtml(item.topic || `Pergunta ${index + 1}`)}</h4><p>${escapeHtml(item.prompt || "")}</p><div class="chips">${(item.options || []).map(option => `<label class="chip"><input type="${type}" name="${name}" value="${escapeAttr(option)}" ${selected.includes(option) ? "checked" : ""}>${escapeHtml(option)}</label>`).join("")}</div></article>`;
  }).join("");
  const decisionBlock = (title, items, prefix, options) => !items?.length ? "" : `<section class="refinement-section"><h4>${title}</h4>${items.map((item, index) => {
    const name = `${prefix}_${index}`;
    const selected = valueList(form[name])[0] || "";
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

function clinicalSummaryPage(form = {}, patient = {}) {
  const groups = clinicalSummaryGroups(form, patient);
  return groups.map(group => summaryTable(group.title, group.rows, group.layout)).join("");
}

function clinicalSummaryGroups(form = {}, patient = {}) {
  const age = calculateAge(patient.nascimento);
  const address = [patient.endereco, patient.numero, patient.complemento, patient.bairro, patient.cidade, patient.estado]
    .filter(Boolean).join(", ");
  const identityRows = [
    summaryTextRow("Identidade", "Nome", patient.nome),
    summaryTextRow("Identidade", "Data de nascimento", formatSummaryDate(patient.nascimento)),
    summaryTextRow("Identidade", "Idade", age ? `${age} anos` : ""),
    summaryTextRow("Identidade", "Sexo", patient.sexo),
    summaryTextRow("Identidade", "Estado civil", patient.estadoCivil),
    summaryTextRow("Identidade", "Ocupação", patient.ocupacao),
    summaryTextRow("Identidade", "Escolaridade", patient.escolaridade),
    summaryTextRow("Identidade", "Religião", patient.religiao),
    summaryTextRow("Contato", "Telefone", patient.telefone),
    summaryTextRow("Contato", "E-mail", patient.email),
    summaryTextRow("Contato", "Nome e contato de emergência", patient.emergencia),
    summaryTextRow("Endereço", "CEP", patient.cep),
    summaryTextRow("Endereço", "Endereço", address)
  ];
  const narrativeRows = [
    summaryTextRow("Anamnese", "Queixa principal e HDA", conciseQphdaSummary(anamnesisText(form))),
    summaryTextRow("Anamnese", "Antecedentes médicos", joinValues(form.medicos))
  ];
  const anamnesisRows = anamnesisQuestionGroups.flatMap(group => group.items.flatMap(([sectionTitle, items]) =>
    items.map(item => item.response === "multiple"
      ? summaryGroupedOptionRow(sectionTitle, item.label || item.question || sectionTitle, item.key, item.options || [], form, item.otherKey)
      : summaryTextRow(sectionTitle, item.label || item.question || item.key, form[item.key])
    )
  ));
  const complementaryRows = [
    summaryGroupedOptionRow("Antecedentes", "Psiquiátricos prévios", "psiPrevios", optionGroups.psiPrevios || [], form, "psiPreviosOutro"),
    summaryGroupedOptionRow("Antecedentes", "Tratamentos prévios", "tratamentos", optionGroups.tratamentos || [], form, "tratamentosOutro"),
    summaryGroupedOptionRow("Antecedentes familiares", "História familiar", "familiares", optionGroups.familiares || [], form, "familiaresOutro"),
    summaryGroupedOptionRow("Fatores de piora", "Fatores identificados", "fatores", optionGroups.fatores || [], form, "fatoresOutro"),
    summaryGroupedOptionRow("Fatores de melhora", "Fatores identificados", "fatoresMelhora", optionGroups.fatoresMelhora || [], form, "fatoresMelhoraOutro"),
    summaryGroupedOptionRow("Impacto funcional", "Áreas afetadas", "impacto", optionGroups.impacto || [], form, "impactoOutro")
  ];
  const mentalLabels = {
    aparencia: "Aparência, atitude e contato", consciencia: "Consciência", atencao: "Atenção",
    orientacao: "Orientação", memoria: "Memória", sensopercepcao: "Sensopercepção",
    pensamentoCursoForma: "Pensamento - curso e forma", pensamentoConteudo: "Pensamento - conteúdo",
    linguagem: "Linguagem", humor: "Humor", afeto: "Afeto",
    psicomotricidade: "Psicomotricidade", vontade: "Vontade", juizoCritico: "Juízo crítico"
  };
  const mentalRows = mentalExamKeys().map(key =>
    summaryGroupedOptionRow("Exame psíquico", mentalLabels[key] || key, key, optionGroups[key] || [], form, `${key}Outro`)
  );
  const physicalRows = [
    summaryTextRow("Exame físico", "Achados relevantes", form.fisico)
  ].filter(row => row.value);
  const refinementRows = refinementSummaryRows(form);
  return [
    { title: "Identificação do paciente", rows: identityRows, layout: "item-record" },
    { title: "Dados narrativos", rows: narrativeRows, layout: "item-record" },
    { title: "Anamnese estruturada", rows: [...anamnesisRows, ...complementaryRows], layout: "area-record" },
    { title: "Exame psíquico", rows: mentalRows.map(row => ({ ...row, section: row.item })), layout: "area-record" },
    { title: "Exame físico", rows: physicalRows },
    { title: "Refinamento clínico", rows: refinementRows, layout: "area-record" }
    // Exame fisico e Refinamento so tem linhas depois de preenchidos; sem o
    // filtro, o resumo mostraria a tabela vazia (so o cabecalho).
  ].filter(group => group.rows.length);
}

function refinementSummaryRows(form = {}) {
  const plan = form.refinementPlan || {};
  const rows = [];
  (plan.questions || []).forEach((item, index) => rows.push(summaryTextRow(item.topic || "Pergunta", item.prompt, joinValues(form[`refinementQuestion_${index}`]))));
  [["Red flags", "red_flags", "refinementRedFlag"], ["Observacoes", "observations", "refinementObservation"], ["Pontos importantes", "important_points", "refinementImportant"]].forEach(([sectionTitle, key, prefix]) => {
    (plan[key] || []).forEach((item, index) => rows.push(summaryTextRow(item.topic || sectionTitle, item.reason, form[`${prefix}_${index}`])));
  });
  if (form.refinementDoctorNotes) rows.push(summaryTextRow("Medico", "Observacoes", form.refinementDoctorNotes));
  return rows.filter(row => row.value);
}

function formatSummaryDate(value = "") {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value || "");
}

function conciseQphdaSummary(value = "") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const sentences = text.match(/[^.!?]+[.!?]?/g)?.map(sentence => sentence.trim()).filter(Boolean) || [text];
  const selected = [sentences[0]];
  const addMatch = pattern => {
    const match = sentences.find(sentence => !selected.includes(sentence) && pattern.test(normalizeText(sentence)));
    if (match) selected.push(match);
  };
  addMatch(/(ha |desde|mes|ano|evolu|inicio|duracao)/);
  addMatch(/(prejuizo|afastamento|trabalho|risco|suicid|funcional|tratamento)/);
  for (const sentence of sentences) {
    if (selected.length >= 3) break;
    if (!selected.includes(sentence)) selected.push(sentence);
  }
  const summary = selected.slice(0, 3).sort((a, b) => sentences.indexOf(a) - sentences.indexOf(b)).join(" ");
  if (summary.length <= 210) return summary;
  return `${summary.slice(0, 207).replace(/\s+\S*$/, "").replace(/[,:;.-]+$/, "")}...`;
}

function summaryTextRow(section, item, value) {
  const text = String(value || "").trim();
  return { section, item, value: text };
}

function summaryGroupedOptionRow(section, item, key, options, form, otherKey = "") {
  const selected = valueList(form[key]);
  const normalizedSelected = new Set(selected.map(normalizeText));
  const values = options.flatMap(option => {
    const isOther = normalizeText(option) === "outro";
    const otherValue = isOther && otherKey ? String(form[otherKey] || "").trim() : "";
    const marked = normalizedSelected.has(normalizeText(option)) || Boolean(otherValue);
    return marked ? [otherValue || optionDisplayLabel(option)] : [];
  });
  if (otherKey && String(form[otherKey] || "").trim() && !options.some(option => normalizeText(option) === "outro")) {
    values.push(String(form[otherKey]).trim());
  }
  return { section, item, value: values.join("; ") };
}

/* Layouts de resumo:
   "full"        -> Área | Campo | Registro
   "area-record" -> Área | Registro  (o campo repetiria a area)
   "item-record" -> Campo | Registro (a area repetiria o titulo do bloco)   */
function summaryColumns(layout = "full") {
  return { area: layout !== "item-record", item: layout !== "area-record" };
}

function summaryTable(title, rows = [], layout = "full") {
  const columns = summaryColumns(layout);
  const cells = (section, item, value, tag) => [
    columns.area ? `<${tag}>${escapeHtml(section)}</${tag}>` : "",
    columns.item ? `<${tag}>${escapeHtml(item)}</${tag}>` : "",
    `<${tag}>${escapeHtml(value)}</${tag}>`
  ].join("");
  return `<section class="summary-section"><h4>${escapeHtml(title)}</h4><div class="summary-table-wrap"><table class="summary-table">
    <thead><tr>${cells("Área", "Campo", "Registro", "th")}</tr></thead>
    <tbody>${rows.map(row => `<tr>${cells(row.section, row.item, row.value, "td")}</tr>`).join("")}</tbody>
  </table></div></section>`;
}

function diagnosisModule(form) {
  const syndromicOptions = diagnosticSyndromicOptionLines(form);
  const nosologicalOptions = diagnosticNosologicalOptionLines(form);
  const etiologicalOptions = diagnosticEtiologicalOptionLines(form);
  const selectedValues = selectedDiagnosisValues(form);
  const selectedText = selectedDiagnosisText(form);
  const aiStatus = diagnosisAiStatusText(form.aiStatus);
  return `
    <div class="diagnosis-ai-panel">
      ${aiModeSelector(form.aiMode)}
      <div class="actions">
        <button class="primary" type="button" data-action="generate-diagnosis">Gerar</button>
      </div>
      ${aiStatus ? `<p class="online-status">${escapeHtml(aiStatus)}</p>` : ""}
      ${ragSourcesView(form.ragSources)}
    </div>
    <textarea hidden name="diagnosticoManual">${escapeHtml(selectedText)}</textarea>
    <textarea hidden name="diagnosticoAiSindromico">${escapeHtml(syndromicOptions.join("\n"))}</textarea>
    <textarea hidden name="diagnosticoAiNosologico">${escapeHtml(nosologicalOptions.join("\n"))}</textarea>
    <textarea hidden name="diagnosticoAiEtiologico">${escapeHtml(etiologicalOptions.join("\n"))}</textarea>
    ${diagnosisCategory("Sindrômico", syndromicOptions, selectedValues, 3)}
    ${diagnosisCategory("Nosológico", nosologicalOptions, selectedValues, 3)}
    ${diagnosisCategory("Etiológico", etiologicalOptions, selectedValues, 2)}
    <div class="diagnosis-group diagnosis-doctor-group">
      <h4>Hipóteses do médico</h4>
      <div class="diagnosis-options">${diagnosisOptionCheckboxes(doctorDiagnosisOptions, selectedValues)}</div>
    </div>
  `;
}

function diagnosisCategory(label, options, selectedValues, count) {
  return `<div class="diagnosis-group"><h4>${label} — ${count} hipóteses</h4>
      <div class="diagnosis-options">
        ${options.length ? diagnosisOptionCheckboxes(options, selectedValues) : `<p class="diagnosis-empty">Nenhuma hipótese gerada.</p>`}
      </div>
    </div>`;
}

function diagnosisOptionCheckboxes(options, selectedValues) {
  return options.map(option => `
    <label class="diagnosis-option ${validationControlClass("diagnosticoSelecionado", option)}">
      <input type="checkbox" name="diagnosticoSelecionado" value="${escapeAttr(option)}" ${selectedValues.includes(option) ? "checked" : ""} />
      <span>${escapeHtml(option)}${validationControlBadge("diagnosticoSelecionado", option)}</span>
    </label>
  `).join("");
}

function diagnosisAiStatusText(message = "") {
  if (!message) return "";
  if (/OPENAI_API_KEY|IA indisponivel/i.test(message)) return "6 hipoteses locais aplicadas.";
  return message;
}

function aiModeSelector(value = "current", name = "aiMode") {
  return `<fieldset class="ai-mode-selector">
    <legend>Fonte da resposta</legend>
    <label><input type="radio" name="${name}" value="current" ${value !== "rag" ? "checked" : ""} /><span>IA atual</span><small>Modelo e regras clinicas atuais</small></label>
    <label><input type="radio" name="${name}" value="rag" ${value === "rag" ? "checked" : ""} /><span>RAG com literatura</span><small>Restringe a resposta às fontes indexadas (psicopatologia e psicofarmacologia)</small></label>
  </fieldset>`;
}

function ragSourcesView(sources = []) {
  if (!Array.isArray(sources) || !sources.length) return "";
  return `<details class="rag-sources"><summary>${sources.length} fonte(s) recuperada(s)</summary><ol>${sources.map(source => `
    <li><strong>${escapeHtml(source.filename || "Fonte")}</strong><span>Relevancia: ${Math.round(Number(source.score || 0) * 100)}%</span></li>`).join("")}</ol></details>`;
}

function treatmentModule(form) {
  const examesText = requestedExamsText(form);
  const medicationOptions = treatmentOptionLines(form.tratamentoAiMedicamentos);
  const approachOptions = treatmentOptionLines(form.tratamentoAiAbordagens);
  const selectedApproaches = arrayValue(form.abordagensSelecionadas);
  return `
    <div class="diagnosis-ai-panel">
      ${aiModeSelector(form.pharmaAiMode || "rag", "pharmaAiMode")}
      <div class="actions">
        <button class="primary" type="button" data-action="generate-treatment">Gerar</button>
      </div>
      ${form.treatmentStatus ? `<p class="online-status">${escapeHtml(form.treatmentStatus)}</p>` : ""}
      ${ragSourcesView(form.ragSources)}
    </div>
    <div class="treatment-card-grid">
      <div class="treatment-card">
        <h4>Abordagem medicamentosa</h4>
        <textarea hidden name="tratamentoAiMedicamentos">${escapeHtml(medicationOptions.join("\n"))}</textarea>
        <textarea hidden name="tratamentoMedicamentoso">${escapeHtml(form.tratamentoMedicamentoso || "")}</textarea>
        <div class="diagnosis-options">
          ${medicationOptions.length ? medicationOptions.map((option, index) => `<article class="treatment-card"><h4>${index === 0 ? "1ª opção" : index === 1 ? "2ª opção" : "Off-label"}</h4><label class="diagnosis-option treatment-option ${validationControlClass("tratamentoMedicamentosSelecionados", option)}"><input type="checkbox" name="tratamentoMedicamentosSelecionados" value="${escapeAttr(option)}" ${arrayValue(form.tratamentoMedicamentosSelecionados).includes(option) ? "checked" : ""} /><span>${escapeHtml(option)}${validationControlBadge("tratamentoMedicamentosSelecionados", option)}</span></label></article>`).join("") : `<p class="diagnosis-empty">As opções aparecerão após a geração.</p>`}
        </div>
      </div>
      <div class="treatment-card">
        <h4>Outras abordagens</h4>
        <textarea hidden name="tratamentoAiAbordagens">${escapeHtml(approachOptions.join("\n"))}</textarea>
        <textarea hidden name="abordagensTerapeuticas">${escapeHtml(form.abordagensTerapeuticas || "")}</textarea>
        <div class="diagnosis-options">
          ${approachOptions.length ? treatmentOptionCheckboxes("abordagensSelecionadas", approachOptions, selectedApproaches) : `<p class="diagnosis-empty">As abordagens aparecerão após a geração.</p>`}
        </div>
      </div>
      <div class="treatment-card">
        <h4>Exames solicitados</h4>
        ${chips("examesSolicitados", "", optionGroups.examesPsiquiatria, form.examesSolicitados)}
        <textarea hidden name="examesLaboratoriais">${escapeHtml(examesText)}</textarea>
      </div>
      <div class="treatment-card physician-adjustments">
        <h4>Ajustes do medico</h4>
        ${textarea("condutaMedica", "", form.condutaMedica, "", 3)}
      </div>
    </div>
  `;
}

function treatmentOptionLines(value = "") {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || "").split("\n").map(item => item.trim()).filter(Boolean);
}

function arrayValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

function treatmentOptionCheckboxes(name, options, selectedValues) {
  return options.map(option => `
    <label class="diagnosis-option treatment-option ${validationControlClass(name, option)}">
      <input type="checkbox" name="${name}" value="${escapeAttr(option)}" ${selectedValues.includes(option) ? "checked" : ""} />
      <span>${escapeHtml(option)}${validationControlBadge(name, option)}</span>
    </label>
  `).join("");
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

function medicationReferenceCard(form) {
  return `
    <article class="medication-reference-card">
      <div class="medication-reference-title">
        <div>
          <span class="eyebrow">FICHA DO MEDICAMENTO</span>
          <h3>${escapeHtml(form.medicationNameText || form.medicationGeneric || "Medicamento")}</h3>
          ${form.medicationBrands ? `<p><strong>Nomes comerciais:</strong> ${escapeHtml(form.medicationBrands)}</p>` : ""}
        </div>
        ${form.medicationClass ? `<span class="medication-class">${escapeHtml(form.medicationClass)}</span>` : ""}
      </div>
      <div class="medication-priority-grid">
        ${medicationPriorityFact("Princípio ativo", form.medicationActiveIngredient || form.medicationNameText)}
        ${medicationPriorityFact("Apresentação", form.medicationPresentationHighlight)}
        ${medicationPriorityFact("Dose recomendada", form.medicationRecommendedDose)}
        ${medicationPriorityFact("Principais efeitos colaterais", form.medicationMainEffects)}
      </div>
      <div class="medication-facts-grid">
        ${medicationFact("Indicações e uso clínico", form.medicationBestUse)}
        ${medicationFact("Posologia e progressão", form.medicationPresentation)}
        ${medicationFact("Segurança, contraindicações e interações", form.medicationSafety)}
        ${medicationFact("Mecanismo e receptores", form.medicationMechanism)}
        ${medicationFact("Monitorização", form.medicationMonitoring)}
        ${medicationFact("Populações especiais", form.medicationSpecialPopulations)}
      </div>
      ${medicationNameLinks(form.medicationGeneric || form.medicationNameText)}
    </article>
  `;
}

function medicationPriorityFact(title, value) {
  if (!value) return "";
  return `<section class="medication-priority-fact"><span>${escapeHtml(title)}</span><strong>${escapeHtml(value)}</strong></section>`;
}

function medicationFact(title, value) {
  if (!value) return "";
  return `<section class="medication-fact"><h4>${escapeHtml(title)}</h4><p>${escapeHtml(value).replace(/\n/g, "<br>")}</p></section>`;
}

function medicationNameLinks(name = "") {
  if (!name) return "";
  return `<div class="medication-reference-links">
    <a href="https://consultas.anvisa.gov.br/#/medicamentos/" target="_blank" rel="noopener noreferrer">Consultar na Anvisa</a>
    <a href="https://www.google.com/search?q=${encodeURIComponent(`${name} bula profissional`)}" target="_blank" rel="noopener noreferrer">Bula profissional</a>
  </div>`;
}

function evolutionBody(form, patient, previous = null, isReturn = false) {
  const evolution = outdatedEvolutionText(form.evolution)
    || shouldRefreshEvolutionNarrative(form.evolution)
    || (isReturn && returnEvolutionContainsIdentity(form.evolution, patient))
    || (isReturn && form.evolutionAutoGenerated && !normalizeText(form.evolution).startsWith("paciente retornou"))
    ? ""
    : normalizeEvolutionNarrative(form.evolution);
  const generatedEvolution = buildEvolutionNarrative(form, patient, previous, isReturn);
  return `
    <div class="actions">
      <button class="primary" type="button" data-action="generate-evolution">${isReturn ? "Atualizar evolução" : "Atualizar história clínica"}</button>
    </div>
    ${form.aiStatus ? `<p class="online-status">${escapeHtml(form.aiStatus)}</p>` : ""}
    ${textarea("evolution", "", evolution || generatedEvolution)}
  `;
}

function medicalRecord() {
  const patient = getPatient();
  if (!patient) return emptyPatientMessage("Prontuario");
  const query = (draft.recordQuery || "").toLowerCase();
  const patientEntries = entriesForPatient(patient.id);
  const all = query
    ? patientEntries.filter(entry => recordSearchText(entry).includes(query))
    : patientEntries;
  return `
    <div class="panel-title">
      <div><h2>Prontuario Longitudinal</h2></div>
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

function section(title, body, open = false) {
  return `<details class="section" ${open ? "open" : ""}><summary><strong>${title}</strong></summary><div class="section-body">${body}</div></details>`;
}

function field(name, labelText, value = "", type = "text") {
  return `<label class="${validationControlClass(name, value)}">${labelText}${validationControlBadge(name, value)}<input name="${name}" type="${type}" value="${escapeAttr(value || "")}" /></label>`;
}

function selectField(name, labelText, options, value = "") {
  return `<label class="${validationControlClass(name, value)}">${labelText}${validationControlBadge(name, value)}<select name="${name}"><option value="">Selecionar</option>${options.map(option => `<option value="${escapeAttr(option)}" ${value === option ? "selected" : ""}>${escapeHtml(optionDisplayLabel(option))}</option>`).join("")}</select></label>`;
}

function textarea(name, labelText, value = "", placeholder = "", rows = "") {
  const rowsAttr = rows ? ` rows="${rows}"` : "";
  const evolutionAttrs = name === "evolution" ? ` class="evolution-textarea" data-auto-expand="true" rows="12"`
    : name === "qphda" ? ` class="auto-expand" data-auto-expand="true" rows="5"`
      : ["queixa", "hdaManual"].includes(name) ? ` class="auto-expand" data-auto-expand="true" rows="1"`
        : name === "historia" ? ` class="auto-expand" data-auto-expand="true" rows="3"` : rowsAttr;
  return `<label class="${validationControlClass(name, value)}">${labelText}${validationControlBadge(name, value)}<textarea name="${name}"${evolutionAttrs} placeholder="${escapeAttr(placeholder)}">${escapeHtml(value || "")}</textarea></label>`;
}

function voiceTextarea(name, labelText, value = "", placeholder = "") {
  return `<div class="voice-field">${textarea(name, labelText, value, placeholder)}<div class="voice-controls">
    <button class="voice-button" type="button" data-action="voice" data-target="${name}" aria-label="Iniciar gravação da conversa" title="Iniciar gravação">
      ${microphoneIcon()}<span class="voice-pulse" aria-hidden="true"></span>
    </button>
    <span class="voice-status" aria-live="polite">Clique no microfone para iniciar a gravação integral</span>
  </div></div>`;
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

function anamnesisStructuredFields(questions, form) {
  return `<div class="structured-fields">
    ${questions.map(item => {
      if (typeof item === "string") return `<ul><li>${escapeHtml(item)}</li></ul>`;
      if (item.response === "multiple") return multipleChoiceField(item, form);
      return suicideRiskFields([item], form);
    }).join("")}
  </div>`;
}

function multipleChoiceField(item, form) {
  const values = Array.isArray(form[item.key]) ? form[item.key] : form[item.key] ? [form[item.key]] : [];
  const set = new Set(values);
  const otherInput = "";
  return `<div class="risk-fields">
    ${item.question ? `<p class="structured-question">${escapeHtml(item.question)}</p>` : ""}
    <div class="multi-choice-options">
      ${item.options.map(option => `
        <label class="${validationControlClass(item.key, option)}">
          <input type="checkbox" name="${item.key}" value="${escapeAttr(option)}" ${set.has(option) ? "checked" : ""} />
          ${escapeHtml(optionDisplayLabel(option))}${validationControlBadge(item.key, option)}
        </label>
      `).join("")}
    </div>
    ${otherInput}
  </div>`;
}

function suicideRiskFields(questions, form) {
  return `<div class="risk-fields">
    ${questions.map(item => item.response === "text" ? `
      <label class="risk-text">
        <b>${escapeHtml(item.label)}:</b> ${escapeHtml(item.question)}
        <textarea name="${item.key}" rows="2">${escapeHtml(form[item.key] || "")}</textarea>
      </label>
    ` : `
      <div class="risk-choice">
        <p><b>${escapeHtml(item.label)}:</b> ${escapeHtml(item.question)}</p>
        <div class="segmented-options">
          ${["SIM", "NAO"].map(option => `
            <label>
              <input type="radio" name="${item.key}" value="${option}" ${form[item.key] === option ? "checked" : ""} />
              ${option}
            </label>
          `).join("")}
        </div>
      </div>
    `).join("")}
  </div>`;
}

function chips(name, labelText, options, values = []) {
  const normalizedValues = Array.isArray(values) ? values : values ? [values] : [];
  const set = new Set(normalizedValues);
  return `<div><label>${labelText}</label><div class="chips">${options.map(option => `<label class="chip ${validationControlClass(name, option)}"><input type="checkbox" name="${name}" value="${escapeAttr(option)}" ${set.has(option) ? "checked" : ""}>${escapeHtml(optionDisplayLabel(option))}${validationControlBadge(name, option)}</label>`).join("")}</div></div>`;
}

function singleChoiceWithNotes(name, labelText, options, value = "") {
  const selectedValue = normalizedSingleChoiceValue(name, value);
  return `<div>
    <label>${labelText}</label>
    <div class="chips">
      ${options.map(option => `<label class="chip ${validationControlClass(name, option)}"><input type="radio" name="${name}" value="${escapeAttr(option)}" ${selectedValue === option ? "checked" : ""}>${escapeHtml(option)}${validationControlBadge(name, option)}</label>`).join("")}
    </div>
  </div>`;
}

function normalizedSingleChoiceValue(name, value) {
  const selected = valueList(value)[0] || "";
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

const optionDisplayLabels = {
  IN_PERSON: "Presencial",
  TELECONSULTATION: "Online",
  HYBRID: "Híbrida"
};

function optionDisplayLabel(option = "") {
  return optionDisplayLabels[option] || option;
}

function pagesForScope(scope) {
  return scope === "consultation" ? consultationPages : returnPages;
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


function validationItems(form = currentClinicalDraft()) {
  return Array.isArray(form?.controlValidations) ? form.controlValidations : [];
}

function validationItemFor(field, value, form = currentClinicalDraft()) {
  return validationItems(form).find(item => item.field === field && item.value === value);
}

function validationControlClass(field, value) {
  return "";
}

function validationControlBadge(field, value) {
  return "";
}

function mergeAiValidationItems(form = {}, items = []) {
  return [];
}

function setValidationDecision(id, state) {
  const target = currentClinicalDraft();
  const items = validationItems(target).map(item => item.id === id ? {
    ...item,
    state,
    doctorValue: state === "DOCTOR_REJECTED" ? null : (Array.isArray(target[item.field]) ? item.value : target[item.field]),
    decidedAt: new Date().toISOString()
  } : item);
  const decided = items.find(item => item.id === id);
  if (decided && Array.isArray(target[decided.field])) {
    const values = target[decided.field].filter(value => value !== decided.value);
    target[decided.field] = state === "DOCTOR_REJECTED" ? values : [...values, decided.value];
  } else if (decided && state === "DOCTOR_REJECTED" && target[decided.field] === decided.value) {
    target[decided.field] = "";
  } else if (decided && state === "DOCTOR_CONFIRMED" && !target[decided.field]) {
    target[decided.field] = decided.value;
  }
  target.controlValidations = items;
  render();
}

function validatedControlValues(field, values, form = currentClinicalDraft()) {
  return arrayValue(values);
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
      recordDoctorControlInteraction(event.target);
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

function recordDoctorControlInteraction(control) {
  if (!control?.name) return;
  const target = currentClinicalDraft();
  const item = validationItemFor(control.name, control.value, target)
    || validationItems(target).find(candidate => candidate.field === control.name && candidate.state === "AI_SUGGESTED");
  if (!item || item.state !== "AI_SUGGESTED") return;
  item.state = control.type === "checkbox"
    ? (control.checked ? "DOCTOR_CONFIRMED" : "DOCTOR_REJECTED")
    : (control.value === item.value ? "DOCTOR_CONFIRMED" : "DOCTOR_EDITED");
  item.doctorValue = item.state === "DOCTOR_REJECTED" ? null : control.value;
  item.decidedAt = new Date().toISOString();
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
      if (action === "validation-confirm") setValidationDecision(element.dataset.validationId, "DOCTOR_CONFIRMED");
      if (action === "validation-edit") setValidationDecision(element.dataset.validationId, "DOCTOR_EDITED");
      if (action === "validation-reject") setValidationDecision(element.dataset.validationId, "DOCTOR_REJECTED");
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
    const { result, sources, mode } = await requestClinicalAi("diagnosis", buildClinicalAiPrompt("diagnosis", context.target, context.patient, context.previous, context.isReturn), context.target?.aiMode, buildRagQuery("diagnosis", context.target));
    const localSuggestion = buildDiagnosticSuggestion(context.target || {});
    const localOptions = localSuggestion.diagnosticoAiOpcoes.split("\n").filter(Boolean);
    const formatGroup = (items, fallback, count) => [...(items || []).map(formatDiagnosticOption), ...fallback]
      .filter((option, index, list) => list.indexOf(option) === index).slice(0, count);
    const syndromicOptions = formatGroup(result.syndromic_options, localOptions, 3);
    const nosologicalOptions = formatGroup(result.nosological_options, localOptions, 3);
    const etiologicalOptions = formatGroup(result.etiological_options, localOptions, 2);
    const selectedDoctorOptions = selectedDiagnosisValues(target || {}).filter(option => doctorDiagnosisOptions.includes(option));
    const aiOptions = [...syndromicOptions, ...nosologicalOptions, ...etiologicalOptions];
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
      aiStatus: "3 hipóteses sindrômicas, 3 nosológicas e 2 etiológicas propostas para você assinalar. As hipóteses do médico foram mantidas.",
      controlValidations: mergeAiValidationItems(target || {}, aiOptions.map(option => ({
        field: "diagnosticoSelecionado", value: option, label: option, page: "diagnostico", evidence: "Dados clinicos informados nesta consulta"
      })))
    };
  } catch (error) {
    if (target?.aiMode === "rag") suggestion = { ragSources: [], aiStatus: `RAG indisponivel: ${error.message}` };
    else {
      const fallback = buildDiagnosticSuggestion(target || {});
      const fallbackOptions = [fallback.diagnosticoAiSindromico, fallback.diagnosticoAiNosologico, fallback.diagnosticoAiEtiologico].flatMap(value => String(value || "").split("\n").filter(Boolean));
      suggestion = {
        ...fallback,
        diagnosticoSelecionado: selectedDiagnosisValues(target || {}).filter(option => doctorDiagnosisOptions.includes(option)),
        controlValidations: mergeAiValidationItems(target || {}, fallbackOptions.map(option => ({ field: "diagnosticoSelecionado", value: option, label: option, page: "diagnostico", evidence: "Regra clinica local de contingencia" }))),
        aiStatus: "Hipóteses locais propostas como contingência, pendentes de revisão médica."
      };
    }
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
      tratamentoMedicamentosSelecionados: medicationOptions,
      abordagensSelecionadas: approachOptions,
      tratamentoMedicamentoso: "",
      abordagensTerapeuticas: "",
      examesLaboratoriais: requestedExamsText(target || {}),
      condutaMedica: target?.condutaMedica || "",
      ragSources: sources,
      pharmaAiMode: mode,
      treatmentStatus: "3 opções medicamentosas e 3 outras abordagens geradas para revisao individual.",
      aiStatus: "Sugestões de tratamento geradas pela IA para revisão médica.",
      controlValidations: mergeAiValidationItems(target || {}, [
        ...medicationOptions.map(option => ({ field: "tratamentoMedicamentosSelecionados", value: option, label: option, page: "tratamento", evidence: "Assistant/RAG" })),
        ...approachOptions.map(option => ({ field: "abordagensSelecionadas", value: option, label: option, page: "tratamento", evidence: "Assistant/RAG" }))
      ])
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
      controlValidations: mergeAiValidationItems(target || {}, [{ field: "evolution", value: text, label: "Trecho narrativo gerado pela IA", page: scope === "return" ? returnPage : "evolucao", evidence: "Dados validados e informados na consulta" }])
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

const ANAMNESIS_AI_FIELDS = {
  depressive_symptoms: ["depressaoSintomas", ["Desinteresse ou falta de prazer", "Desanimo ou desesperanca", "Cansaco ou falta de energia", "Dificuldade de concentracao", "Fala lenta", "Agitacao", "Baixa autoestima", "Sentimento de ruina", "Sentimento de estorvo para a familia"]],
  mania_hypomania: ["maniaHipomaniaSintomas", ["Nega sintomas relacionados", "Muito acelerado", "Com muita energia", "Falando mais", "Dormindo pouco", "Fazendo coisas impulsivas", "Outro"]],
  anxiety_symptoms: ["ansiedadeSintomas", ["Falta de controle", "Preocupacao excessiva", "Tensao corporal", "Dificuldade de focar", "Agitacao", "Irritabilidade", "Sintomas fisicos"]],
  sleep: ["sonoCaracteristicas", ["Sono reparador", "Sono nao reparador", "Dificuldade para adormecer", "Despertares noturnos", "Despertar precoce", "Dormir em excesso"]],
  appetite: ["apetiteCaracteristicas", ["Reducao do apetite", "Aumento do apetite", "Compulsao alimentar", "Perda de peso recente", "Ganho de peso recente"]],
  symptom_impact: ["impactoSintomas", ["Nenhuma", "Leve", "Moderado", "Grave", "Outro"]],
  substances_behaviors: ["usoSubstanciasComportamentos", ["Nicotina", "Alcool", "Cafeina", "Calmantes", "Estimulantes", "Cocaina", "Opioides", "Canabinoides", "Jogos de Azar", "Redes Sociais", "Compras Compulsivas", "Transtornos Alimentares"]],
  psychosis: ["psicoseSintomas", ["Nega sintomas relacionados", "Ideias de perseguicao", "Sensacao de estar sendo observado ou comentado", "Ideias de referencia", "Desconfianca excessiva", "Vozes ou ruidos sem fonte externa", "Visoes sem fonte externa", "Sensacoes tateis ou odores sem fonte externa", "Pensamento desorganizado", "Comportamento desorganizado", "Sensacao de controle ou interferencia no pensamento", "Outro"]],
  suicide_risk: ["riscoSuicidioIndicadores", ["Nega ideacao, plano ou intencao suicida", "Desesperanca", "Desejo de morrer ou de nao acordar", "Ideacao suicida", "Plano suicida definido", "Intencao suicida", "Acesso a meios potencialmente letais", "Comportamento preparatorio", "Tentativa de suicidio previa", "Autoagressao sem intencao suicida"]],
  previous_diagnoses: ["psiPrevios", optionGroups.psiPrevios],
  previous_treatments: ["tratamentos", optionGroups.tratamentos],
  family_history: ["familiares", optionGroups.familiares],
  worsening_factors: ["fatores", optionGroups.fatores],
  improving_factors: ["fatoresMelhora", optionGroups.fatoresMelhora],
  functional_impact: ["impacto", optionGroups.impacto]
};

const MENTAL_EXAM_AI_FIELDS = {
  appearance: "aparencia", attention: "atencao", orientation: "orientacao", memory: "memoria",
  perception: "sensopercepcao", thought_course: "pensamentoCursoForma", thought_content: "pensamentoConteudo",
  language: "linguagem", mood: "humor", affect: "afeto", psychomotor: "psicomotricidade",
  volition: "vontade", judgment: "juizoCritico"
};

function canonicalAiSelections(values, allowed = []) {
  const byNormalized = new Map(allowed.map(option => [normalizeText(option), option]));
  return arrayValue(values).map(value => byNormalized.get(normalizeText(value))).filter(Boolean);
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
  try {
    ({ result } = await requestClinicalAi(
      "refinement",
      buildClinicalAiPrompt("refinement", context.target, context.patient),
      "rag",
      buildRagQuery("refinement", context.target)
    ));
  } catch {
    result = localRefinementPlan(context.target);
  }
  draft.consultation = { ...(draft.consultation || {}), refinementPlan: result, refinementPreparedAt: new Date().toISOString() };
}

function localRefinementPlan(form = {}) {
  const hasRisk = arrayValue(form.riscoSuicidioIndicadores).some(value => !normalizeText(value).startsWith("nega"));
  return {
    questions: [
      { topic: "Duracao e controle", prompt: "A preocupacao ocorre na maioria dos dias e permanece dificil de controlar?", options: ["Sim", "Nao", "Parcialmente"], selection_mode: "single" },
      { topic: "Abrangencia", prompt: "Quais dominios concentram as preocupacoes?", options: ["Trabalho", "Familia", "Saude", "Financas", "Outros"], selection_mode: "multiple" },
      { topic: "Prejuizo funcional", prompt: "Qual o grau de prejuizo funcional atual?", options: ["Ausente", "Leve", "Moderado", "Grave"], selection_mode: "single" },
      { topic: "Substancias e causas clinicas", prompt: "Ha relacao temporal com cafeina, outras substancias, medicamentos ou condicao clinica?", options: ["Nao", "Cafeina", "Outra substancia", "Medicamento", "Condicao clinica", "Nao esclarecido"], selection_mode: "multiple" }
    ],
    red_flags: hasRisk ? [{ topic: "Risco suicida", reason: "Ha indicador de risco que exige confirmacao direta e plano de seguranca." }] : [],
    observations: [{ topic: "Sono", reason: "Esclarecer frequencia, latencia, despertares e impacto diurno." }],
    important_points: [{ topic: "Diagnosticos diferenciais", reason: "Confirmar ausencia de mania/hipomania, psicose, panico e causas relacionadas a substancias ou condicoes medicas." }]
  };
}

async function requestClinicalAi(kind, prompt, mode = "current", ragQuery = "") {
  const response = await fetch("/api/clinical-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, prompt, mode: mode === "rag" ? "rag" : "current", ragQuery })
  });
  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok) {
    const detail = data.detail ? ` ${compactText(data.detail, 320)}` : "";
    throw new Error(`${data.error || "Falha ao consultar o backend."}${detail}`);
  }
  const result = validateClinicalAiPayload(kind, data.result, data.text);
  return {
    result,
    text: data.text || clinicalAiTextFromResult(kind, result),
    sources: Array.isArray(data.sources) ? data.sources : [],
    mode: data.mode || "current"
  };
}

function buildRagQuery(kind, form = {}) {
  const diagnosis = treatmentDiagnosisText(form) || form.diagnosticoManual || "";
  const symptoms = [
    anamnesisText(form),
    joinValues(form.maniaHipomaniaSintomas),
    joinValues(form.ansiedadeSintomas),
    joinValues(form.depressaoSintomas),
    joinValues(form.psicoseSintomas),
    joinValues(form.riscoSuicidioIndicadores),
    mentalStateFindings(form).join("; ")
  ].filter(Boolean).join("; ");
  if (kind === "anamnesis") return `Semiologia psiquiatrica para entrevista diagnostica: cronologia, curso, polaridade do humor, sintomas depressivos e maniacos, ansiedade, sono, psicose, risco suicida, substancias, causas medicas, funcionamento e fatores de protecao. Dados da narrativa: ${symptoms}`.slice(0, 4000);
  if (kind === "refinement") return `Semiologia psiquiatrica para refinamento clinico: lacunas da anamnese, discriminacao entre sindromes, red flags, risco, psicose, bipolaridade, substancias, causas medicas, funcionamento e fatores de protecao. Dados ja registrados: ${symptoms}`.slice(0, 4000);
  if (kind === "treatment") return `Diretrizes e tratamento de ${diagnosis}. Dados clinicos relevantes: ${symptoms}`.slice(0, 4000);
  if (kind === "diagnosis") return `Criterios diagnosticos e diagnostico diferencial para: ${symptoms}`.slice(0, 4000);
  if (kind === "medication") return `Psicofarmacologia de ${form.medicationGeneric || ""}: dose inicial, titulacao, dose alvo, efeitos colaterais, contraindicacoes e interacoes. Contexto clinico: ${diagnosis}; ${symptoms}`.slice(0, 4000);
  return `${diagnosis}; ${symptoms}`.slice(0, 4000);
}

function validateClinicalAiPayload(kind, result, text = "") {
  if (!result && text) result = parseFallbackClinicalText(kind, text);
  if (!result || typeof result !== "object") throw new Error("Resposta estruturada ausente.");
  if (kind === "anamnesis") {
    ["chief_complaint", "hda", "medical_history"].forEach(key => {
      if (typeof result[key] !== "string") throw new Error("Anamnese narrativa fora do formato esperado.");
    });
  }
  if (kind === "mental_exam") {
    if (!Object.values(result).every(value => Array.isArray(value))) throw new Error("Exame psiquico fora do formato esperado.");
  }
  if (kind === "refinement") {
    if (!Array.isArray(result.questions) || result.questions.length < 3) throw new Error("Perguntas de refinamento ausentes.");
    ["red_flags", "observations", "important_points"].forEach(key => {
      if (!Array.isArray(result[key])) throw new Error("Bloco de refinamento fora do formato esperado.");
    });
  }
  if (kind === "diagnosis") {
    [["syndromic_options", 3], ["nosological_options", 3], ["etiological_options", 2]].forEach(([group, count]) => {
      if (!Array.isArray(result[group]) || result[group].length !== count) throw new Error(`O grupo ${group} exige exatamente ${count} opcoes.`);
      result[group].forEach(option => {
        if (!option?.name || !option?.cid11 || !option?.dsm5tr) throw new Error("Opcao diagnostica incompleta.");
      });
    });
  }
  if (kind === "treatment") {
    if (!Array.isArray(result.medication_options) || result.medication_options.length !== 3) throw new Error("O tratamento exige exatamente 3 opções medicamentosas.");
    if (!Array.isArray(result.non_pharmacological_options) || result.non_pharmacological_options.length !== 3) throw new Error("O tratamento exige exatamente 3 abordagens não farmacológicas.");
    result.medication_options.forEach(option => {
      ["medication", "initial_dose", "progression", "target_dose"].forEach(key => {
        if (typeof option?.[key] !== "string" || !option[key].trim()) throw new Error("Opção medicamentosa incompleta.");
      });
    });
    result.non_pharmacological_options.forEach(option => {
      ["approach", "details"].forEach(key => {
        if (typeof option?.[key] !== "string" || !option[key].trim()) throw new Error("Abordagem não farmacológica incompleta.");
      });
    });
  }
  if (kind === "evolution" && typeof result.markdown !== "string") throw new Error("Evolucao fora do formato esperado.");
  if (kind === "medication") {
    ["medication", "dose_progression", "side_effects", "notes"].forEach(key => {
      if (typeof result[key] !== "string") throw new Error("Medicamento fora do formato esperado.");
    });
  }
  return result;
}

function parseFallbackClinicalText(kind, text = "") {
  if (["anamnesis", "mental_exam", "refinement"].includes(kind)) return null;
  if (kind === "diagnosis") {
    const options = normalizeDiagnosticOptions(text, 8).map(line => {
      const [namePart, cidPart = "", dsmPart = ""] = line.split(/\s+-\s+/);
      return {
        name: stripFinalPeriod(namePart || ""),
        cid11: stripFinalPeriod(cidPart.replace(/^CID-?11:\s*/i, "")),
        dsm5tr: stripFinalPeriod(dsmPart.replace(/^DSM-?5-?TR:\s*/i, ""))
      };
    });
    return { syndromic_options: options.slice(0, 3), nosological_options: options.slice(3, 6), etiological_options: options.slice(6, 8) };
  }
  if (kind === "treatment") {
    const parsed = parseTreatmentResponse(text);
    return {
      medication_options: parsed.medicationOptions,
      non_pharmacological_options: parsed.approachOptions
    };
  }
  if (kind === "evolution") return { markdown: text };
  if (kind === "medication") {
    const parsed = parseMedicationResponse(text);
    return {
      medication: parsed.medicationNameText,
      dose_progression: parsed.medicationPresentation,
      side_effects: parsed.medicationSafety,
      notes: parsed.medicationBestUse
    };
  }
  return null;
}

function clinicalAiTextFromResult(kind, result) {
  if (kind === "anamnesis") return `QP: ${result.chief_complaint}\nHDA: ${result.hda}`;
  if (kind === "mental_exam") return Object.entries(result).map(([key, value]) => `${key}: ${joinValues(value)}`).join("\n");
  if (kind === "refinement") return result.questions.map(item => `${item.topic}: ${item.prompt}`).join("\n");
  if (kind === "diagnosis") {
    const formatGroup = (label, options) => `${label}:\n${options.map(formatDiagnosticOption).join("\n")}`;
    return [formatGroup("DIAGNOSTICO SINDROMICO", result.syndromic_options), formatGroup("DIAGNOSTICO NOSOLOGICO", result.nosological_options), formatGroup("DIAGNOSTICO ETIOLOGICO", result.etiological_options)].join("\n\n");
  }
  if (kind === "treatment") {
    return `TRATAMENTO MEDICAMENTOSO:\n${result.medication_options.map(formatMedicationTreatmentOption).join("\n")}\n\nOUTRAS ABORDAGENS NÃO FARMACOLÓGICAS:\n${result.non_pharmacological_options.map(formatNonPharmacologicalOption).join("\n")}`;
  }
  if (kind === "evolution") return result.markdown;
  if (kind === "medication") {
    return [
      `MEDICAMENTO:\n${result.medication}`,
      `DOSE INICIAL E PROGRESSAO:\n${result.dose_progression}`,
      `PRINCIPAIS EFEITOS COLATERAIS:\n${result.side_effects}`,
      `OBSERVACOES:\n${result.notes}`
    ].join("\n\n");
  }
  return "";
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

function buildClinicalAiPrompt(kind, form = {}, patient = {}, previous = null, isReturn = false) {
  const taskByKind = {
    anamnesis: [
      "Use a literatura de semiologia psiquiatrica recuperada pelo RAG como guia de cobertura, mas extraia somente informacoes explicitamente presentes na transcricao da conversa.",
      "A entrada e um dialogo bruto em ordem cronologica. Cada linha preserva o identificador do falante, mas os rotulos Falante A/B nao informam previamente quem e medico ou paciente; determine o papel pelo conteudo e pela sequencia conversacional.",
      "Perguntas do medico nao sao achados clinicos: nunca marque um sintoma apenas porque ele foi perguntado. Exija resposta afirmativa da paciente, relato espontaneo ou observacao explicita do medico.",
      "Interprete respostas curtas como sim, nao, as vezes e nao sei em conjunto com a pergunta imediatamente anterior.",
      "Quando houver correcao ou contradicao, a declaracao cronologicamente mais recente substitui a anterior. Preserve rigorosamente a diferenca entre quadro atual, episodio passado, antecedente familiar e hipotese apenas investigada.",
      "Organize a anamnese por queixa principal, cronologia e curso, sintomas nucleares e associados, polaridade depressiva/maníaca, ansiedade/pânico, sono, apetite, psicose, risco suicida, substâncias, causas médicas, antecedentes, funcionamento e fatores de proteção.",
      "Diferencie sintoma negado, sintoma presente e domínio não investigado; campo vazio significa dado não informado e nunca normalidade.",
      "Preencha queixa principal, HDA e campos estruturados da anamnese sem perder a narrativa temporal, intensidade, frequência, duração, gatilhos, fatores de melhora/piora e prejuízo funcional.",
      "Nao diagnostique, nao sugira tratamento e nao acrescente observacoes ao usuario.",
      `Nos campos de selecao, use exclusivamente estes rotulos canonicos: ${JSON.stringify(Object.fromEntries(Object.entries(ANAMNESIS_AI_FIELDS).map(([key, [, options]]) => [key, options])))}`
    ],
    mental_exam: [
      "Prepare uma sugestao estruturada de exame psiquico somente a partir da anamnese ja revisada pelo medico.",
      "Nao infira normalidade quando nao houver suporte; use arrays vazios quando o dominio nao puder ser avaliado.",
      "O medico revisara e alterara todas as selecoes antes de prosseguir.",
      `Use exclusivamente estes rotulos canonicos: ${JSON.stringify(Object.fromEntries(Object.entries(MENTAL_EXAM_AI_FIELDS).map(([key, formKey]) => [key, (optionGroups[formKey] || []).filter(option => option !== "NDN")])))}`
    ],
    refinement: [
      "Analise a anamnese revisada, o exame psiquico revisado e o exame fisico registrado.",
      "Crie de 3 a 8 perguntas objetivas de refinamento com opcoes de resposta, priorizando lacunas e discriminacao diagnostica.",
      "Liste red flags apenas quando sustentadas ou ainda nao esclarecidas; nao invente risco.",
      "Inclua observacoes e pontos importantes que merecem confirmacao antes do resumo.",
      "Nao gere diagnostico nem tratamento."
    ],
    diagnosis: [
      "Analise de forma integrada e nao superficial toda a anamnese, os antecedentes, o impacto funcional, os riscos e cada dominio preenchido do exame psiquico.",
      "Gere exatamente 3 hipoteses sindromicas, 3 hipoteses nosologicas e 2 hipoteses etiologicas.",
      "As hipoteses sindromicas devem descrever a sindrome clinica; as nosologicas devem propor transtornos/diagnosticos; as etiologicas devem propor causas medicas, substancias ou contextos causais quando sustentados pelos dados.",
      "As hipoteses sao mero auxilio ao psiquiatra e nao substituem avaliacao, confirmacao de criterios, exame clinico ou decisao medica.",
      "Cada opcao deve conter nome, CID-11 e DSM-5-TR no formato estruturado solicitado. Para hipoteses sindromicas ou etiologicas sem codigo especifico, informe 'N/A' de forma explicita."
    ],
    treatment: [
      "Gere exatamente 3 opcoes de abordagem medicamentosa: primeira opcao, segunda opcao e uma opcao off-label, exclusivamente com dados do Assistant da IA atual ou do RAG com literatura.",
      "Para cada opcao informe medicamento, dose inicial, progressao/titulacao e dose final ou dose-alvo.",
      "Gere exatamente 3 abordagens nao farmacologicas ou alternativas, com uma orientacao objetiva para cada uma.",
      "Considere as hipoteses escolhidas e os dados clinicos informados, incluindo riscos, comorbidades, substancias e exame psiquico. Nao invente dados.",
      "Sinalize necessidade de verificacao medica de contraindicações, interacoes, gestacao, funcao renal/hepatica e monitorizacao quando pertinente."
    ],
    evolution: [
      "Redija uma evolucao medica narrativa-descritiva, formal, tecnica, cientifica, objetiva e concisa.",
      "Use linguagem denotativa, literal e precisa, em terceira pessoa do singular ou na voz passiva.",
      "Organize os fatos em ordem cronologica e valorize tanto os achados registrados quanto as ausencias explicitamente documentadas.",
      "Diferencie negacao expressa de dado nao preenchido: nunca presuma normalidade ou ausencia de sintoma a partir de um campo vazio.",
      "Produza texto corrido em paragrafos, sem listas, titulos, nomes de campos, Markdown ou asteriscos.",
      "Inicie diretamente pelo nome, sem usar a palavra Paciente: [nome], [idade] anos, [estado civil], [religiao], [grau de instrucao], [ocupacao].",
      "Registre a situacao laboral exclusivamente como Em atividade ou No momento, afastado do trabalho, conforme os dados.",
      "Nao utilize em nenhuma parte as expressoes Durante o rastreio, No rastreio ou Quanto ao. Descreva os achados diretamente.",
      "Apresente o exame em um novo paragrafo iniciado por: No exame psiquico, apresenta-se [...].",
      "Elimine repeticoes e palavras desnecessarias, sem omitir dados clinicamente relevantes.",
      "No exame psiquico, descreva os achados de forma direta e integrada ao texto.",
      "Use apenas as hipoteses assinaladas pelo psiquiatra.",
      "Finalize com o tratamento efetivamente selecionado ou registrado: medicamentos, medidas nao farmacologicas, ajustes do medico e exames solicitados. Omita categorias sem registro."
    ],
    medication: [
      `Preencha somente os campos solicitados sobre o medicamento informado: ${form.medicationGeneric || "nao informado"}.`,
      "Seja objetivo e nao inclua preco, links, indicacoes extensas ou cabecalhos adicionais.",
      "Use linguagem clinica resumida para prontuario."
    ]
  };
  const task = taskByKind[kind] || taskByKind.evolution;
  return [
    "Voce e um assistente especializado em psiquiatria, documentacao medica e prontuario eletronico.",
    "Responda em portugues do Brasil, com linguagem tecnica, clara, objetiva e utilizavel em prontuario.",
    "Nao invente dados. Quando algo nao estiver informado, sinalize como dado ausente ou necessidade de confirmacao.",
    "",
    "TAREFA:",
    ...task.map(item => `- ${item}`),
    "",
    "DADOS DO PACIENTE E DA CONSULTA:",
    kind === "evolution"
        ? clinicalEvolutionPromptData(form, patient, previous, isReturn)
        : kind === "medication"
          ? `Medicamento pesquisado: ${form.medicationGeneric || "nao informado"}.\n${clinicalPromptData(form, patient, previous, isReturn)}`
          : clinicalPromptData(form, patient, previous, isReturn),
    "",
    "FORMATO DA RESPOSTA:",
    promptResponseFormat(kind)
  ].join("\n");
}

function clinicalEvolutionPromptData(form = {}, patient = {}, previous = null, isReturn = false) {
  return [
    `Identidade: ${conciseIdentityText(patient)}.`,
    `Queixa principal: ${conciseComplaintText(form, isReturn)}.`,
    `HDA: ${conciseHdaText(form, previous, isReturn)}.`,
    `Antecedentes: ${conciseAntecedentsText(form)}.`,
    `Exame psiquico: ${conciseMentalExamText(form)}.`,
    `HD/Hipoteses assinaladas: ${conciseDiagnosticText(form)}.`,
    `Tratamento medicamentoso selecionado: ${professionalSelectedTreatmentItems(form.tratamentoMedicamentosSelecionados, form.tratamentoMedicamentoso) || "nao informado"}.`,
    `Medidas nao farmacologicas selecionadas: ${professionalSelectedTreatmentItems(form.abordagensSelecionadas, form.abordagensTerapeuticas) || "nao informado"}.`,
    `Preenchimento pelo medico: ${cleanClinicalLine(form.condutaMedica || "") || "nao informado"}.`,
    `Exames solicitados: ${cleanClinicalLine(requestedExamsText(form) || form.examesLaboratoriais || "") || "nao informado"}.`
  ].join("\n");
}

function clinicalPromptData(form = {}, patient = {}, previous = null, isReturn = false) {
  return [
    `Identificacao: ${patientIdentificationText(patient, true)}`,
    `Tipo de atendimento: ${isReturn ? "retorno" : "consulta inicial/nova consulta"}.`,
    previous ? `Registro anterior: ${new Date(previous.createdAt || Date.now()).toLocaleDateString("pt-BR")} - ${stripFinalPeriod(normalizeEvolutionNarrative(previous.evolution) || anamnesisText(previous) || previous.observacoesRetorno || "")}.` : "",
    `QP/HDA: ${stripFinalPeriod(anamnesisText(form)) || "nao informado"}.`,
    `Fatores associados/desencadeantes: ${joinWithOutro(form.fatores, form.fatoresOutro) || "nao informado"}.`,
    `Fatores de melhora: ${joinWithOutro(form.fatoresMelhora, form.fatoresMelhoraOutro) || "nao informado"}.`,
    `Impacto funcional: ${joinValues(form.impacto) || "nao informado"}.`,
    `Rastreio de mania/hipomania: ${joinWithOutro(form.maniaHipomaniaSintomas, form.maniaHipomaniaSintomasOutro) || "nao informado"}.`,
    `Rastreio de ansiedade: ${joinValues(form.ansiedadeSintomas) || choiceSummary(form, ["ansiedadeFaltaControle", "ansiedadePreocupacaoExcessiva", "ansiedadeTensaoCorporal", "ansiedadeDificuldadeFocar", "ansiedadeAgitacao", "ansiedadeIrritabilidade", "ansiedadeSintomasFisicos"]) || "nao informado"}.`,
    `Sono: ${joinValues(form.sonoCaracteristicas) || choiceSummary(form, ["sonoReparador", "depressaoSono"]) || "nao informado"}.`,
    `Apetite e peso: ${joinValues(form.apetiteCaracteristicas) || choiceSummary(form, ["apetiteAlterado", "depressaoApetite"]) || "nao informado"}.`,
    `Rastreio depressivo: ${joinValues(form.depressaoSintomas) || choiceSummary(form, ["depressaoPoucoInteressePrazer", "depressaoDesanimoDesesperanca", "depressaoEnergia", "depressaoApetite", "depressaoConcentracao", "depressaoFalaLenta", "depressaoAgitacao", "depressaoAutoestimaRuinaEstorvo"]) || "nao informado"}.`,
    `Rastreio psicotico e paranoia: ${joinWithOutro(form.psicoseSintomas, form.psicoseSintomasOutro) || choiceSummary(form, ["sintomasPsicoticosParanoiaObservado", "sintomasPsicoticosVozesRuidos"]) || form.sintomasPsicoticosOutro || "nao informado"}.`,
    `Risco suicida: ${joinValues(form.riscoSuicidioIndicadores) || choiceSummary(form, ["riscoSuicidioIdeacao", "riscoSuicidioPlanejamento", "riscoSuicidioMeios", "riscoSuicidioTentativasPrevias"]) || "nao informado"}.`,
    `O que impede a acao hoje: ${stripFinalPeriod(form.riscoSuicidioRazoesViver || "") || "nao informado"}.`,
    `Razoes para viver: ${stripFinalPeriod(form.riscoSuicidioRazoesParaViver || "") || "nao informado"}.`,
    `Antecedentes psiquiatricos: ${joinWithOutro(form.psiPrevios, form.psiPreviosOutro) || "nao informado"}.`,
    `Tratamentos previos: ${joinWithOutro(form.tratamentos, form.tratamentosOutro) || "nao informado"}.`,
    `Antecedentes medicos: ${joinWithOutro(form.medicos, form.medicosOutro) || "nao informado"}.`,
    `Antecedentes familiares: ${joinWithOutro(form.familiares, form.familiaresOutro) || "nao informado"}.`,
    `Substancias/habitos: ${joinWithOutro(form.substancias, form.substanciasOutro) || joinWithOutro(form.usoSubstanciasComportamentos, form.usoSubstanciasComportamentosOutro) || "nao informado"}.`,
    `Exame psiquico: ${mentalStateFindings(form).length ? formatClinicalList(mentalStateFindings(form)) : "nao informado"}.`,
    `Hipoteses diagnosticas selecionadas/acrescentadas: ${stripFinalPeriod(treatmentDiagnosisText(form)) || stripFinalPeriod(form.diagnosticoManual || "") || "nao informado"}.`,
    `Diagnostico registrado: ${stripFinalPeriod(form.diagnosticoManual || "") || "nao informado"}.`,
    `Diferenciais registrados: ${stripFinalPeriod(form.diferenciais || "") || "nao informado"}.`,
    `Tratamento medicamentoso: ${stripFinalPeriod(form.tratamentoMedicamentoso || form.conduta || "") || "nao informado"}.`,
    `Outras abordagens terapeuticas: ${stripFinalPeriod(form.abordagensTerapeuticas || "") || "nao informado"}.`,
    `Exames solicitados: ${stripFinalPeriod(requestedExamsText(form) || form.examesLaboratoriais || "") || "nao informado"}.`,
    `Conduta medica: ${stripFinalPeriod(form.condutaMedica || "") || "nao informado"}.`,
    isReturn ? `Dados de retorno: ${stripFinalPeriod(returnStoryText(form, previous)) || "nao informado"}.` : ""
  ].filter(Boolean).join("\n");
}

function choiceSummary(form, keys = []) {
  return keys
    .map(key => form[key] ? `${key}: ${form[key]}` : "")
    .filter(Boolean)
    .join("; ");
}

function promptResponseFormat(kind) {
  if (kind === "anamnesis") return "Objeto estruturado de anamnese conforme o schema, sem texto adicional.";
  if (kind === "mental_exam") return "Objeto estruturado do exame psiquico conforme o schema, sem texto adicional.";
  if (kind === "refinement") return "Objeto estruturado com perguntas, red flags, observacoes e pontos importantes, sem texto adicional.";
  if (kind === "diagnosis") {
    return [
      "DIAGNOSTICO SINDROMICO:",
      "Hipotese sindromica 1 - CID-11: ... - DSM-5-TR: ...",
      "Hipotese sindromica 2 - CID-11: ... - DSM-5-TR: ...",
      "Hipotese sindromica 3 - CID-11: ... - DSM-5-TR: ...",
      "",
      "DIAGNOSTICO NOSOLOGICO:",
      "Hipotese nosologica 1 - CID-11: ... - DSM-5-TR: ...",
      "Hipotese nosologica 2 - CID-11: ... - DSM-5-TR: ...",
      "Hipotese nosologica 3 - CID-11: ... - DSM-5-TR: ...",
      "",
      "DIAGNOSTICO ETIOLOGICO:",
      "Hipotese etiologica 1 - CID-11: ... - DSM-5-TR: ...",
      "Hipotese etiologica 2 - CID-11: ... - DSM-5-TR: ..."
    ].join("\n");
  }
  if (kind === "treatment") {
    return [
      "TRATAMENTO MEDICAMENTOSO:",
      "Medicamento | Dose inicial: ... | Progressao: ... | Dose final: ...",
      "(exatamente 3 opcoes)",
      "",
      "OUTRAS ABORDAGENS NAO FARMACOLOGICAS:",
      "Abordagem | Orientacao objetiva",
      "(exatamente 3 opcoes)"
    ].join("\n");
  }
  if (kind === "medication") {
    return [
      "MEDICAMENTO: (repita exatamente o nome informado em 'Medicamento pesquisado')",
      "",
      "DOSE INICIAL E PROGRESSAO:",
      "",
      "PRINCIPAIS EFEITOS COLATERAIS:",
      "",
      "OBSERVACOES:"
    ].join("\n");
  }
  return [
    "Texto corrido, narrativo-descritivo e cronologico, em paragrafos clinicos.",
    "Nao use titulos, listas, nomes de campos, Markdown ou asteriscos.",
    "Registre de forma impessoal os achados presentes, as negacoes expressas e os dados ausentes, sem inferir normalidade."
  ].join("\n");
}

function diagnosticSyndromicOptionLines(form = {}) { return normalizeDiagnosticOptions(form.diagnosticoAiSindromico || form.diagnosticoAiOpcoes || "", 3); }
function diagnosticNosologicalOptionLines(form = {}) { return normalizeDiagnosticOptions(form.diagnosticoAiNosologico || form.diagnosticoAiOutrasOpcoes || "", 3); }
function diagnosticEtiologicalOptionLines(form = {}) { return normalizeDiagnosticOptions(form.diagnosticoAiEtiologico || "", 2); }

function selectedDiagnosisValues(form = {}) {
  const values = Array.isArray(form.diagnosticoSelecionado)
    ? form.diagnosticoSelecionado
    : form.diagnosticoSelecionado
      ? [form.diagnosticoSelecionado]
      : [];
  return values.filter(Boolean);
}

function selectedDiagnosisText(form = {}) {
  return selectedDiagnosisValues(form).join("\n");
}

function normalizeDiagnosticOptions(value = "", limit = 5) {
  const lines = String(value || "")
    .split(/\r?\n/)
    .map(line => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .filter(line => !/^hipotese principal|^justificativa|^diagnosticos diferenciais|^dados ausentes|^alertas/i.test(normalizeText(line)));
  return lines.slice(0, limit);
}

function updateSelectedDiagnosisFromForm(form) {
  const scope = view === "return" ? "return" : "consultation";
  const selected = Array.from(form.querySelectorAll("input[name='diagnosticoSelecionado']:checked")).map(item => item.value);
  const selectedText = validatedControlValues("diagnosticoSelecionado", selected).join("\n");
  const update = {
    diagnosticoSelecionado: selected,
    diagnosticoSelecionadoResumo: selectedText,
    diagnosticoManual: selectedText
  };
  if (scope === "return") draft.return = { ...(draft.return || {}), ...update };
  else draft.consultation = { ...(draft.consultation || {}), ...update };
}

function formatDiagnosticOption(item) {
  return `${item.name} - CID-11: ${item.cid11} - DSM-5-TR: ${item.dsm5tr}`;
}

function buildDiagnosticSuggestion(form) {
  const qphdaText = anamnesisText(form);
  const sourceText = [
    qphdaText, form.fatoresOutro,
    joinValues(form.fatores), joinValues(form.fatoresMelhora), joinValues(form.impacto),
    joinValues(form.psiPrevios), joinValues(form.tratamentos), joinValues(form.medicos), joinValues(form.familiares), joinValues(form.substancias),
    joinValues(form.aparencia), joinValues(form.consciencia), joinValues(form.atencao), joinValues(form.orientacao), joinValues(form.memoria), joinValues(form.sensopercepcao),
    joinValues(form.pensamentoCursoForma), joinValues(form.pensamentoConteudo), joinValues(form.linguagem),
    joinValues(form.humor), joinValues(form.afeto), joinValues(form.psicomotricidade), joinValues(form.vontade), joinValues(form.juizoCritico),
    form.observacoesRetorno
  ].filter(Boolean).join(" | ");
  const text = normalizeText(sourceText);
  const matches = diagnosticRules()
    .map(rule => ({ ...rule, score: rule.terms.reduce((sum, term) => sum + (text.includes(term) ? 1 : 0), 0) }))
    .filter(rule => rule.score > 0)
    .sort((a, b) => b.score - a.score);
  const ranked = matches.length ? matches : diagnosticRules();
  const options = [
    ...ranked,
    ...diagnosticRules().filter(rule => !ranked.some(item => item.name === rule.name))
  ].slice(0, 8);
  const selectedDoctorOptions = selectedDiagnosisValues(form).filter(option => doctorDiagnosisOptions.includes(option));
  return {
    diagnosticoAiSindromico: options.slice(0, 3).map(formatDiagnosticOption).join("\n"),
    diagnosticoAiNosologico: options.slice(3, 6).map(formatDiagnosticOption).join("\n"),
    diagnosticoAiEtiologico: options.slice(6, 8).map(formatDiagnosticOption).join("\n"),
    diagnosticoAiOpcoes: options.slice(0, 3).map(formatDiagnosticOption).join("\n"),
    diagnosticoAiOutrasOpcoes: options.slice(3, 6).map(formatDiagnosticOption).join("\n"),
    diagnosticoSelecionado: selectedDoctorOptions,
    diagnosticoManual: selectedDoctorOptions.join("\n"),
    diferenciais: ""
  };
}

async function buildMedicationAutofill(typedName = "") {
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

function localMedicationSuggestions(term = "") {
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

function compactText(value, maxLength = 900) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

function treatmentDiagnosisText(form = {}) {
  return [
    selectedDiagnosisText(form),
    stripFinalPeriod(form.diagnosticoObservacaoMedica || "")
  ].filter(Boolean).join("\n");
}

function parseTreatmentResponse(text = "") {
  const clean = String(text || "").trim();
  const medMatch = clean.match(/TRATAMENTO MEDICAMENTOSO:\s*([\s\S]*?)(?:\n\s*OUTRAS ABORDAGENS(?: NÃO FARMACOLÓGICAS)?:|$)/i);
  const therapyMatch = clean.match(/OUTRAS ABORDAGENS(?: NÃO FARMACOLÓGICAS)?:\s*([\s\S]*)$/i);
  const medicationOptions = treatmentOptionLines(medMatch?.[1]).slice(0, 3).map(line => {
    const parts = line.split(/\s*\|\s*/);
    return {
      medication: parts[0] || "",
      initial_dose: (parts[1] || "").replace(/^Dose inicial:\s*/i, ""),
      progression: (parts[2] || "").replace(/^Progress[aã]o:\s*/i, ""),
      target_dose: (parts[3] || "").replace(/^Dose final:\s*/i, "")
    };
  });
  const approachOptions = treatmentOptionLines(therapyMatch?.[1]).slice(0, 3).map(line => {
    const parts = line.split(/\s*\|\s*/);
    return { approach: parts[0] || "", details: parts.slice(1).join(" | ") };
  });
  return {
    medicationOptions,
    approachOptions
  };
}

function formatMedicationTreatmentOption(option = {}) {
  return `${option.medication} | Dose inicial: ${option.initial_dose} | Progressão: ${option.progression} | Dose final: ${option.target_dose}`;
}

function formatNonPharmacologicalOption(option = {}) {
  return `${option.approach} | ${option.details}`;
}

function updateSelectedTreatmentFromForm(form) {
  const medicationValues = [...form.querySelectorAll("input[name='tratamentoMedicamentosSelecionados']:checked")].map(input => input.value);
  const approachValues = [...form.querySelectorAll("input[name='abordagensSelecionadas']:checked")].map(input => input.value);
  const target = currentClinicalDraft();
  if (!target) return;
  target.tratamentoMedicamentosSelecionados = medicationValues;
  target.abordagensSelecionadas = approachValues;
  target.tratamentoMedicamentoso = validatedControlValues("tratamentoMedicamentosSelecionados", medicationValues, target).join("\n");
  target.abordagensTerapeuticas = validatedControlValues("abordagensSelecionadas", approachValues, target).join("\n");
}

function parseMedicationResponse(text = "") {
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

function buildEvolutionNarrative(form, patient = {}, previous = null, isReturn = false) {
  const complaint = stripFinalPeriod(conciseComplaintText(form, isReturn));
  const history = stripFinalPeriod(conciseHdaText(form, previous, isReturn));
  const structuredAnamnesis = isReturn ? "" : professionalStructuredAnamnesisText(form);
  const antecedents = evolutionAntecedentsText(form);
  const mentalFindings = mentalStateFindings(form);
  const diagnosis = selectedDiagnosisText(form) || form.diagnosticoSelecionadoResumo || form.diagnosticoManual || "";
  const treatment = professionalTreatmentText(form, isReturn);

  const opening = isReturn
    ? (history ? `${history}.` : "")
    : [
      `${evolutionPatientIdentification(patient)}.`,
      `Apresenta queixa de ${lowerFirst(professionalClinicalTerms(complaint))}.`,
      history && normalizeText(history) !== normalizeText(complaint) ? professionalHistorySentence(history) : ""
    ].filter(Boolean).join(" ");

  return normalizeEvolutionNarrative([
    opening,
    structuredAnamnesis,
    antecedents,
    mentalFindings.length ? `No exame psíquico, apresenta ${formatPlainList(mentalFindings.map(professionalMentalFinding))}.` : "",
    diagnosis ? `Consideram-se as hipóteses diagnósticas assinaladas de ${stripFinalPeriod(diagnosis)}.` : "",
    treatment
  ].filter(Boolean).join("\n\n"));
}

function professionalTreatmentText(form = {}, isReturn = false) {
  const medications = professionalSelectedTreatmentItems(form.tratamentoMedicamentosSelecionados, form.tratamentoMedicamentoso);
  const approaches = professionalSelectedTreatmentItems(form.abordagensSelecionadas, form.abordagensTerapeuticas);
  const returnMedicationActions = professionalListWithOther(
    form.condutaMedicamentoRetorno,
    form.condutaMedicamentoRetornoOutro
  );
  const physicianPlan = professionalClinicalTerms(stripFinalPeriod(form.condutaMedica || ""));
  const selectedExams = professionalClinicalTerms(requestedExamsText(form) || form.examesLaboratoriais || "");
  const sentences = [
    medications ? `O tratamento medicamentoso selecionado inclui ${lowerFirst(medications)}.` : "",
    approaches ? `Como medidas não farmacológicas, foram selecionadas ${lowerFirst(approaches)}.` : "",
    isReturn && returnMedicationActions ? `A conduta medicamentosa definida no retorno inclui ${lowerFirst(returnMedicationActions)}.` : "",
    physicianPlan ? `A conduta médica registrada consiste em ${lowerFirst(physicianPlan)}.` : "",
    selectedExams ? `Foram solicitados ${lowerFirst(selectedExams)}.` : ""
  ].filter(Boolean);
  return sentences.join(" ");
}

function professionalSelectedTreatmentItems(selected, fallback = "") {
  const values = arrayValue(selected);
  const items = values.length ? values : treatmentOptionLines(fallback);
  return formatPlainList(items.map(item => professionalClinicalTerms(stripFinalPeriod(item))
    .replace(/\s*\|\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim()));
}

function evolutionPatientIdentification(patient = {}) {
  const age = calculateAge(patient.nascimento);
  const rawOccupation = String(patient.ocupacao || "").replace(/\s*[—-]\s*dado fictício\s*$/i, "").trim();
  const isAwayFromWork = /\bafastad[oa]\b/i.test(rawOccupation);
  const occupation = rawOccupation.replace(/\bafastad[oa]\b/i, "").replace(/\s+/g, " ").trim();
  const details = [
    age ? `${age} anos` : "",
    patient.estadoCivil ? genderedCivilStatus(patient.estadoCivil, patient.sexo) : "",
    patient.religiao ? lowerFirst(professionalReligion(patient.religiao)) : "",
    patient.escolaridade ? lowerFirst(professionalEducation(patient.escolaridade)) : "",
    occupation ? lowerFirst(occupation) : ""
  ].filter(Boolean);
  const name = patient.nome?.trim() || "Nome não informado";
  const identification = `${name}${details.length ? `, ${details.join(", ")}` : ""}`;
  const workStatus = occupation
    ? (isAwayFromWork ? "No momento, afastado do trabalho" : "Em atividade")
    : "";
  return [
    identification,
    workStatus
  ].filter(Boolean).join(". ");
}

function professionalEducation(value = "") {
  return professionalClinicalTerms(value)
    .replace(/^fundamental\b/i, "ensino fundamental")
    .replace(/^medio\b/i, "ensino médio")
    .replace(/^superior\b/i, "ensino superior")
    .replace(/\bpos-graduacao\b/gi, "pós-graduação");
}

function professionalReligion(value = "") {
  return professionalClinicalTerms(value)
    .replace(/\bsem religiao\b/gi, "sem religião")
    .replace(/\bcatolica\b/gi, "católica")
    .replace(/\bagnostico\b/gi, "agnóstico");
}

function evolutionAntecedentsText(form = {}) {
  const psychiatric = professionalClinicalTerms(joinWithOutro(form.psiPrevios, form.psiPreviosOutro));
  const treatments = professionalClinicalTerms(joinWithOutro(form.tratamentos, form.tratamentosOutro));
  const medical = professionalClinicalTerms(joinWithOutro(form.medicos, form.medicosOutro));
  const family = professionalClinicalTerms(joinWithOutro(form.familiares, form.familiaresOutro));
  const substances = professionalClinicalTerms(joinWithOutro(form.substancias, form.substanciasOutro));
  const addictive = professionalClinicalTerms(joinWithOutro(form.usoSubstanciasComportamentos, form.usoSubstanciasComportamentosOutro));
  const parts = [
    psychiatric ? `Apresenta antecedentes psiquiátricos de ${lowerFirst(psychiatric)}.` : "",
    treatments ? `Realizou tratamentos prévios com ${lowerFirst(treatments)}.` : "",
    medical ? (/^nega\b/i.test(medical) ? `${capitalizeFirst(stripFinalPeriod(medical))}.` : `Apresenta antecedentes médicos de ${lowerFirst(medical)}.`) : "",
    family ? `Há antecedentes familiares de ${lowerFirst(family)}.` : "",
    substances ? `Relata hábitos ou uso de substâncias relacionados a ${lowerFirst(substances)}.` : "",
    addictive ? `Foram registrados hábitos, substâncias ou comportamentos aditivos: ${lowerFirst(addictive)}.` : ""
  ].filter(Boolean);
  return parts.join(" ");
}

function professionalStructuredAnamnesisText(form = {}) {
  const mania = professionalListWithOther(form.maniaHipomaniaSintomas, form.maniaHipomaniaSintomasOutro);
  const sleep = professionalList(form.sonoCaracteristicas);
  const appetite = professionalList(form.apetiteCaracteristicas);
  const depression = professionalList(form.depressaoSintomas);
  const psychosis = professionalListWithOther(form.psicoseSintomas, form.psicoseSintomasOutro);
  const risks = professionalList(form.riscoSuicidioIndicadores);
  const factors = professionalClinicalTerms(joinWithOutro(form.fatores, form.fatoresOutro));
  const improvements = professionalClinicalTerms(joinWithOutro(form.fatoresMelhora, form.fatoresMelhoraOutro));
  const impact = professionalList(form.impacto);
  const parts = [
    mania ? (/nega sintomas relacionados/i.test(mania)
      ? "Nega sintomas relacionados à ativação do humor."
      : `Relata sintomas de ativação do humor: ${lowerFirst(mania)}.`) : "",
    sleep ? `Relata ${lowerFirst(sleep)}.` : "",
    appetite ? `Apresenta ${lowerFirst(appetite)}.` : "",
    depression ? `Apresenta ${lowerFirst(depression)}.` : "",
    psychosis ? `Apresenta ${lowerFirst(psychosis)}.` : "",
    risks ? (/nega ideação, plano ou intenção suicida/i.test(risks)
      ? "Nega ideação, plano ou intenção suicida."
      : `Apresenta ${lowerFirst(risks)}.`) : "",
    form.riscoSuicidioRazoesViver ? protectiveFactorSentence(form.riscoSuicidioRazoesViver) : "",
    form.riscoSuicidioRazoesParaViver ? `As razões para viver incluem ${lowerFirst(professionalClinicalTerms(stripFinalPeriod(form.riscoSuicidioRazoesParaViver)))}.` : "",
    factors ? (normalizeText(factors).includes("sem fator claro")
      ? "O quadro não apresenta associação com fator desencadeante claro."
      : `O quadro apresenta associação com ${lowerFirst(factors)}.`) : "",
    improvements ? improvementSentence(improvements) : "",
    impact ? `Há impacto funcional, com ${lowerFirst(impact).replace(/prejuízo social e prejuízo familiar/i, "prejuízo social e familiar")}.` : ""
  ].filter(Boolean);
  return parts.join(" ");
}

function professionalHistorySentence(value = "") {
  let history = professionalClinicalTerms(stripFinalPeriod(value));
  history = history.replace(/^Evolução insidiosa\b/i, "A evolução dos sintomas foi insidiosa");
  history = history.replace(/^Evolução gradual\b/i, "A evolução dos sintomas foi gradual");
  return `${capitalizeFirst(history)}.`;
}

function professionalMentalFinding(value = "") {
  return professionalClinicalTerms(value)
    .replace(/^consciente$/i, "consciência preservada")
    .replace(/^orientado no tempo e no espaço$/i, "orientação no tempo e no espaço")
    .replace(/^com funções mnésicas preservadas$/i, "funções mnésicas preservadas")
    .replace(/^restrito\/aplanado$/i, "restrição/aplanamento afetivo")
    .replace(/^crítica parcial$/i, "crítica parcialmente preservada");
}

function professionalList(value) {
  return formatPlainList(valueList(value).map(item => lowerFirst(professionalClinicalTerms(item))));
}

function professionalListWithOther(value, otherValue = "") {
  return formatPlainList([
    ...valueList(value).filter(item => normalizeText(item) !== "outro"),
    otherValue
  ].filter(Boolean).map(item => lowerFirst(professionalClinicalTerms(item))));
}

function formatPlainList(items = []) {
  const cleanItems = uniqueValues(items.map(item => String(item || "").trim()).filter(Boolean));
  if (cleanItems.length <= 1) return cleanItems[0] || "";
  if (cleanItems.length === 2) return `${cleanItems[0]} e ${cleanItems[1]}`;
  return `${cleanItems.slice(0, -1).join(", ")} e ${cleanItems.at(-1)}`;
}

function protectiveFactorSentence(value = "") {
  const text = professionalClinicalTerms(stripFinalPeriod(value));
  if (/^nega ideação ou intenção suicida;\s*mantém vínculo e supervisão familiar$/i.test(text)) {
    return "Como fatores protetivos, registram-se a ausência de ideação ou intenção suicida e a manutenção de vínculo e supervisão familiar.";
  }
  return `Como fator protetivo, registra-se ${lowerFirst(text)}.`;
}

function professionalClinicalTerms(value = "") {
  return PROFESSIONAL_TERM_REPLACEMENTS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    String(value || "")
  );
}

function genderedCivilStatus(value = "", sex = "") {
  const normalizedSex = normalizeText(sex);
  if (!/\(a\)/i.test(value)) return value.toLowerCase();
  if (normalizedSex === "feminino") return value.replace(/\(a\)/i, "a").toLowerCase();
  if (normalizedSex === "masculino") return value.replace(/\(a\)/i, "").toLowerCase();
  return value.toLowerCase();
}

function capitalizeFirst(value = "") {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : "";
}

function conciseIdentityText(patient = {}) {
  return stripFinalPeriod(patientIdentificationText(patient, true)) || "Paciente com dados de identificação não preenchidos";
}

function conciseComplaintText(form = {}, isReturn = false) {
  if (isReturn) return stripFinalPeriod(
    joinWithOutro(form.evolucaoClinicaRetorno, form.evolucaoClinicaRetornoOutro)
    || form.sintomasPrincipais
    || form.observacoesRetorno
    || "Queixa de retorno não informada"
  );
  const qphda = anamnesisText(form);
  return cleanClinicalLine(form.queixa || firstLineFromQphda(qphda) || "Queixa principal não informada");
}

function conciseHdaText(form = {}, previous = null, isReturn = false) {
  if (isReturn) return cleanClinicalLine(returnStoryText(form, previous) || "História do retorno não informada");
  const qphda = anamnesisText(form);
  const story = form.historia || remainingQphdaText(qphda, form.queixa);
  return cleanClinicalLine(story || "História da doença atual não informada");
}

function conciseAntecedentsText(form = {}) {
  const parts = [
    joinWithOutro(form.psiPrevios, form.psiPreviosOutro) ? `antecedentes psiquiátricos de ${lowerFirst(joinWithOutro(form.psiPrevios, form.psiPreviosOutro))}` : "",
    joinWithOutro(form.tratamentos, form.tratamentosOutro) ? `tratamentos prévios com ${lowerFirst(joinWithOutro(form.tratamentos, form.tratamentosOutro))}` : "",
    joinWithOutro(form.medicos, form.medicosOutro) ? `antecedentes médicos de ${lowerFirst(joinWithOutro(form.medicos, form.medicosOutro))}` : "",
    joinWithOutro(form.familiares, form.familiaresOutro) ? `histórico familiar de ${lowerFirst(joinWithOutro(form.familiares, form.familiaresOutro))}` : "",
    joinWithOutro(form.substancias, form.substanciasOutro) ? `uso/hábitos: ${lowerFirst(joinWithOutro(form.substancias, form.substanciasOutro))}` : ""
  ].filter(Boolean);
  return parts.length ? parts.join("; ") : "não há antecedentes relevantes registrados";
}

function conciseMentalExamText(form = {}) {
  const findings = mentalExamKeys()
    .flatMap(key => clinicalMentalValues(form, key))
    .map(cleanClinicalLine)
    .filter(Boolean);
  return findings.length ? formatClinicalList(findings) : "não há achados do exame psíquico registrados";
}

function conciseDiagnosticText(form = {}) {
  const selected = selectedDiagnosisText(form) || form.diagnosticoSelecionadoResumo || form.diagnosticoManual || "";
  return cleanClinicalLine(selected || "Hipóteses diagnósticas não selecionadas");
}

function cleanClinicalLine(value = "") {
  return stripFinalPeriod(value)
    .replace(/^\s*(QP|HDA)\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function patientIdentificationText(patient = {}, withPrefix = true) {
  const age = calculateAge(patient.nascimento);
  const sexo = patient.sexo ? lowerFirst(patient.sexo) : "";
  const fragments = [
    sexo ? `${withPrefix ? "Paciente " : ""}${sexo}` : withPrefix ? "Paciente" : "",
    age ? `${age} anos` : "",
    patient.estadoCivil ? patient.estadoCivil.toLowerCase() : "",
    patient.ocupacao ? lowerFirst(patient.ocupacao) : ""
  ].filter(Boolean);
  return `${fragments.join(", ")}.`;
}

function returnStoryText(form, previous) {
  const clinicalEvolution = normalizedSingleChoiceValue("evolucaoClinicaRetorno", form.evolucaoClinicaRetorno);
  const sleep = normalizedSingleChoiceValue("sonoRetorno", form.sonoRetorno);
  const moodAndAnxiety = normalizedSingleChoiceValue("humorAnsiedadeRetorno", form.humorAnsiedadeRetorno);
  const adherence = normalizedSingleChoiceValue("adesao", form.adesao);
  const adverseEffects = joinWithOutro(form.efeitos, form.efeitosOutro);
  const functionalityAndEvents = joinWithOutro(form.funcionalidadeEventosRetorno, form.funcionalidadeEventosRetornoOutro);
  const legacyEvolution = [form.estadoGeral, form.sintomasPrincipais].filter(Boolean).join(", ");
  const legacyMood = [form.humorRetorno, form.ansiedadeRetorno].filter(Boolean).join(", ");
  const parts = [
    clinicalEvolution || legacyEvolution
      ? `Paciente retornou com ${lowerFirst(clinicalEvolution || legacyEvolution)}.`
      : "Paciente retornou para acompanhamento clínico.",
    form.evolucaoClinicaRetornoOutro ? `Como nota adicional sobre a evolução, registra-se ${lowerFirst(stripFinalPeriod(form.evolucaoClinicaRetornoOutro))}.` : "",
    sleep ? `Refere sono ${lowerFirst(sleep)}.` : "",
    form.sonoRetornoOutro ? `Acrescenta sobre o sono: ${lowerFirst(stripFinalPeriod(form.sonoRetornoOutro))}.` : "",
    moodAndAnxiety ? returnMoodAndAnxietySentence(moodAndAnxiety) : (legacyMood ? `Apresenta ${lowerFirst(legacyMood)}.` : ""),
    form.humorAnsiedadeRetornoOutro ? `Como nota adicional sobre humor e ansiedade, registra-se ${lowerFirst(stripFinalPeriod(form.humorAnsiedadeRetornoOutro))}.` : "",
    adherence ? `A adesão ao tratamento encontra-se ${lowerFirst(adherence)}.` : "",
    form.adesaoOutro ? `Como nota adicional sobre a adesão, registra-se ${lowerFirst(stripFinalPeriod(form.adesaoOutro))}.` : "",
    adverseEffects ? `Em relação aos efeitos colaterais, refere ${lowerFirst(adverseEffects)}.` : "",
    functionalityAndEvents ? `Na funcionalidade e nos eventos relevantes, registra-se ${lowerFirst(functionalityAndEvents)}.` : (form.funcionalidade || joinValues(form.eventos) ? `Na funcionalidade e nos eventos relevantes, registra-se ${lowerFirst([form.funcionalidade, joinValues(form.eventos)].filter(Boolean).join(", "))}.` : ""),
    form.observacoesRetorno ? `Como informação complementar previamente registrada, consta ${lowerFirst(stripFinalPeriod(form.observacoesRetorno))}.` : ""
  ].filter(Boolean);
  return professionalClinicalTerms(parts.join(" "));
}

function returnMoodAndAnxietySentence(value = "") {
  if (normalizeText(value) === "crise de panico") return "Apresenta crise de pânico.";
  return `Apresenta humor ${lowerFirst(value)}.`;
}

function mentalStateFindings(form) {
  return mentalExamKeys()
    .flatMap(key => clinicalMentalValues(form, key))
    .filter(Boolean);
}

function valueList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : value ? [value] : [];
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function outdatedEvolutionText(value = "") {
  return normalizeText(value).startsWith("evolucao medica auxiliada por ia");
}

function stripFinalPeriod(value = "") {
  return String(value || "").trim().replace(/[.\s]+$/g, "");
}

function firstLineFromQphda(value = "") {
  return stripFinalPeriod(String(value || "").split(/\n+/).find(Boolean) || "");
}

function remainingQphdaText(value = "", complaint = "") {
  const lines = String(value || "").split(/\n+/).map(line => stripFinalPeriod(line)).filter(Boolean);
  if (!lines.length) return "";
  if (complaint && normalizeText(lines[0]).includes(normalizeText(complaint))) return lines.slice(1).join(". ");
  return lines.slice(1).join(". ") || lines[0];
}

function joinWithOutro(value, otherValue = "") {
  const base = valueList(value).filter(item => normalizeText(item) !== "outro").join(", ");
  return [base, otherValue].filter(Boolean).join(base && otherValue ? ", " : "");
}

function mentalExamKeys() {
  return MENTAL_EXAM_KEYS;
}

function clinicalMentalValues(form = {}, key = "") {
  const values = valueList(form[key]);
  const hasNdn = values.some(item => normalizeText(item) === "ndn");
  return [
    hasNdn ? normalMentalExamFinding(key) : "",
    ...values.filter(item => !["ndn", "outro"].includes(normalizeText(item))),
    form[`${key}Outro`]
  ].map(clinicalPhrase).filter(Boolean);
}

function normalMentalExamFinding(key = "") {
  return NORMAL_MENTAL_EXAM_FINDINGS[key] || "";
}

function clinicalPhrase(value = "") {
  const cleaned = stripFinalPeriod(value)
    .replace(/\s+/g, " ")
    .replace(/^(aparencia|aparência|atitude|contato|consciencia|consciência|atencao|atenção|orientacao|orientação|memoria|memória|sensopercepcao|sensopercepção|linguagem|humor|afeto|psicomotricidade|vontade|juizo critico|juízo crítico|insight)\s*:\s*/i, "")
    .replace(/^(memoria|memória)\s+/i, "")
    .replace(/^(sensopercepcao|sensopercepção|linguagem|humor|afeto|consciencia|consciência|atencao|atenção|orientacao|orientação)\s+/i, "")
    .replace(/^(paciente\s+)?/i, "")
    .trim();
  return lowerFirst(cleaned);
}

function formatClinicalList(items = []) {
  const cleanItems = uniqueValues(items.map(clinicalPhrase).filter(Boolean));
  if (cleanItems.length <= 1) return cleanItems[0] || "";
  if (cleanItems.length === 2) return `${cleanItems[0]} e ${cleanItems[1]}`;
  return `${cleanItems.slice(0, -1).join(", ")} e ${cleanItems.at(-1)}`;
}

function improvementSentence(value = "") {
  const text = lowerFirst(stripFinalPeriod(value)).replace(/^melhora\s+/i, "");
  const connector = normalizeText(text).startsWith("apos ") ? "" : "com ";
  return `Diz que a melhora geralmente ocorre ${connector}${text}.`;
}

function lowerFirst(value = "") {
  const text = String(value).trim();
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : "";
}

function diagnosticRules() {
  return [
    {
      name: "Depressao Maior",
      cid11: "6A70 - Episodio depressivo",
      dsm5tr: "Transtorno depressivo maior, episodio depressivo maior",
      terms: ["hipotimia", "anedonia", "deprim", "lentificacao", "hipobulia", "despertar precoce", "ideacao suicida"],
      differential: "luto, transtorno bipolar, uso de substancias, hipotireoidismo e transtorno de ajustamento."
    },
    {
      name: "Transtorno de Ansiedade Generalizada",
      cid11: "6B00 - Transtorno de ansiedade generalizada",
      dsm5tr: "Transtorno de ansiedade generalizada",
      terms: ["humor ansioso", "ansios", "preocupacoes excessivas", "inquietude", "tensao", "panico"],
      differential: "transtorno do panico, ansiedade social, TOC, hipertireoidismo e uso de estimulantes."
    },
    {
      name: "Depressao Bipolar",
      cid11: "6A60/6A61 - Transtorno bipolar tipo I/tipo II",
      dsm5tr: "Transtorno bipolar I ou II",
      terms: ["hipertimia", "euforia", "reducao da necessidade de sono", "fuga de ideias", "logorreia", "aceleracao", "hiperbulia"],
      differential: "TDAH, uso de substancias, transtorno de personalidade borderline e episodio depressivo unipolar."
    },
    {
      name: "Transtorno Obsessivo-Compulsivo",
      cid11: "6B20 - Transtorno obsessivo-compulsivo",
      dsm5tr: "Transtorno obsessivo-compulsivo",
      terms: ["obsessoes", "compulsividade", "toc", "rituais", "intrusivos"],
      differential: "ansiedade generalizada, transtornos relacionados a trauma, tiques e transtorno de personalidade obsessivo-compulsiva."
    },
    {
      name: "Transtorno Psicotico Primario ou Secundario",
      cid11: "6A20-6A2Z - Espectro da esquizofrenia e outros transtornos psicoticos primarios",
      dsm5tr: "Espectro da esquizofrenia e outros transtornos psicoticos",
      terms: ["alucinacao", "delirio", "juizo prejudicado", "critica prejudicada", "desconfianca", "afrouxamento", "descarrilamento"],
      differential: "transtorno bipolar com sintomas psicoticos, depressao psicotica, delirium, epilepsia e substancias."
    },
    {
      name: "Transtorno Relacionado a Trauma ou Estresse",
      cid11: "6B40/6B43 - TEPT ou transtorno de ajustamento",
      dsm5tr: "TEPT ou transtorno de ajustamento",
      terms: ["tept", "trauma", "luto", "separacao", "estresse", "conflito", "ajustamento"],
      differential: "depressao maior, ansiedade generalizada, luto prolongado e transtorno de personalidade."
    },
    {
      name: "Transtorno por Uso de Substancias",
      cid11: "6C40-6C4Z - Transtornos por uso de substancias",
      dsm5tr: "Transtornos relacionados a substancias e transtornos aditivos",
      terms: ["alcool", "cannabis", "cocaina", "crack", "opioides", "benzodiazepinicos", "substancias"],
      differential: "transtornos primarios do humor, ansiedade, psicose induzida por substancias e abstinencia/intoxicacao."
    },
    {
      name: "Transtorno do Panico",
      cid11: "6B01 - Transtorno do panico",
      dsm5tr: "Transtorno do panico",
      terms: ["panico", "palpitacoes", "falta de ar", "sudorese", "morte iminente", "crises"],
      differential: "ansiedade generalizada, ansiedade social, arritmias, hipertireoidismo e uso de estimulantes."
    },
    {
      name: "Transtorno de Deficit de Atencao e Hiperatividade",
      cid11: "6A05 - Transtorno de deficit de atencao e hiperatividade",
      dsm5tr: "Transtorno de deficit de atencao/hiperatividade",
      terms: ["desatencao", "dificuldade de concentracao", "impulsividade", "hiperatividade", "procrastinacao"],
      differential: "transtornos do humor, ansiedade, privacao de sono, uso de substancias e dificuldades de aprendizagem."
    },
    {
      name: "Transtorno Alimentar ou da Alimentacao",
      cid11: "6B80-6B8Z - Transtornos alimentares ou da alimentacao",
      dsm5tr: "Transtornos alimentares e da ingestao de alimentos",
      terms: ["compulsao alimentar", "restricao alimentar", "perda de peso", "ganho de peso", "imagem corporal"],
      differential: "depressao, ansiedade, condicoes endocrinas, efeitos medicamentosos e transtorno dismorfico corporal."
    }
  ];
}

function joinValues(value) {
  return Array.isArray(value) ? value.filter(Boolean).join(", ") : value || "";
}

function requestedExamsText(form = {}) {
  const selected = Array.isArray(form.examesSolicitados)
    ? form.examesSolicitados.filter(Boolean)
    : form.examesSolicitados
      ? [form.examesSolicitados]
      : [];
  const expanded = selected.flatMap(exam =>
    exam === "Exames laboratoriais" ? laboratoryExamRequestItems : [exam]
  );
  if (form.examesSolicitadosOutro?.trim()) expanded.push(form.examesSolicitadosOutro.trim());
  return [...new Set(expanded)].join(", ");
}

function anamnesisText(form = {}) {
  return form.qphda || [form.queixa && `QP: ${form.queixa}`, form.hdaManual && `HDA: ${form.hdaManual}`].filter(Boolean).join("\n");
}

function normalizeText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
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
  validationItems(clean).forEach(item => {
    if (!["AI_SUGGESTED", "DOCTOR_REJECTED"].includes(item.state) || !(item.field in clean)) return;
    if (Array.isArray(clean[item.field])) {
      clean[item.field] = clean[item.field].filter(value => value !== item.value);
    } else if (clean[item.field] === item.value) {
      clean[item.field] = "";
    }
  });
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
  if (authSession) pushState(state).catch(error => { authError = error.message; });
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

function shouldRefreshEvolutionNarrative(value = "") {
  const text = String(value || "");
  return EVOLUTION_REFRESH_PATTERNS.some(pattern => pattern.test(text));
}

function returnEvolutionContainsIdentity(value = "", patient = {}) {
  const evolution = normalizeText(value).trim();
  const patientName = normalizeText(patient.nome).trim();
  return Boolean(evolution && patientName && evolution.startsWith(patientName));
}

function removeReturnBoilerplate(value = "") {
  return RETURN_BOILERPLATE_PHRASES.reduce((text, phrase) => text.replaceAll(phrase, " "), value)
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEvolutionNarrative(value = "") {
  return String(value || "")
    .replace(/\*\*[^*]*\*\*/g, " ")
    .replace(/^\s*#{1,6}\s+.*$/gm, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ +([,.;:!?])/g, "$1")
    .trim();
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

function preferredRecordingMimeType() {
  return ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"]
    .find(type => MediaRecorder.isTypeSupported(type)) || "";
}

function recordingFilename(type = "") {
  if (type.includes("mp4")) return "consulta.mp4";
  if (type.includes("ogg")) return "consulta.ogg";
  if (type.includes("wav")) return "consulta.wav";
  return "consulta.webm";
}

async function requestConsultationTranscription(audio) {
  const response = await fetch("/api/transcribe-consultation", {
    method: "POST",
    headers: {
      "Content-Type": audio.type || "audio/webm",
      "X-Audio-Filename": recordingFilename(audio.type)
    },
    body: audio
  });
  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok) throw new Error(data.error || "Falha ao transcrever a gravação.");
  if (!Array.isArray(data.segments) || !data.segments.length) throw new Error("A transcrição não retornou falas reconhecíveis.");
  return data;
}

function formatDiarizedTranscript(segments = []) {
  const lines = [];
  let previousSpeaker = "";
  segments.forEach(segment => {
    const speaker = String(segment.speaker || "?").trim();
    const text = String(segment.text || "").trim();
    if (!text) return;
    if (speaker === previousSpeaker && lines.length) lines[lines.length - 1] += ` ${text}`;
    else lines.push(`Falante ${speaker}: ${text}`);
    previousSpeaker = speaker;
  });
  return lines.join("\n");
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

function showMicrophonePermissionHelp() {
  alert(
    "O acesso ao microfone está bloqueado para este site.\n\n" +
    "Chrome ou Edge: clique no ícone de cadeado/controles ao lado do endereço, escolha Microfone → Permitir e recarregue a página.\n\n" +
    "Safari: Safari → Ajustes para Este Site → Microfone → Permitir."
  );
}

function setVoiceStatus(button, message, state = "") {
  const status = button?.closest(".voice-controls")?.querySelector(".voice-status");
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, char => HTML_ESCAPE_ENTITIES[char]);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function calculateAge(dateValue) {
  if (!dateValue) return "";
  const birth = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return "";
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const hadBirthday = today.getMonth() > birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  if (!hadBirthday) age -= 1;
  return age >= 0 ? age : "";
}

function personIcon() {
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
}
function clipboardIcon() {
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 4h6l1 2h3v15H5V6h3l1-2Z" stroke="currentColor" stroke-width="2"/><path d="M9 11h6M9 15h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
}
function repeatIcon() {
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function folderIcon() {
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6h7l2 2h9v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z" stroke="currentColor" stroke-width="2"/></svg>`;
}
function lockIcon() {
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5V10Z" stroke="currentColor" stroke-width="2"/></svg>`;
}
function homeIcon() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m4 10 8-7 8 7v10H4V10Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 20v-6h6v6" stroke="currentColor" stroke-width="1.8"/></svg>`;
}
function themeIcon() {
  return `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
}
function microphoneIcon() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8" y="3" width="8" height="13" rx="4" stroke="currentColor" stroke-width="1.8"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
}
