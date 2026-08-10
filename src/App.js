import { optionGroups } from "./data/examOptions.js?v=tratamento-1";
import { medications } from "./data/medications.js?v=medicamentos-1";
import { fetchCep } from "./services/cepService.js";
import { exportTextAsPdf } from "./services/pdfService.js?v=pdf-download-2";
import { loadState, saveState, uid } from "./services/storageService.js";
import { currentSession, pullState, pushState, signIn, signOut } from "./services/supabaseService.js";

const app = document.querySelector("#app");
let state = loadState();
let view = "dashboard";
let medicationLookupTimer = null;
let medicationLookupSequence = 0;
let selectedPatientId = state.patients[0]?.id || "";
let draft = {};
let consultationPage = "anamnese";
let returnPage = "evolucao-retorno";
let modal = null;
let pendingViewAfterPatient = "";
let activeVoiceRecognition = null;
let activeVoiceButton = null;
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
  ["resumo", "Resumo"],
  ["diagnostico", "Diagnostico"],
  ["tratamento", "Tratamento"],
  ["evolucao", "Historia Clinica"],
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
const mentalExamQuestions = {
  aparencia: `O que observar: O paciente esta acordado e alerta? A higiene esta preservada? Como ele se veste?
Ele faz contato visual?
E colaborativo, hostil, desconfiado ou indiferente a sua presenca?`,
  consciencia: `O paciente permanece desperto durante a entrevista?
Responde prontamente aos chamados e estimulos?
Ha sinais de rebaixamento, confusao, delirium, transe ou dissociacao?`,
  atencao: `Consegue manter o foco nas perguntas?
Distrai-se facilmente ou persevera em um tema?
Ha hipoprosexia, aprosexia, hiperprosexia ou desatencao seletiva?`,
  orientacao: `Sabe informar quem e, onde esta e a data aproximada?
Reconhece o contexto da consulta e a situacao atual?
Ha desorientacao amnestica, confusional, delirante ou apatica?`,
  memoria: `Recorda fatos recentes e remotos com coerencia?
Consegue reter e evocar informacoes durante a entrevista?
Ha amnesia, confabulacao, paramnesia, deja vu ou jamais vu?`,
  sensopercepcao: `Refere perceber vozes, imagens, cheiros, gostos ou sensacoes corporais incomuns?
Ha ilusoes, alucinacoes, pseudoalucinacoes ou alucinose?
Refere despersonalizacao ou desrealizacao?`,
  pensamentoCursoForma: `O pensamento flui em ritmo adequado e com associacoes logicas?
Ha aceleracao, lentificacao, bloqueio, fuga de ideias ou perseveracao?
Ha desagregacao, afrouxamento de nexos, tangencialidade ou circunstancialidade?`,
  pensamentoConteudo: `Quais temas predominam no discurso do paciente?
Ha delirios, obsessoes, fobias ou ideias de sobrevalia?
Ha ideacao suicida, homicida ou conteudos de risco?`,
  linguagem: `A fala e espontanea, compreensivel e adequada ao contexto?
Ha logorreia, mutismo, taquilalia, bradilalia ou disartria?
Ha neologismos, ecolalia, palilalia, coprolalia, mussitacao ou pararrespostas?`,
  humor: `Como o paciente descreve o estado emocional predominante?
O humor observado e compativel com o relato?
Ha eutimia, hipotimia, hipertimia, disforia ou ansiedade?`,
  afeto: `A expressao afetiva e modulada e congruente com o conteudo?
Ha restricao, embotamento, labilidade ou incontinencia afetiva?
Ha afeto pueril ou inadequacao/paratimia?`,
  psicomotricidade: `Observe postura, movimentos e velocidade psicomotora.
Ha agitacao, lentificacao, catatonia, tiques, acatisia ou ecopraxia?`,
  vontade: `Observe iniciativa, volicao e impulsividade.
Ha abulia, hipobulia, impulsividade ou compulsao?`,
  juizoCritico: `O paciente reconhece sintomas, prejuizos e necessidade de cuidado?
Compreende consequencias dos proprios atos e decisoes?
Ha negacao da doenca, critica parcial ou delirio de normalidade?`
};
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
      <div></div>
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
        ${field("telefone", "Telefone", patient.telefone, "tel")}
        ${field("email", "E-mail", patient.email, "email")}
        ${field("acompanhante", "Nome de acompanhante, se houver", patient.acompanhante)}
        ${field("emergencia", "Contato de emergencia", patient.emergencia)}
      </div>
      <div class="address-card">
        <h3>Endereco automatico por CEP</h3>
        <div class="grid">
          ${field("cep", "CEP", patient.cep)}
          ${field("endereco", "Endereco", patient.endereco)}
          ${field("bairro", "Bairro", patient.bairro)}
          <div class="inline-fields">
            ${field("numero", "Numero", patient.numero)}
            ${field("complemento", "Complemento", patient.complemento)}
          </div>
          <div class="inline-fields city-state">
            ${field("cidade", "Cidade", patient.cidade)}
            ${field("estado", "UF", patient.estado)}
          </div>
        </div>
        <div class="warning" id="cep-status">Digite o CEP com 8 digitos para preencher endereco, bairro, cidade e estado automaticamente.</div>
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
  return `<section class="clinical-page"><div class="clinical-page-title"><h3>${title}</h3></div>${body}${showActions ? pageStepActions(scope) : ""}</section>`;
}

function consultationPageBody(form, patient) {
  const qphda = form.qphda || [form.queixa && `QP: ${form.queixa}`, form.hdaManual && `HDA: ${form.hdaManual}`].filter(Boolean).join("\n\n");
  if (consultationPage === "anamnese") return clinicalPage("Anamnese", `
    <div class="clinical-card qphda-card">
      <h4>QP e HDA</h4>
      ${voiceTextarea("qphda", "", qphda, "Registrar QP e HDA com cronologia dos sintomas, eventos relacionados, fatores de piora e melhora, uso de substancias, sintomas e impacto funcional.")}
      <div class="manual-anamnesis">
        ${textarea("queixa", "QP - preenchimento manual", form.queixa, "QP nas palavras do paciente", 1)}
        ${textarea("hdaManual", "HDA - preenchimento manual", form.hdaManual, "Historia da doença atual", 1)}
      </div>
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
  if (consultationPage === "resumo") return clinicalPage("Resumo", clinicalSummaryPage(form, patient), "consultation");
  if (consultationPage === "neurologico") return clinicalPage("Exame fisico e neurologico", neurologicExamBody(form), "consultation");
  if (consultationPage === "diagnostico") return clinicalPage("Diagnostico e diferenciais", diagnosisModule(form), "consultation");
  if (consultationPage === "tratamento") return clinicalPage("Tratamento e orientacoes", treatmentModule(form), "consultation");
  if (consultationPage === "evolucao") return clinicalPage("Historia Clinica", evolutionBody(form, patient), "consultation");
  if (consultationPage === "medicamentos") return clinicalPage("Apêndice · Medicamentos", medicationBody(form), "consultation", false);
  return clinicalPage("Historia Clinica", evolutionBody(form, patient), "consultation");
}

function returnPageBody(form, patient, previous) {
  if (returnPage === "evolucao-retorno") return clinicalPage("Avaliacao de evolucao", returnAssessmentBody(form), "return");
  if (returnPage === "diagnostico") return clinicalPage("Diagnostico e diferenciais", diagnosisModule(form), "return");
  if (returnPage === "tratamento") return clinicalPage("Tratamento e orientacoes", treatmentModule(form), "return");
  if (returnPage === "medicamentos") return clinicalPage("Apêndice · Medicamentos", medicationBody(form), "return", false);
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

function mentalExam(form) {
  return section("Exame psiquico", mentalExamBody(form), false);
}

function mentalExamBody(form) {
  const groups = [
    ["aparencia", "Aparencia, Atitude e Contato"],
    ["atencao", "Atencao/Vigilancia"], ["orientacao", "Consciencia/Orientacao"],
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
    <div class="grid three">
      ${field("pa", "PA", form.pa)}${field("fc", "FC", form.fc)}${field("fr", "FR", form.fr)}
      ${field("temperatura", "Temperatura", form.temperatura)}${field("peso", "Peso", form.peso)}${field("altura", "Altura", form.altura)}
      ${field("imc", "IMC", form.imc)}${field("cintura", "Circunferencia abdominal", form.cintura)}
    </div>
    ${textarea("fisico", "Achados fisicos e neurologicos relevantes", form.fisico)}
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
    summaryTextRow("Contato", "Acompanhante", patient.acompanhante),
    summaryTextRow("Contato", "Contato de emergência", patient.emergencia),
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
  return [
    { title: "Identificação do paciente", rows: identityRows },
    { title: "Dados narrativos", rows: narrativeRows },
    { title: "Anamnese estruturada", rows: [...anamnesisRows, ...complementaryRows], layout: "area-record" },
    { title: "Exame psíquico", rows: mentalRows.map(row => ({ ...row, section: row.item })), layout: "area-record" }
  ];
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

function summaryTable(title, rows = [], layout = "full") {
  const compact = layout === "area-record";
  return `<section class="summary-section"><h4>${escapeHtml(title)}</h4><div class="summary-table-wrap"><table class="summary-table">
    <thead><tr><th>Área</th>${compact ? "" : "<th>Campo</th>"}<th>Registro</th></tr></thead>
    <tbody>${rows.map(row => `<tr><td>${escapeHtml(row.section)}</td>${compact ? "" : `<td>${escapeHtml(row.item)}</td>`}<td>${escapeHtml(row.value)}</td></tr>`).join("")}</tbody>
  </table></div></section>`;
}

function diagnosisTreatment(form) {
  return `
    ${section("Diagnostico e diferenciais", diagnosisModule(form))}
    ${section("Tratamento e orientacoes", treatmentModule(form))}
  `;
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
      <p class="online-status">Mantidas independentemente das sugestões da IA. Assinale uma ou mais conforme o julgamento clínico.</p>
      <div class="diagnosis-options">${diagnosisOptionCheckboxes(doctorDiagnosisOptions, selectedValues)}</div>
    </div>
  `;
}

function diagnosisCategory(label, options, selectedValues, count) {
  return `<div class="diagnosis-group"><h4>${label} — ${count} hipóteses</h4>
      <p class="online-status">Assinale uma ou mais opcoes consideradas pertinentes.</p>
      <div class="diagnosis-options">
        ${options.length ? diagnosisOptionCheckboxes(options, selectedValues) : `<p class="diagnosis-empty">Nenhuma hipótese gerada.</p>`}
      </div>
    </div>`;
}

function diagnosisOptionCheckboxes(options, selectedValues) {
  return options.map(option => `
    <label class="diagnosis-option">
      <input type="checkbox" name="diagnosticoSelecionado" value="${escapeAttr(option)}" ${selectedValues.includes(option) ? "checked" : ""} />
      <span>${escapeHtml(option)}</span>
    </label>
  `).join("");
}

function diagnosisAiStatusText(message = "") {
  if (!message) return "";
  if (/OPENAI_API_KEY|IA indisponivel/i.test(message)) return "6 hipoteses locais aplicadas.";
  return message;
}

function aiModeSelector(value = "current") {
  return `<fieldset class="ai-mode-selector">
    <legend>Fonte da resposta</legend>
    <label><input type="radio" name="aiMode" value="current" ${value !== "rag" ? "checked" : ""} /><span>IA atual</span><small>Modelo e regras clinicas atuais</small></label>
    <label><input type="radio" name="aiMode" value="rag" ${value === "rag" ? "checked" : ""} /><span>RAG com literatura</span><small>Restringe a resposta às fontes indexadas</small></label>
  </fieldset>`;
}

function ragSourcesView(sources = []) {
  if (!Array.isArray(sources) || !sources.length) return "";
  return `<details class="rag-sources"><summary>${sources.length} fonte(s) recuperada(s)</summary><ol>${sources.map(source => `
    <li><strong>${escapeHtml(source.filename || "Fonte")}</strong><span>Relevancia: ${Math.round(Number(source.score || 0) * 100)}%</span></li>`).join("")}</ol></details>`;
}

function medicationModule(form) {
  return section("Medicamentos", medicationBody(form));
}

function treatmentModule(form) {
  const examesText = requestedExamsText(form);
  const medicationOptions = treatmentOptionLines(form.tratamentoAiMedicamentos);
  const approachOptions = treatmentOptionLines(form.tratamentoAiAbordagens);
  const selectedApproaches = arrayValue(form.abordagensSelecionadas);
  return `
    <div class="diagnosis-ai-panel">
      ${aiModeSelector(form.aiMode)}
      <div class="actions">
        <button class="primary" type="button" data-action="generate-treatment">Gerar</button>
      </div>
      ${form.treatmentStatus ? `<p class="online-status">${escapeHtml(form.treatmentStatus)}</p>` : ""}
      ${ragSourcesView(form.ragSources)}
    </div>
    <div class="treatment-card-grid">
      <div class="treatment-card">
        <h4>Abordagem medicamentosa</h4>
        <p class="online-status">Dados exclusivamente da IA atual ou do RAG com literatura.</p>
        <textarea hidden name="tratamentoAiMedicamentos">${escapeHtml(medicationOptions.join("\n"))}</textarea>
        <textarea hidden name="tratamentoMedicamentoso">${escapeHtml(form.tratamentoMedicamentoso || "")}</textarea>
        <div class="diagnosis-options">
          ${medicationOptions.length ? medicationOptions.map((option, index) => `<article class="treatment-card"><h4>${index === 0 ? "1ª opção" : index === 1 ? "2ª opção" : "Off-label"}</h4><label class="diagnosis-option treatment-option"><input type="checkbox" name="tratamentoMedicamentosSelecionados" value="${escapeAttr(option)}" ${arrayValue(form.tratamentoMedicamentosSelecionados).includes(option) ? "checked" : ""} /><span>${escapeHtml(option)}</span></label></article>`).join("") : `<p class="diagnosis-empty">As opções aparecerão após a geração.</p>`}
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
        ${chips("examesSolicitados", "Principais exames solicitados em psiquiatria", optionGroups.examesPsiquiatria, form.examesSolicitados)}
        <textarea hidden name="examesLaboratoriais">${escapeHtml(examesText)}</textarea>
      </div>
      <div class="treatment-card physician-adjustments">
        <h4>Ajustes do medico</h4>
        ${textarea("condutaMedica", "Ajustes das condutas selecionadas, consentimento, encaminhamentos e retorno", form.condutaMedica, "", 3)}
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
    <label class="diagnosis-option treatment-option">
      <input type="checkbox" name="${name}" value="${escapeAttr(option)}" ${selectedValues.includes(option) ? "checked" : ""} />
      <span>${escapeHtml(option)}</span>
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
          placeholder="Comece a digitar: sertralina, Zoloft, quetiapina..."
          autocomplete="off" role="combobox" aria-autocomplete="list" aria-controls="medication-suggestions" />
        <button class="medication-clear" type="button" data-action="clear-medication-lookup" aria-label="Limpar pesquisa">×</button>
      </div>
      <div id="medication-suggestions" class="medication-suggestions" role="listbox"></div>
      ${aiModeSelector(form.aiMode)}
      <div class="actions"><button class="primary" type="button" data-action="generate-medication-ai">Gerar</button></div>
      ${form.medicationOnlineStatus ? `<p class="medication-source-status">${escapeHtml(form.medicationOnlineStatus)}</p>` : ""}
      ${hasInformation ? medicationReferenceCard(form) : `
        <div class="medication-empty-state">
          <span>Rx</span>
          <h4>Medicamento</h4>
        </div>
      `}
      <aside class="medication-disclaimer">
      </aside>
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

function evolutionModule(form, patient, previous = null, isReturn = false) {
  return section(isReturn ? "Evolucao do Retorno" : "Historia Clinica", evolutionBody(form, patient, previous, isReturn), true);
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
      <div class="timeline">
        ${all.length ? all.map(entry => `
          <article class="timeline-item">
            <h4>${escapeHtml(entry.label)} - ${new Date(entry.createdAt).toLocaleString("pt-BR")}</h4>
            <p>${escapeHtml(recordReportText(entry))}</p>
            <div class="actions">
              <button class="secondary" data-action="pdf-entry" data-id="${entry.id}" data-type="${entry.type}">Exportar PDF</button>
            </div>
          </article>`).join("") : `<div class="warning">Nenhum registro encontrado para os filtros atuais.</div>`}
      </div>
    </div>
  `;
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
  return `<label>${labelText}<input name="${name}" type="${type}" value="${escapeAttr(value || "")}" /></label>`;
}

function selectField(name, labelText, options, value = "") {
  return `<label>${labelText}<select name="${name}"><option value="">Selecionar</option>${options.map(option => `<option value="${escapeAttr(option)}" ${value === option ? "selected" : ""}>${escapeHtml(optionDisplayLabel(option))}</option>`).join("")}</select></label>`;
}

function selectFieldWithOther(name, labelText, options, value = "") {
  return selectField(name, labelText, options, value);
}

function textarea(name, labelText, value = "", placeholder = "", rows = "") {
  const rowsAttr = rows ? ` rows="${rows}"` : "";
  const evolutionAttrs = name === "evolution" ? ` class="evolution-textarea" data-auto-expand="true" rows="12"`
    : name === "qphda" ? ` class="auto-expand" data-auto-expand="true" rows="5"`
      : ["queixa", "hdaManual"].includes(name) ? ` class="auto-expand" data-auto-expand="true" rows="1"`
        : name === "historia" ? ` class="auto-expand" data-auto-expand="true" rows="3"` : rowsAttr;
  return `<label>${labelText}<textarea name="${name}"${evolutionAttrs} placeholder="${escapeAttr(placeholder)}">${escapeHtml(value || "")}</textarea></label>`;
}

function voiceTextarea(name, labelText, value = "", placeholder = "") {
  return `<div class="voice-field">${textarea(name, labelText, value, placeholder)}<div class="voice-controls">
    <button class="voice-button" type="button" data-action="voice" data-target="${name}" aria-label="Iniciar transcrição por voz" title="Transcrever por voz">
      ${microphoneIcon()}<span class="voice-pulse" aria-hidden="true"></span>
    </button>
    <span class="voice-status" aria-live="polite">Clique no microfone para transcrever</span>
  </div></div>`;
}

function questionTextarea(key, labelText, value = "") {
  return `<label class="mental-question">${labelText}<textarea rows="3" readonly placeholder="Perguntas fixas deste item">${escapeHtml(fixedMentalQuestion(key, value))}</textarea></label>`;
}

function fixedMentalQuestion(key, value = "") {
  return mentalExamQuestions[key] || "";
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
        <label>
          <input type="checkbox" name="${item.key}" value="${escapeAttr(option)}" ${set.has(option) ? "checked" : ""} />
          ${escapeHtml(optionDisplayLabel(option))}
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
        <textarea name="${item.key}" rows="2" placeholder="${escapeAttr(item.placeholder || "Resposta preenchida pelo medico")}">${escapeHtml(form[item.key] || "")}</textarea>
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
  return `<div><label>${labelText}</label><div class="chips">${options.map(option => `<label class="chip"><input type="checkbox" name="${name}" value="${escapeAttr(option)}" ${set.has(option) ? "checked" : ""}>${escapeHtml(optionDisplayLabel(option))}</label>`).join("")}</div></div>`;
}

function singleChoiceWithNotes(name, labelText, options, value = "") {
  const selectedValue = normalizedSingleChoiceValue(name, value);
  return `<div>
    <label>${labelText}</label>
    <div class="chips">
      ${options.map(option => `<label class="chip"><input type="radio" name="${name}" value="${escapeAttr(option)}" ${selectedValue === option ? "checked" : ""}>${escapeHtml(option)}</label>`).join("")}
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

function optionDisplayLabel(option = "") {
  return option;
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
    form.addEventListener("input", () => updateDraftFromForm(form));
    form.addEventListener("change", event => {
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

function bindPatientForm() {
  const form = app.querySelector("#patient-form");
  if (!form) return;
  form.querySelector("[name='cep']")?.addEventListener("blur", async event => {
    const status = app.querySelector("#cep-status");
    try {
      const address = await fetchCep(event.target.value);
      Object.assign(draft.patient || {}, formToObject(form), address);
      status.textContent = "Endereco preenchido automaticamente pelo CEP.";
      render();
    } catch (error) {
      status.textContent = error.message;
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
  app.querySelector("[name='recordSearch']")?.addEventListener("input", event => {
    draft.recordQuery = event.target.value;
    render();
  });
}

function bindActions() {
  app.querySelectorAll("[data-action]").forEach(element => {
    element.addEventListener("click", async event => {
      const action = element.dataset.action;
      if (["dashboard", "toggle-theme", "select-patient", "edit-patient"].includes(action)) return;
      if (action === "form-page") switchFormPage(element);
      if (action === "save-next-page") saveCurrentPageAndAdvance(element);
      if (action === "generate-diagnosis") await generateDiagnosisFromClinicalData(element);
      if (action === "generate-treatment") await generateTreatmentFromClinicalData(element);
      if (action === "generate-evolution") await generateEvolutionFromClinicalData(element);
      if (action === "generate-medication-ai") await generateMedicationFromClinicalData(element);
      if (action === "fill-medication-info") await fillMedicationInfo(element);
      if (action === "clear-medication-lookup") clearMedicationLookup();
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
    });
  });
}

function switchFormPage(element) {
  const form = element.closest("form");
  if (form) updateDraftFromForm(form);
  if (element.dataset.scope === "consultation") consultationPage = element.dataset.page;
  if (element.dataset.scope === "return") returnPage = element.dataset.page;
  render();
}

function saveCurrentPageAndAdvance(element) {
  const form = element.closest("form");
  if (form) updateDraftFromForm(form);
  const scope = element.dataset.scope;
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
    const data = { ...(draft.return || defaultReturn()), patientId: selectedPatientId, type: "return", previousEntryId: draft.return?.previousEntryId || previous?.id || "" };
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
    suggestion = {
      diagnosticoAiSindromico: syndromicOptions.join("\n"),
      diagnosticoAiNosologico: nosologicalOptions.join("\n"),
      diagnosticoAiEtiologico: etiologicalOptions.join("\n"),
      diagnosticoSelecionado: selectedDoctorOptions,
      diagnosticoManual: selectedDoctorOptions.join("\n"),
      diferenciais: "",
      ragSources: sources,
      aiMode: mode,
      aiStatus: "3 hipóteses sindrômicas, 3 nosológicas e 2 etiológicas geradas. As hipóteses do médico foram mantidas."
    };
  } catch (error) {
    suggestion = target?.aiMode === "rag"
      ? { ragSources: [], aiStatus: `RAG indisponivel: ${error.message}` }
      : { ...buildDiagnosticSuggestion(target || {}), aiStatus: "Hipóteses locais aplicadas como contingência. Revise clinicamente." };
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
    const { result, sources, mode } = await requestClinicalAi("treatment", buildClinicalAiPrompt("treatment", context.target, context.patient, context.previous, context.isReturn), context.target?.aiMode, buildRagQuery("treatment", context.target));
    const medicationOptions = result.medication_options.map(formatMedicationTreatmentOption);
    const approachOptions = result.non_pharmacological_options.map(formatNonPharmacologicalOption);
    suggestion = {
      tratamentoAiMedicamentos: medicationOptions.join("\n"),
      tratamentoAiAbordagens: approachOptions.join("\n"),
      tratamentoMedicamentosSelecionados: [],
      abordagensSelecionadas: [],
      tratamentoMedicamentoso: "",
      abordagensTerapeuticas: "",
      examesLaboratoriais: requestedExamsText(target || {}),
      condutaMedica: target?.condutaMedica || "",
      ragSources: sources,
      aiMode: mode,
      treatmentStatus: "3 opções medicamentosas e 3 abordagens não farmacológicas geradas. Assinale as pertinentes.",
      aiStatus: "Sugestões de tratamento geradas pela IA para revisão médica."
    };
  } catch (error) {
    suggestion = target?.aiMode === "rag"
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
    suggestion = { evolution: text, aiStatus: "Evolução gerada pela IA real. Revise antes de salvar." };
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
    const { result } = await requestClinicalAi("medication", buildClinicalAiPrompt("medication", context.target, context.patient, context.previous, context.isReturn), context.target?.aiMode, buildRagQuery("medication", context.target));
    suggestion = {
      medicationNameText: result.medication || target.medicationGeneric,
      medicationPresentation: result.dose_progression || "",
      medicationSafety: result.side_effects || "",
      medicationBestUse: result.notes || "",
      medicationStatus: "Medicamento preenchido nos campos essenciais. Revise com bula vigente.",
      medicationOnlineStatus: "Resposta de medicamento gerada pela IA real. Revise com bula brasileira e dados do paciente.",
      aiStatus: "Resposta gerada pela IA real. Revise antes de salvar."
    };
  } catch (error) {
    suggestion = {
      medicationOnlineStatus: `IA indisponível: ${error.message}. Use pesquisa online ou prompt manual.`,
      aiStatus: `IA indisponível: ${error.message}.`
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
  if (kind === "treatment") return `Diretrizes e tratamento de ${diagnosis}. Dados clinicos relevantes: ${symptoms}`.slice(0, 4000);
  if (kind === "diagnosis") return `Criterios diagnosticos e diagnostico diferencial para: ${symptoms}`.slice(0, 4000);
  return `${diagnosis}; ${symptoms}`.slice(0, 4000);
}

function validateClinicalAiPayload(kind, result, text = "") {
  if (!result && text) result = parseFallbackClinicalText(kind, text);
  if (!result || typeof result !== "object") throw new Error("Resposta estruturada ausente.");
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
      "Preencha somente os campos solicitados sobre o medicamento informado.",
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
      "MEDICAMENTO:",
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

function diagnosticMainOptionLines(form = {}) {
  const stored = normalizeDiagnosticOptions(form.diagnosticoAiOpcoes || form.diferenciais || "");
  return stored;
}

function diagnosticSyndromicOptionLines(form = {}) { return normalizeDiagnosticOptions(form.diagnosticoAiSindromico || form.diagnosticoAiOpcoes || "", 3); }
function diagnosticNosologicalOptionLines(form = {}) { return normalizeDiagnosticOptions(form.diagnosticoAiNosologico || form.diagnosticoAiOutrasOpcoes || "", 3); }
function diagnosticEtiologicalOptionLines(form = {}) { return normalizeDiagnosticOptions(form.diagnosticoAiEtiologico || "", 2); }

function diagnosticOtherOptionLines(form = {}) {
  const stored = normalizeDiagnosticOptions(form.diagnosticoAiOutrasOpcoes || "");
  return stored;
}

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
  const selectedText = selected.join("\n");
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

function findLocalMedication(term = "") {
  const query = normalizeText(term);
  if (!query) return null;
  return medications.find(item => {
    const names = [item.generic, ...String(item.brands || "").split(",")].map(normalizeText);
    return names.includes(query);
  }) || null;
}

async function fetchRxNavSuggestions(term = "") {
  try {
    const url = `/api/medication-suggest?q=${encodeURIComponent(term)}`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    return (data?.suggestions || []).map(name => ({ name, detail: "RxNav/NLM" }));
  } catch {
    return [];
  }
}

function mergeMedicationSuggestions(local = [], remote = []) {
  return [...local, ...remote]
    .filter((item, index, list) => list.findIndex(candidate => normalizeText(candidate.name) === normalizeText(item.name)) === index)
    .slice(0, 10);
}

function medicationFromLocalCatalog(item) {
  return {
    medicationGeneric: item.generic,
    medicationNameText: item.generic,
    medicationBrands: item.brands,
    medicationClass: item.className,
    medicationActiveIngredient: item.generic,
    medicationPresentationHighlight: item.presentation,
    medicationRecommendedDose: `${item.initialDose}; usual/alvo: ${item.usualDose}`,
    medicationMainEffects: item.commonEffects,
    medicationBestUse: [
      `Indicações: ${item.indications}`,
      `Uso clínico: ${item.bestUse}`,
      `Notas práticas: ${item.practiceNotes}`
    ].join("\n"),
    medicationPresentation: [
      `Apresentações: ${item.presentation}`,
      `Dose inicial: ${item.initialDose}`,
      `Faixa usual/dose-alvo: ${item.usualDose}`,
      `Progressão: ${item.progression}`
    ].join("\n"),
    medicationSafety: [
      `Efeitos comuns: ${item.commonEffects}`,
      `Efeitos graves: ${item.severeEffects}`,
      `Contraindicações: ${item.contraindications}`,
      `Interações: ${item.interactions}`
    ].join("\n"),
    medicationMechanism: [
      `Mecanismo: ${item.mechanism}`,
      `Receptores/alvos: ${item.receptors}`
    ].join("\n"),
    medicationMonitoring: item.monitoring,
    medicationSpecialPopulations: [
      `Idosos: ${item.elderly}`,
      `Gestação/lactação: ${item.pregnancy}`,
      `Função renal/hepática: ${item.renalHepatic}`
    ].join("\n"),
    medicationOnlineStatus: "Resultado brasileiro prioritário, apresentado em português e em formato resumido."
  };
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

function medicationPriceLinks(medicationName = "") {
  const query = encodeURIComponent(`${medicationName} preco Fortaleza`);
  const pharmacyQuery = encodeURIComponent(medicationName);
  return [
    { label: "Google", url: `https://www.google.com/search?q=${query}` },
    { label: "Consulta Remedios", url: `https://consultaremedios.com.br/busca?termo=${pharmacyQuery}` },
    { label: "Drogasil", url: `https://www.drogasil.com.br/search?w=${pharmacyQuery}` },
    { label: "Drogaria Sao Paulo/Pacheco", url: `https://www.drogariasaopaulo.com.br/search?w=${pharmacyQuery}` },
    { label: "Pague Menos", url: `https://www.paguemenos.com.br/search?q=${pharmacyQuery}` }
  ];
}

function medicationSearchLinks(medicationName) {
  const links = medicationPriceLinks(medicationName);
  return `<div class="internet-links" aria-label="Links de pesquisa de preco">${links.map(link => `<a href="${escapeAttr(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)}</a>`).join("")}</div>`;
}

function buildTreatmentSuggestion(form) {
  const diagnosisText = treatmentDiagnosisText(form);
  const plan = treatmentPlanForDiagnosis(normalizeText(diagnosisText));
  const medicationOptions = diagnosisText ? plan.medications.slice(0, 3).map(formatLocalMedicationOption) : [];
  const approachOptions = diagnosisText ? plan.therapies.slice(0, 3).map(formatLocalApproachOption) : [];
  return {
    tratamentoAiMedicamentos: medicationOptions.join("\n"),
    tratamentoAiAbordagens: approachOptions.join("\n"),
    tratamentoMedicamentosSelecionados: [],
    abordagensSelecionadas: [],
    tratamentoMedicamentoso: "",
    abordagensTerapeuticas: "",
    examesLaboratoriais: requestedExamsText(form),
    condutaMedica: form.condutaMedica || "",
    conduta: ""
  };
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

function formatLocalMedicationOption(line = "") {
  return String(line).replace(/^-\s*(?:Opção|Opcao)\s*\d+:\s*/i, "").trim();
}

function formatLocalApproachOption(line = "") {
  return String(line).replace(/^-\s*/, "").trim();
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

function treatmentPlanForDiagnosis(diagnosisText) {
  if (diagnosisText.includes("bipolar") || diagnosisText.includes("mania") || diagnosisText.includes("hipomania")) {
    return {
      label: "Transtorno bipolar ou relacionado",
      medications: [
        "- Opcao 1: litio 300 mg a noite ou 300 mg 12/12 h; titular gradualmente conforme resposta, tolerabilidade, funcao renal/tireoidiana e litemia.",
        "- Opcao 2: valproato 250-500 mg a noite ou 12/12 h; progredir conforme resposta e nivel serico quando indicado, evitando em gestacao/risco gestacional.",
        "- Opcao 3: quetiapina 25-50 mg a noite; titular progressivamente conforme alvo clinico, sedacao, peso e parametros metabolicos.",
        "- Evitar antidepressivo isolado quando houver suspeita bipolar."
      ],
      therapies: [
        "- Psicoterapia com foco em ritmo social, adesao, reconhecimento precoce de recaida e prevencao de privacao de sono.",
        "- Envolver familia/rede de apoio quando possivel e orientar sinais de mania, depressao e risco."
      ],
      exams: [
        "- Hemograma, TGO/TGP, bilirrubinas, ureia, creatinina, sodio, potassio, TSH/T4 livre, glicemia ou HbA1c, perfil lipidico.",
        "- Beta-HCG quando aplicavel, ECG conforme idade/risco, peso, IMC, circunferencia abdominal e pressao arterial.",
        "- Para litio: litemia apos estabilizacao/titulacao, funcao renal, tireoide e calcio conforme seguimento.",
        "- Para valproato: funcao hepatica, plaquetas e nivel serico quando indicado."
      ]
    };
  }
  if (diagnosisText.includes("ansiedade") || diagnosisText.includes("panico")) {
    return {
      label: "Transtorno de ansiedade ou panico",
      medications: [
        "- Opcao 1: sertralina 25 mg/dia por 7 dias, depois 50 mg/dia; titular gradualmente conforme resposta e efeitos adversos.",
        "- Opcao 2: escitalopram 5 mg/dia por 7 dias, depois 10 mg/dia; considerar progressao conforme resposta.",
        "- Opcao 3: venlafaxina XR 37,5 mg/dia, depois 75 mg/dia se indicado; monitorar pressao arterial e tolerabilidade.",
        "- Benzodiazepinico apenas se necessario, por curto prazo, avaliando risco de dependencia, sedacao, quedas e uso de substancias."
      ],
      therapies: [
        "- Terapia cognitivo-comportamental com psicoeducacao, exposicao gradual, manejo de preocupacao e treino respiratorio quando indicado.",
        "- Orientar reducao de cafeina/estimulantes, higiene do sono, atividade fisica e plano para crises."
      ],
      exams: [
        "- Hemograma, TSH/T4 livre, glicemia ou HbA1c, funcao renal/hepatica e B12 conforme contexto.",
        "- ECG se houver sintomas cardiacos, idade/risco cardiovascular ou medicacoes que justifiquem.",
        "- Avaliar uso de substancias, cafeina, estimulantes e causas clinicas de sintomas autonomicos."
      ]
    };
  }
  if (diagnosisText.includes("obsessivo") || diagnosisText.includes("toc")) {
    return {
      label: "Transtorno obsessivo-compulsivo",
      medications: [
        "- Opcao 1: sertralina 25-50 mg/dia; titular gradualmente, podendo necessitar doses maiores conforme resposta e tolerabilidade.",
        "- Opcao 2: fluoxetina 10-20 mg/dia; progredir gradualmente conforme resposta.",
        "- Opcao 3: fluvoxamina 25-50 mg/noite; titular progressivamente observando interacoes e sedacao.",
        "- Em casos resistentes, considerar potencializacao somente apos reavaliar diagnostico, adesao e dose/duracao adequadas."
      ],
      therapies: [
        "- TCC com exposicao e prevencao de resposta como abordagem central.",
        "- Mapear compulsões, evitacoes, acomodacao familiar e prejuizo funcional."
      ],
      exams: [
        "- Hemograma, TSH/T4 livre, funcao renal/hepatica, glicemia ou HbA1c e perfil lipidico conforme medicacao e comorbidades.",
        "- ECG se houver uso de triciclico, risco cardiaco ou associacoes medicamentosas relevantes."
      ]
    };
  }
  if (diagnosisText.includes("psicot") || diagnosisText.includes("esquiz")) {
    return {
      label: "Transtorno psicotico ou sintomas psicoticos",
      medications: [
        "- Opcao 1: risperidona 0,5-1 mg/noite; titular gradualmente conforme resposta, sintomas extrapiramidais e prolactina.",
        "- Opcao 2: olanzapina 2,5-5 mg/noite; titular conforme resposta, monitorando peso, glicemia e lipidios.",
        "- Opcao 3: aripiprazol 5 mg/dia; ajustar conforme resposta, acatisia e tolerabilidade.",
        "- Avaliar necessidade de urgencia, contencao ambiental, rede de apoio e adesao supervisionada."
      ],
      therapies: [
        "- Psicoeducacao, intervencoes familiares, reducao de estresse, manejo de substancias e plano de crise.",
        "- Avaliar funcionalidade, risco, autocuidado e necessidade de acompanhamento intensivo."
      ],
      exams: [
        "- Hemograma, eletrólitos, funcao renal/hepatica, TSH/T4 livre, B12/folato conforme contexto, glicemia ou HbA1c e perfil lipidico.",
        "- Triagem toxicológica quando indicado, beta-HCG quando aplicavel, ECG conforme risco/medicacao.",
        "- Peso, IMC, circunferencia abdominal e pressao arterial antes e durante antipsicotico."
      ]
    };
  }
  return {
    label: diagnosisText ? "Diagnostico informado no prontuario" : "Diagnostico ainda nao preenchido",
    medications: [
      "- Opcao 1: sertralina 25 mg/dia por 7 dias, depois 50 mg/dia, se quadro depressivo/ansioso for confirmado e nao houver sinais de bipolaridade.",
      "- Opcao 2: escitalopram 5 mg/dia por 7 dias, depois 10 mg/dia, se indicado pelo perfil clinico.",
      "- Opcao 3: mirtazapina 15 mg/noite quando insonia/perda ponderal forem relevantes, avaliando sedacao e ganho de peso.",
      "- Se houver suspeita bipolar, psicose, alto risco suicida, gestacao ou comorbidade clinica importante, individualizar e considerar outra classe/encaminhamento."
    ],
    therapies: [
      "- Psicoterapia conforme formulacao do caso: TCC, terapia interpessoal, terapia familiar ou abordagem de apoio.",
      "- Intervencoes de sono, rotina, atividade fisica, manejo de estressores, rede de apoio e reducao de substancias."
    ],
    exams: [
      "- Hemograma, TSH/T4 livre, glicemia ou HbA1c, perfil lipidico, funcao renal/hepatica, sodio, potassio, B12 e vitamina D conforme contexto.",
      "- ECG conforme idade, risco cardiovascular, sintomas, interacoes ou medicacoes com risco de QT.",
      "- Beta-HCG quando aplicavel e exames adicionais conforme achados clinicos."
    ]
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

function conciseTreatmentText(form = {}) {
  const selectedExams = requestedExamsText(form) || form.examesLaboratoriais;
  const parts = [
    form.condutaMedica ? cleanClinicalLine(form.condutaMedica) : "",
    selectedExams ? `Exames solicitados: ${cleanClinicalLine(selectedExams)}` : ""
  ].filter(Boolean);
  return parts.length ? parts.join(". ") : "Conduta médica e exames não registrados";
}

function cleanClinicalLine(value = "") {
  return stripFinalPeriod(value)
    .replace(/^\s*(QP|HDA)\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function clinicalIdentificationText(patient = {}) {
  return patientIdentificationText(patient, true) || "Paciente com dados de identificação ainda não preenchidos.";
}

function clinicalAnamnesisSection(form, previous = null, isReturn = false) {
  if (isReturn) return polishClinicalText(returnAnamnesisSection(form, previous));
  const qphda = anamnesisText(form);
  const complaint = stripFinalPeriod(form.queixa || firstLineFromQphda(qphda));
  const story = stripFinalPeriod(form.historia || remainingQphdaText(qphda, form.queixa));
  const fatorText = joinWithOutro(form.fatores, form.fatoresOutro);
  const melhoraText = joinWithOutro(form.fatoresMelhora, form.fatoresMelhoraOutro);
  const impactoText = joinValues(form.impacto);
  const structured = structuredAnamnesisText(form);
  const parts = [
    complaint ? `Comparece ao servico queixando-se de ${lowerFirst(complaint)}.` : "Comparece ao servico para avaliacao psiquiatrica.",
    story ? `Relata ${lowerFirst(story)}.` : "",
    structured,
    fatorText ? `Identifica ${lowerFirst(fatorText)} como fatores associados, desencadeantes ou de piora do quadro.` : "",
    melhoraText ? improvementSentence(melhoraText) : "",
    impactoText ? `Refere impacto funcional ${lowerFirst(impactoText)}.` : ""
  ].filter(Boolean);
  return polishClinicalText(parts.join(" "));
}

function returnAnamnesisSection(form, previous) {
  const medicationPlan = joinWithOutro(form.condutaMedicamentoRetorno, form.condutaMedicamentoRetornoOutro);
  return [
    returnStoryText(form, previous),
    medicationPlan ? `A conduta medicamentosa definida no retorno inclui ${lowerFirst(medicationPlan)}.` : ""
  ].filter(Boolean).join(" ") || "Dados de retorno ainda nao preenchidos.";
}

function structuredAnamnesisText(form) {
  const parts = [
    joinWithOutro(form.maniaHipomaniaSintomas, form.maniaHipomaniaSintomasOutro) ? `Relata sintomas de ativacao do humor: ${lowerFirst(joinWithOutro(form.maniaHipomaniaSintomas, form.maniaHipomaniaSintomasOutro))}.` : "",
    joinValues(form.ansiedadeSintomas)
      ? `Apresenta sintomas ansiosos: ${lowerFirst(joinValues(form.ansiedadeSintomas))}.`
      : positiveChoiceText(form, [
      ["ansiedadeFaltaControle", "dificuldade de controlar preocupacoes"],
      ["ansiedadePreocupacaoExcessiva", "preocupacao excessiva"],
      ["ansiedadeTensaoCorporal", "tensao corporal"],
      ["ansiedadeDificuldadeFocar", "dificuldade de concentracao"],
      ["ansiedadeAgitacao", "inquietacao psicomotora"],
      ["ansiedadeIrritabilidade", "irritabilidade"],
      ["ansiedadeSintomasFisicos", "sintomas autonomicos associados"]
    ], "Apresenta sintomas ansiosos:"),
    joinValues(form.sonoCaracteristicas)
      ? `Relata ${lowerFirst(joinValues(form.sonoCaracteristicas))}.`
      : "",
    joinValues(form.apetiteCaracteristicas)
      ? `Apresenta ${lowerFirst(joinValues(form.apetiteCaracteristicas))}.`
      : "",
    joinValues(form.depressaoSintomas)
      ? `Apresenta sintomas depressivos: ${lowerFirst(joinValues(form.depressaoSintomas))}.`
      : positiveChoiceText(form, [
      ["depressaoPoucoInteressePrazer", "anedonia ou reducao de interesse"],
      ["depressaoDesanimoDesesperanca", "desanimo e desesperanca"],
      ["depressaoSono", "alteracao do sono"],
      ["depressaoEnergia", "reduzida energia"],
      ["depressaoApetite", "alteracao do apetite"],
      ["depressaoConcentracao", "prejuizo de concentracao"],
      ["depressaoFalaLenta", "lentificacao da fala"],
      ["depressaoAgitacao", "agitacao psicomotora"],
      ["depressaoAutoestimaRuinaEstorvo", "baixa autoestima, ideias de ruina ou sentimento de estorvo"]
    ], "Apresenta sintomas depressivos:"),
    joinWithOutro(form.psicoseSintomas, form.psicoseSintomasOutro)
      ? `Apresenta sintomas psicoticos ou paranoides: ${lowerFirst(joinWithOutro(form.psicoseSintomas, form.psicoseSintomasOutro))}.`
      : positiveChoiceText(form, [
      ["sintomasPsicoticosParanoiaObservado", "ideacao paranoide ou persecutoria"],
      ["sintomasPsicoticosVozesRuidos", "percepcao auditiva incomum"]
    ], "Apresenta sintomas psicoticos:"),
    form.sintomasPsicoticosOutro ? `Outros sintomas psicoticos relatados: ${stripFinalPeriod(form.sintomasPsicoticosOutro)}.` : "",
    riskText(form)
  ].filter(Boolean);
  return parts.join(" ");
}

function positiveChoiceText(form, pairs, opening) {
  const positives = pairs.filter(([key]) => form[key] === "SIM").map(([, label]) => label);
  return positives.length ? `${opening} ${formatClinicalList(positives)}.` : "";
}

function riskText(form) {
  const legacyRisks = [
    form.riscoSuicidioIdeacao === "SIM" ? "ideacao suicida" : "",
    form.riscoSuicidioPlanejamento === "SIM" ? "planejamento suicida" : "",
    form.riscoSuicidioMeios === "SIM" ? "acesso a meios potencialmente letais" : "",
    form.riscoSuicidioTentativasPrevias === "SIM" ? "tentativas previas de autoagressao" : ""
  ].filter(Boolean);
  const risks = joinValues(form.riscoSuicidioIndicadores) || formatClinicalList(legacyRisks);
  const impediments = form.riscoSuicidioRazoesViver ? ` O que impede a acao hoje: ${stripFinalPeriod(form.riscoSuicidioRazoesViver)}.` : "";
  const reasons = form.riscoSuicidioRazoesParaViver ? ` Razoes para viver registradas: ${stripFinalPeriod(form.riscoSuicidioRazoesParaViver)}.` : "";
  return `${risks ? `Apresenta ${lowerFirst(risks)}.` : ""}${impediments}${reasons}`.trim();
}

function clinicalAntecedentsSection(form) {
  const parts = [
    joinWithOutro(form.psiPrevios, form.psiPreviosOutro) ? `Apresenta antecedentes psiquiatricos de ${lowerFirst(joinWithOutro(form.psiPrevios, form.psiPreviosOutro))}.` : "",
    joinWithOutro(form.tratamentos, form.tratamentosOutro) ? `Historico de tratamentos previos com ${lowerFirst(joinWithOutro(form.tratamentos, form.tratamentosOutro))}.` : "",
    joinWithOutro(form.medicos, form.medicosOutro) ? `Antecedentes medicos: ${stripFinalPeriod(joinWithOutro(form.medicos, form.medicosOutro))}.` : "",
    joinWithOutro(form.familiares, form.familiaresOutro) ? `Historico familiar positivo para ${lowerFirst(joinWithOutro(form.familiares, form.familiaresOutro))}.` : "",
    joinWithOutro(form.substancias, form.substanciasOutro) ? `Relata uso/habitos relacionados a ${lowerFirst(joinWithOutro(form.substancias, form.substanciasOutro))}.` : "",
    joinWithOutro(form.usoSubstanciasComportamentos, form.usoSubstanciasComportamentosOutro) ? `Apresenta habitos, uso de substancias ou comportamentos aditivos: ${lowerFirst(joinWithOutro(form.usoSubstanciasComportamentos, form.usoSubstanciasComportamentosOutro))}.` : ""
  ].filter(Boolean);
  return polishClinicalText(parts.join(" ") || "Sem antecedentes ou habitos relevantes informados ate o momento.");
}

function clinicalMentalExamSection(form) {
  const sentences = [
    clinicalMentalGroupSentence(form, "aparencia", "Aparencia e atitude"),
    clinicalMentalGroupSentence(form, "consciencia", "Consciencia"),
    clinicalMentalGroupSentence(form, "atencao", "Atencao"),
    clinicalMentalGroupSentence(form, "orientacao", "Orientacao"),
    clinicalMentalGroupSentence(form, "memoria", "Memoria"),
    clinicalMentalGroupSentence(form, "sensopercepcao", "Sensopercepcao"),
    clinicalMentalGroupSentence(form, "pensamentoCursoForma", "Curso e forma do pensamento"),
    clinicalMentalGroupSentence(form, "pensamentoConteudo", "Conteudo do pensamento"),
    clinicalMentalGroupSentence(form, "linguagem", "Linguagem"),
    clinicalMentalGroupSentence(form, "humor", "Humor"),
    clinicalMentalGroupSentence(form, "afeto", "Afeto"),
    clinicalMentalGroupSentence(form, "psicomotricidade", "Psicomotricidade"),
    clinicalMentalGroupSentence(form, "vontade", "Vontade"),
    clinicalMentalGroupSentence(form, "juizoCritico", "Juizo critico")
  ].filter(Boolean);
  return polishClinicalText(sentences.join(" ") || "Paciente sem alteracoes descritas no exame psiquico.");
}

function clinicalMentalGroupSentence(form, key, label) {
  const values = clinicalMentalValues(form, key);
  return values.length ? `${label}: ${formatClinicalList(values)}.` : "";
}

function polishClinicalText(value = "") {
  return `${stripFinalPeriod(value)
    .replace(/\s+/g, " ")
    .replace(/\bmedo de enlouquecer\b/gi, "medo de perda do controle cognitivo")
    .replace(/\bmedo de morrer\b/gi, "sensacao de morte iminente")
    .replace(/\bfalar muito\b/gi, "logorreia")
    .replace(/\bfalando muito\b/gi, "logorreia")
    .replace(/\bagitacao\b/gi, "agitacao psicomotora")
    .replace(/\bansioso\b/gi, "humor ansioso")
    .trim()}.`;
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

function evolutionOpeningText(form, patient = {}) {
  const identification = patientIdentificationText(patient, false).replace(/\.$/, "");
  const complaint = stripFinalPeriod(form.queixa || firstLineFromQphda(form.qphda) || "queixa nao informada");
  const subject = identification ? `Paciente ${identification}` : "Paciente";
  return `${subject}, se apresenta ao servico com queixa principal de "${complaint}".`;
}

function hdaEvolutionText(form, previous = null, isReturn = false) {
  if (isReturn) return `HDA: Paciente relata que ${lowerFirst(stripFinalPeriod(returnStoryText(form, previous)))}.`;
  const story = form.historia || remainingQphdaText(form.qphda, form.queixa);
  const fatorText = joinWithOutro(form.fatores, form.fatoresOutro);
  const melhoraText = joinWithOutro(form.fatoresMelhora, form.fatoresMelhoraOutro);
  const impactoText = joinValues(form.impacto);
  const parts = [
    story ? lowerFirst(stripFinalPeriod(story)) : "",
    fatorText ? `associa o quadro a ${lowerFirst(fatorText)}` : "",
    melhoraText ? lowerFirst(stripFinalPeriod(improvementSentence(melhoraText))) : "",
    impactoText ? `descreve impacto funcional como ${lowerFirst(impactoText)}` : ""
  ].filter(Boolean);
  return `HDA: Paciente relata que ${parts.length ? parts.join(". ") : "a historia da doenca atual ainda nao foi preenchida"}.`;
}

function antecedentsEvolutionText(form) {
  const parts = [
    joinWithOutro(form.psiPrevios, form.psiPreviosOutro) ? `historia pregressa de ${lowerFirst(joinWithOutro(form.psiPrevios, form.psiPreviosOutro))}` : "",
    joinWithOutro(form.tratamentos, form.tratamentosOutro) ? `tratamentos previos com ${lowerFirst(joinWithOutro(form.tratamentos, form.tratamentosOutro))}` : "",
    joinWithOutro(form.medicos, form.medicosOutro) ? `antecedentes medicos de ${lowerFirst(joinWithOutro(form.medicos, form.medicosOutro))}` : "",
    joinWithOutro(form.familiares, form.familiaresOutro) ? `antecedentes familiares de ${lowerFirst(joinWithOutro(form.familiares, form.familiaresOutro))}` : "",
    joinWithOutro(form.substancias, form.substanciasOutro) ? `uso de ${lowerFirst(joinWithOutro(form.substancias, form.substanciasOutro))}` : ""
  ].filter(Boolean);
  return `Antecedentes: ${parts.length ? parts.join("; ") : "sem antecedentes informados"}.`;
}

function mentalExamEvolutionText(form) {
  const findings = mentalStateFindings(form);
  return `Exame psiquico: Paciente ${findings.length ? formatClinicalList(findings) : "sem alteracoes descritas no exame psiquico"}.`;
}

function consultationStoryText(form) {
  const qphdaText = anamnesisText(form);
  const complaint = form.queixa || form.qphda || "";
  const story = form.historia || (!form.queixa ? "" : form.qphda || "");
  const fatorText = joinWithOutro(form.fatores, form.fatoresOutro);
  const melhoraText = joinWithOutro(form.fatoresMelhora, form.fatoresMelhoraOutro);
  const impactoText = joinValues(form.impacto);
  const parts = [
    complaint
      ? `Comparece para avaliacao psiquiatrica com queixa principal de ${stripFinalPeriod(complaint)}.`
      : "Comparece para avaliacao psiquiatrica.",
    story ? `Relata que ${lowerFirst(stripFinalPeriod(story))}.` : (!form.queixa && qphdaText ? `Relata ${lowerFirst(stripFinalPeriod(qphdaText))}.` : ""),
    fatorText ? `Quadro associado ou desencadeado por ${lowerFirst(fatorText)}.` : "",
    melhoraText ? improvementSentence(melhoraText) : "",
    impactoText ? `Descreve o impacto funcional como ${lowerFirst(impactoText)}.` : ""
  ].filter(Boolean);
  return parts.join(" ");
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

function historyText(form) {
  const parts = [
    joinValues(form.psiPrevios) ? `Antecedentes psiquiatricos: ${joinValues(form.psiPrevios)}${form.psiPreviosOutro ? ` (${form.psiPreviosOutro})` : ""}.` : "",
    joinValues(form.tratamentos) ? `Tratamentos previos: ${joinValues(form.tratamentos)}${form.tratamentosOutro ? ` (${form.tratamentosOutro})` : ""}.` : "",
    joinValues(form.medicos) ? `Antecedentes clinicos: ${joinValues(form.medicos)}${form.medicosOutro ? ` (${form.medicosOutro})` : ""}.` : "",
    joinValues(form.familiares) ? `Antecedentes familiares: ${joinValues(form.familiares)}${form.familiaresOutro ? ` (${form.familiaresOutro})` : ""}.` : "",
    joinValues(form.substancias) ? `Habitos/substancias: ${joinValues(form.substancias)}${form.substanciasOutro ? ` (${form.substanciasOutro})` : ""}.` : ""
  ].filter(Boolean);
  return parts.length ? `Antecedentes e contexto: ${parts.join(" ")}` : "";
}

function mentalStateText(form) {
  const findings = mentalStateFindings(form);
  return findings.length ? `Ao exame psiquico, observou-se ${formatClinicalList(findings)}.` : "";
}

function mentalStateFindings(form) {
  return mentalExamKeys()
    .flatMap(key => clinicalMentalValues(form, key))
    .filter(Boolean);
}

function relevantNegativeText(form) {
  const negativeFindings = [
    ...negativeValues("impacto", form.impacto),
    ...negativeValues("sensopercepcao", form.sensopercepcao),
    ...negativeValues("pensamento, curso e forma", form.pensamentoCursoForma),
    ...negativeValues("pensamento, conteudo", form.pensamentoConteudo),
    ...negativeValues("juizo critico", form.juizoCritico),
    ...negativeValues("aparencia", form.aparencia),
    ...negativeValues("consciencia", form.consciencia),
    ...negativeValues("atencao", form.atencao),
    ...negativeValues("orientacao", form.orientacao),
    ...negativeValues("memoria", form.memoria),
    ...negativeValues("linguagem", form.linguagem),
    ...negativeValues("afeto", form.afeto),
    ...negativeValues("psicomotricidade", form.psicomotricidade),
    ...negativeValues("vontade", form.vontade),
    ...negativeValues("efeitos", form.efeitos),
    ...negativeValues("ansiedadeRetorno", form.ansiedadeRetorno)
  ];
  return negativeFindings.length ? `Achados negativos ou preservados registrados: ${uniqueValues(negativeFindings).join("; ")}.` : "";
}

function negativeValues(label, value) {
  return valueList(value).filter(item => {
    const text = normalizeText(item);
    return text.startsWith("sem ") || text.includes("preservad") || text === "nenhum" || text === "ausente";
  }).map(item => `${label}: ${item}`);
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

function clinicalValueList(value, otherValue = "") {
  return [
    ...valueList(value).filter(item => !["ndn", "outro"].includes(normalizeText(item))),
    otherValue
  ].map(clinicalPhrase).filter(Boolean);
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

function polishSoapText(value = "") {
  return `${stripFinalPeriod(value)
    .replace(/\s+/g, " ")
    .replace(/\. Comparece/g, ", encaminhado ao atendimento com a psiquiatria. Comparece")
    .replace(/\. Antecedentes e contexto:/g, ". Na historia pregressa,")
    .replace(/Antecedentes psiquiatricos:/g, "faz mencao a")
    .replace(/Tratamentos previos:/g, "tratamentos previos:")
    .trim()}.`;
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
  return form.qphda || [form.queixa && `QP: ${form.queixa}`, form.historia && `HDA: ${form.historia}`].filter(Boolean).join("\n");
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
  return { ...data };
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
  return { patientId: selectedPatientId, label: `Consulta ${count}`, type: "consultation" };
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

async function copyEvolution() {
  const text = normalizeEvolutionNarrative(app.querySelector("[name='evolution']")?.value);
  await navigator.clipboard?.writeText(text);
  alert("Evolucao copiada.");
}

function printEvolution() {
  const text = normalizeEvolutionNarrative(app.querySelector("[name='evolution']")?.value);
  const patient = getPatient();
  const title = patient?.nome ? `Evolução médica — ${patient.nome}` : "Evolução médica";
  exportTextAsPdf(title, text, `${patient?.nome || "Paciente"} - Evolução médica`);
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
  const text = groups.map(group => [
    group.title.toUpperCase(),
    ...group.rows.map(row => group.layout === "area-record"
      ? `${row.section} | ${row.value}`
      : `${row.section} | ${row.item} | ${row.value}`)
  ].join("\n")).join("\n\n");
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
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    setVoiceStatus(button, "Reconhecimento de voz indisponível neste navegador", "error");
    return alert("A transcrição por voz não está disponível neste navegador. Use Chrome, Edge ou Safari atualizado.");
  }

  if (activeVoiceRecognition) {
    activeVoiceRecognition.stop();
    return;
  }

  const fieldElement = app.querySelector(`[name='${targetName}']`);
  if (!fieldElement) return;

  if (!window.isSecureContext) {
    setVoiceStatus(button, "O microfone exige uma conexão segura", "error");
    return alert("Abra o sistema por http://127.0.0.1:8000 ou por HTTPS para permitir o uso do microfone.");
  }

  const hasPermission = await requestMicrophonePermission(button);
  if (!hasPermission) return;

  const recognition = new SpeechRecognition();
  recognition.lang = "pt-BR";
  recognition.continuous = true;
  recognition.interimResults = true;
  activeVoiceRecognition = recognition;
  activeVoiceButton = button;

  recognition.onstart = () => {
    button.classList.add("is-listening");
    button.setAttribute("aria-label", "Parar transcrição por voz");
    button.title = "Parar transcrição";
    setVoiceStatus(button, "Ouvindo… clique novamente para parar", "listening");
  };

  recognition.onresult = event => {
    let finalTranscript = "";
    let interimTranscript = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const transcript = event.results[index][0].transcript;
      if (event.results[index].isFinal) finalTranscript += transcript;
      else interimTranscript += transcript;
    }
    if (finalTranscript.trim()) {
      fieldElement.value = `${fieldElement.value.trim()}${fieldElement.value.trim() ? " " : ""}${finalTranscript.trim()}`;
      updateDraftFromForm(fieldElement.closest("form"));
    }
    if (interimTranscript.trim()) setVoiceStatus(button, `Ouvindo: “${interimTranscript.trim()}”`, "listening");
  };

  recognition.onerror = event => {
    const messages = {
      "not-allowed": "Microfone bloqueado — libere-o nas configurações do site",
      "audio-capture": "Nenhum microfone foi encontrado",
      "no-speech": "Nenhuma fala foi detectada",
      network: "Falha na conexão do reconhecimento de voz"
    };
    setVoiceStatus(button, messages[event.error] || "Não foi possível transcrever. Tente novamente.", "error");
    if (event.error === "not-allowed") showMicrophonePermissionHelp();
  };

  recognition.onend = () => {
    const currentButton = activeVoiceButton;
    activeVoiceRecognition = null;
    activeVoiceButton = null;
    if (!currentButton) return;
    currentButton.classList.remove("is-listening");
    currentButton.setAttribute("aria-label", "Iniciar transcrição por voz");
    currentButton.title = "Transcrever por voz";
    if (currentButton.closest(".voice-controls")?.querySelector(".voice-status")?.dataset.state !== "error") {
      setVoiceStatus(currentButton, "Transcrição finalizada", "done");
    }
  };

  try {
    recognition.start();
  } catch {
    activeVoiceRecognition = null;
    activeVoiceButton = null;
    setVoiceStatus(button, "Não foi possível iniciar o microfone", "error");
  }
}

async function requestMicrophonePermission(button) {
  if (!navigator.mediaDevices?.getUserMedia) {
    setVoiceStatus(button, "Acesso ao microfone indisponível", "error");
    alert("Este navegador não permite acesso ao microfone. Use Chrome, Edge ou Safari atualizado.");
    return false;
  }

  setVoiceStatus(button, "Solicitando acesso ao microfone…", "requesting");
  button.classList.add("is-requesting");

  try {
    // A verificacao de permissao deve usar a constraint mais compativel.
    // Safari pode rejeitar propriedades avancadas com "Invalid constraint".
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
    button.classList.remove("is-requesting");
    setVoiceStatus(button, "Microfone autorizado. Iniciando…", "done");
    return true;
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
    return false;
  }
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
