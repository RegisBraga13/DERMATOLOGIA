import { optionGroups } from "./data/examOptions.js";
import { medications } from "./data/medications.js";
import { fetchCep } from "./services/cepService.js";
import { exportTextAsPdf } from "./services/pdfService.js";
import { loadState, saveState, uid } from "./services/storageService.js";

const app = document.querySelector("#app");
let state = loadState();
let view = "dashboard";
let selectedPatientId = state.patients[0]?.id || "";
let draft = {};
let consultationPage = "anamnese";
let returnPage = "evolucao-retorno";
let modal = null;
let pendingViewAfterPatient = "";
const consultationPages = [
  ["anamnese", "Anamnese"],
  ["antecedentes", "Antecedentes"],
  ["psiquico", "Exame psiquico"],
  ["evolucao", "Evolucao"],
  ["neurologico", "Exame neurologico"],
  ["diagnostico", "Diagnostico"],
  ["tratamento", "Tratamento"],
  ["medicamentos", "Medicamentos"]
];
const returnPages = [
  ["evolucao-retorno", "Evolucao"],
  ["diagnostico", "Diagnostico"],
  ["tratamento", "Tratamento"],
  ["medicamentos", "Medicamentos"],
  ["texto-retorno", "Texto final"]
];
const aiDiagnosticAgents = [
  "ChatGPT",
  "Claude",
  "Gemini",
  "Perplexity",
  "Mistral",
  "Llama"
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
  psicomotricidadeVontade: `Observe postura, movimentos, iniciativa e velocidade psicomotora.
Ha agitacao, lentificacao, estupor, catatonia, tiques ou acatisia?
Ha abulia, hipobulia, impulsividade, compulsao ou ecopraxia?`,
  juizoCritico: `O paciente reconhece sintomas, prejuizos e necessidade de cuidado?
Compreende consequencias dos proprios atos e decisoes?
Ha negacao da doenca, critica parcial ou delirio de normalidade?`
};
const anamnesisQuestionGroups = [
  {
    title: "Perguntas imprescindiveis - rastreio inicial",
    items: [
      ["A. Queixa e impacto", [
        "Nas suas proprias palavras, o que te trouxe aqui hoje?",
        {
          key: "impactoSintomas",
          response: "multiple",
          question: "De que forma isso que voce esta sentindo atrapalha o seu trabalho, seus estudos ou suas relacoes?",
          options: ["Nenhuma", "Leve", "Moderado", "Grave", "Outro"],
          otherKey: "impactoSintomasOutro"
        }
      ]],
      ["B. Mania/hipomania", [
        {
          key: "maniaHipomaniaSintomas",
          response: "multiple",
          question: "Ja teve periodos, por dias, que voce ficou:",
          options: ["Muito acelerado", "Com muita energia", "Falando mais", "Dormindo pouco", "Fazendo coisas impulsivas", "Outro"],
          otherKey: "maniaHipomaniaSintomasOutro"
        }
      ]],
      ["C. Ansiedade e panico", [
        { key: "ansiedadeFaltaControle", label: "Falta de controle", question: "Voce sente que nao consegue parar ou controlar as suas preocupacoes?", response: "choice" },
        { key: "ansiedadePreocupacaoExcessiva", label: "Preocupacao excessiva", question: "Voce se preocupa muito com diversas coisas do dia a dia, mesmo sem motivos graves?", response: "choice" },
        { key: "ansiedadeTensaoCorporal", label: "Tensao corporal", question: "Voce sente dificuldade para relaxar, tensao muscular ou fica com dor no corpo sem causa aparente?", response: "choice" },
        { key: "ansiedadeDificuldadeFocar", label: "Dificuldade de focar", question: "Sente que e dificil se concentrar nas suas tarefas ou pensamentos?", response: "choice" },
        { key: "ansiedadeAgitacao", label: "Agitacao", question: "Fica tao inquieto ou agitado a ponto de ter dificuldade para ficar sentado?", response: "choice" },
        { key: "ansiedadeIrritabilidade", label: "Irritabilidade", question: "Tem ficado mais irritado(a) ou impaciente que o normal?", response: "choice" },
        { key: "ansiedadeSintomasFisicos", label: "Sintomas fisicos", question: "Apresenta palpitacoes, falta de ar, suor frio, tontura ou problemas para dormir com frequencia?", response: "choice" }
      ]],
      ["D. Sono e apetite", [
        "O seu sono tem sido reparador? Voce demora a pegar no sono ou acorda muito antes do horario?",
        "O seu apetite sumiu ou voce esta comendo compulsivamente?"
      ]],
      ["8. Sintomas depressivos", [
        { key: "depressaoPoucoInteressePrazer", label: "Interesse ou prazer", question: "Apresenta pouco interesse ou prazer em fazer coisas?", response: "choice" },
        { key: "depressaoDesanimoDesesperanca", label: "Desanimo e desesperanca", question: "Apresenta desanimo, desalento ou falta de esperanca?", response: "choice" },
        { key: "depressaoSono", label: "Sono", question: "Apresenta dificuldade em adormecer, dormir sem interrupcoes ou dormir demais?", response: "choice" },
        { key: "depressaoEnergia", label: "Energia", question: "Apresenta cansaco ou falta de energia?", response: "choice" },
        { key: "depressaoApetite", label: "Apetite", question: "Apresenta falta ou excesso de apetite?", response: "choice" },
        { key: "depressaoConcentracao", label: "Concentracao", question: "Teve dificuldade em concentrar-se nas coisas, como ao ler jornal ou ver televisao?", response: "choice" },
        { key: "depressaoFalaLenta", label: "Fala lenta", question: "Apresenta fala lenta que outras pessoas notaram?", response: "choice" },
        { key: "depressaoAgitacao", label: "Agitacao", question: "Apresenta agitacao, andando de um lado para o outro muito mais do que o habitual?", response: "choice" },
        { key: "depressaoAutoestimaRuinaEstorvo", label: "Autoestima e estorvo", question: "Apresenta baixa estima, sentimento de ruina, desilusao ou sentimento de estorvo para a familia?", response: "choice" }
      ]]
    ]
  },
  {
    title: "Perguntas apos vinculo com o paciente",
    items: [
      ["F. Sintomas psicoticos e paranoia", [
        { key: "sintomasPsicoticosParanoiaObservado", label: "Paranoia", question: "Voce tem tido a sensacao de que as pessoas estao te observando, comentando sobre voce ou querendo te prejudicar?", response: "choice" },
        { key: "sintomasPsicoticosVozesRuidos", label: "Vozes ou ruidos", question: "Voce ja escutou vozes ou ruidos quando estava sozinho?", response: "choice" },
        { key: "sintomasPsicoticosOutro", label: "Outro", question: "Outro", response: "text", placeholder: "Especifique aqui" }
      ]],
      ["7. Uso de substancias e comportamentos aditivos", [
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
      ["A. Risco de suicidio e desesperanca", [
        { key: "riscoSuicidioIdeacao", label: "Ideacao", question: "Voce tem pensado em desistir da vida ou em morrer?", response: "choice" },
        { key: "riscoSuicidioPlanejamento", label: "Planejamento", question: "Voce ja pensou em como faria isso ou quando?", response: "choice" },
        { key: "riscoSuicidioMeios", label: "Meios", question: "Voce tem acesso aos meios para colocar esse plano em pratica?", response: "choice" },
        { key: "riscoSuicidioTentativasPrevias", label: "Tentativas previas", question: "Voce ja tentou machucar a vida no passado?", response: "choice" },
        { key: "riscoSuicidioRazoesViver", label: "Razoes para viver", question: "O que te impede de fazer isso hoje?", response: "text" }
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

render();

function render() {
  document.body.classList.toggle("light", state.theme === "light");
  app.innerHTML = `
    <div class="app-shell">
      ${topbar()}
      <main class="container">${view === "dashboard" ? dashboard() : workspace()}</main>
      <footer class="footer-note">Sistema de prontuario clinico. localStorage apenas para prototipo; usar backend seguro/LGPD em producao.</footer>
      ${modal || ""}
    </div>
  `;
  bindGlobalEvents();
  bindViewEvents();
}

function topbar() {
  return `
    <header class="topbar">
      <div class="brand">
        <h1>Regis Braga Psiquiatria - Prontuario Psiquiatrico</h1>
        <p>Evolucao clinica | Prontuario longitudinal</p>
      </div>
      <div class="top-actions">
        ${view === "dashboard" ? "" : `<button class="secondary" data-action="dashboard">Inicio</button>`}
        <button class="secondary" data-action="toggle-theme">${state.theme === "light" ? "Modo escuro" : "Modo claro"}</button>
      </div>
    </header>
  `;
}

function dashboard() {
  const cards = [
    ["patient", "Novo Paciente", "Identificacao, contato e CEP.", "patient"],
    ["consult", "Nova Consulta", "Anamnese, exame e evolucao.", "consultation"],
    ["return", "Retorno", "Seguimento comparativo.", "return"],
    ["record", "Prontuario", "Linha do tempo e busca.", "record"],
    ["exit", "Sair do Sistema", "Confirmacao e seguranca.", "exit"]
  ];
  return `<section class="dashboard">${cards.map(([icon, title, desc, target]) => `
    <button class="dash-button" data-view="${target}">
      <span class="dash-icon">${icons[icon]}</span>
      <span><strong>${title}</strong><span>${desc}</span></span>
    </button>`).join("")}</section>`;
}

function workspace() {
  return `
    <div class="layout">
      <aside class="side">
        ${navButton("patient", "Paciente", "patient")}
        ${navButton("consultation", "Consulta", "consult")}
        ${navButton("return", "Retorno", "return")}
        ${navButton("record", "Prontuario", "record")}
        ${navButton("exit", "Sair", "exit")}
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
      <div><h2>Novo Paciente</h2><p>Identificacao editavel para consultas futuras.</p></div>
      ${patientSelector("edit-patient")}
    </div>
    <form id="patient-form">
      <div class="grid">
        ${field("nome", "Nome completo", patient.nome)}
        ${selectField("sexo", "Sexo", optionGroups.sexo, patient.sexo)}
        ${field("nascimento", "Data de nascimento", patient.nascimento, "date")}
        ${selectField("estadoCivil", "Estado civil", optionGroups.estadoCivil, patient.estadoCivil)}
        ${field("filhos", "Numero de filhos", patient.filhos, "number")}
        ${field("ocupacao", "Ocupacao", patient.ocupacao)}
        ${selectField("moradia", "Moradia", optionGroups.moradia, patient.moradia)}
        ${field("procedencia", "Procedencia", patient.procedencia)}
        ${selectField("escolaridade", "Escolaridade", optionGroups.escolaridade, patient.escolaridade)}
        ${selectField("religiao", "Religiao", optionGroups.religiao, patient.religiao)}
        ${field("telefone", "Telefone", patient.telefone, "tel")}
        ${field("email", "E-mail", patient.email, "email")}
        ${field("acompanhante", "Nome de acompanhante, se houver", patient.acompanhante)}
        ${field("emergencia", "Contato de emergencia", patient.emergencia)}
        ${field("cep", "CEP", patient.cep)}
        ${field("endereco", "Endereco", patient.endereco)}
        ${field("numero", "Numero", patient.numero)}
        ${field("complemento", "Complemento", patient.complemento)}
        ${field("bairro", "Bairro", patient.bairro)}
        ${field("cidade", "Cidade", patient.cidade)}
        ${field("estado", "Estado", patient.estado)}
      </div>
      <div class="warning" id="cep-status">Digite o CEP com 8 digitos para preencher endereco automaticamente.</div>
      <div class="actions">
        <button class="primary" type="submit">Salvar Paciente</button>
        <button class="secondary" type="button" data-action="clear-patient">Novo cadastro em branco</button>
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
  return `
    <div class="panel-title">
      <div><h2>${form.label}</h2><p>${escapeHtml(patient.nome)} | consulta numerada automaticamente.</p></div>
      ${patientSelector()}
    </div>
    <form id="consult-form">
      ${formPageTabs("consultation")}
      ${consultationPageBody(form, patient)}
    </form>
  `;
}

function returnForm() {
  const patient = getPatient();
  if (!patient) return emptyPatientMessage("Retorno");
  const form = draft.return || defaultReturn();
  const previous = latestEntry(patient.id);
  return `
    <div class="panel-title">
      <div><h2>${form.label}</h2><p>${escapeHtml(patient.nome)} | comparacao com consulta anterior.</p></div>
      ${patientSelector()}
    </div>
    <form id="return-form">
      <div class="warning">Resumo anterior: ${previous ? escapeHtml(previous.label) + " - " + escapeHtml((previous.evolution || previous.queixa || "").slice(0, 180)) : "sem registros anteriores."}</div>
      ${formPageTabs("return")}
      ${returnPageBody(form, patient, previous)}
    </form>
  `;
}

function formPageTabs(scope) {
  const pages = pagesForScope(scope);
  const active = scope === "consultation" ? consultationPage : returnPage;
  return `<nav class="page-tabs" aria-label="Paginas do formulario">${pages.map(([key, label]) => `
    <button type="button" class="${active === key ? "active" : ""}" data-action="form-page" data-scope="${scope}" data-page="${key}">${label}</button>
  `).join("")}</nav>`;
}

function clinicalPage(title, body, scope = "") {
  return `<section class="clinical-page"><div class="clinical-page-title"><h3>${title}</h3></div>${body}${pageStepActions(scope)}</section>`;
}

function consultationPageBody(form, patient) {
  if (consultationPage === "anamnese") return clinicalPage("A. Anamnese", `
    ${voiceTextarea("queixa", "Queixa principal nas palavras do paciente", form.queixa)}
    ${voiceTextarea("historia", "Historia do problema principal", form.historia, "Registrar cronologia dos sintomas, relacao temporal com eventos vitais, sintomas fisicos associados, fatores desencadeantes e de piora, fatores de melhora, uso de substancias, sintomas positivos e negativos, impacto funcional e tratamentos previos.")}
    ${anamnesisQuestionGuide()}
    ${chips("fatores", "Fatores desencadeantes e de piora", optionGroups.fatores, form.fatores)}
    ${chips("fatoresMelhora", "Fatores de melhora", optionGroups.fatoresMelhora, form.fatoresMelhora)}
    ${chips("impacto", "Impacto funcional", optionGroups.impacto, form.impacto)}
  `, "consultation");
  if (consultationPage === "antecedentes") return clinicalPage("Antecedentes", `
    ${chips("psiPrevios", "Diagnosticos psiquiatricos previos", optionGroups.psiPrevios, form.psiPrevios)}
    ${chips("tratamentos", "Tratamentos previos", optionGroups.tratamentos, form.tratamentos)}
    ${textarea("medicos", "Antecedentes medicos", joinValues(form.medicos), "", 2)}
    ${chips("familiares", "Antecedentes familiares", optionGroups.familiares, form.familiares)}
  `, "consultation");
  if (consultationPage === "psiquico") return clinicalPage("B. Exame psiquico", mentalExamBody(form), "consultation");
  if (consultationPage === "evolucao") return clinicalPage("C. Evolucao do Paciente", evolutionBody(form, patient), "");
  if (consultationPage === "neurologico") return clinicalPage("D. Exame fisico e neurologico", neurologicExamBody(form), "consultation");
  if (consultationPage === "diagnostico") return clinicalPage("E. Diagnostico e diferenciais", diagnosisModule(form), "consultation");
  if (consultationPage === "tratamento") return clinicalPage("F. Tratamento e orientacoes", treatmentModule(form), "consultation");
  if (consultationPage === "medicamentos") return clinicalPage("Medicamentos", medicationBody(form), "consultation");
  return clinicalPage("C. Evolucao do Paciente", evolutionBody(form, patient), "");
}

function returnPageBody(form, patient, previous) {
  if (returnPage === "evolucao-retorno") return clinicalPage("Avaliacao de evolucao", returnAssessmentBody(form), "return");
  if (returnPage === "diagnostico") return clinicalPage("Diagnostico e diferenciais", diagnosisModule(form), "return");
  if (returnPage === "tratamento") return clinicalPage("Tratamento e orientacoes", treatmentModule(form), "return");
  if (returnPage === "medicamentos") return clinicalPage("Medicamentos", medicationBody(form), "return");
  return clinicalPage("Evolucao do Retorno", evolutionBody(form, patient, previous, true), "return");
}

function returnAssessmentBody(form) {
  return `
    <div class="grid">
      ${selectField("estadoGeral", "Estado geral desde a ultima consulta", optionGroups.retorno, form.estadoGeral)}
      ${selectField("sintomasPrincipais", "Sintomas principais", ["Remissao completa", "Melhora importante", "Melhora parcial", "Sem alteracao", "Piora", "Novos sintomas"], form.sintomasPrincipais)}
      ${selectField("sonoRetorno", "Sono", ["Melhorou", "Sem mudanca", "Piorou", "Insonia inicial", "Insonia intermediaria", "Despertar precoce", "Hipersonia", "Reducao da necessidade de sono"], form.sonoRetorno)}
      ${selectField("humorRetorno", "Humor", ["Eutimico", "Deprimido", "Ansioso", "Irritavel", "Euforico", "Disforico", "Oscilante"], form.humorRetorno)}
      ${selectField("ansiedadeRetorno", "Ansiedade", ["Ausente", "Leve", "Moderada", "Grave", "Crises de panico", "Evitacao"], form.ansiedadeRetorno)}
      ${selectField("funcionalidade", "Funcionalidade", ["Preservada", "Parcialmente prejudicada", "Muito prejudicada", "Incapacidade laboral", "Incapacidade academica", "Prejuizo social", "Prejuizo familiar"], form.funcionalidade)}
      ${selectField("adesao", "Adesao ao tratamento", ["Regular", "Parcial", "Irregular", "Interrompeu medicacao", "Uso em dose diferente da prescrita", "Esquecimentos frequentes", "Nao iniciou tratamento"], form.adesao)}
    </div>
    ${chips("efeitos", "Efeitos colaterais", ["Nenhum", "Sonolencia", "Insonia", "Nauseas", "Tremores", "Boca seca", "Constipacao", "Diarreia", "Disfuncao sexual", "Ganho de peso", "Perda de peso", "Acatisia", "Rigidez", "Discinesia", "Tontura", "Cefaleia", "Outro"], form.efeitos)}
    ${chips("eventos", "Eventos relevantes", ["Conflito familiar", "Conflito conjugal", "Problemas profissionais", "Problemas academicos", "Luto", "Internamento", "Urgencia/emergencia", "Uso de alcool/drogas", "Ideacao suicida", "Tentativa de suicidio", "Autoagressao", "Sintomas psicoticos", "Episodio de agitacao", "Outro"], form.eventos)}
    ${textarea("observacoesRetorno", "Observacoes clinicas do retorno", form.observacoesRetorno)}
  `;
}

function mentalExam(form) {
  return section("B. Exame psiquico", mentalExamBody(form), false);
}

function mentalExamBody(form) {
  const groups = [
    ["aparencia", "Aparencia, Atitude e Contato"],
    ["consciencia", "Consciencia"], ["atencao", "Atencao"], ["orientacao", "Orientacao"],
    ["memoria", "Memoria"], ["sensopercepcao", "Sensopercepcao"],
    ["pensamentoCursoForma", "Pensamento (Curso e Forma)"], ["pensamentoConteudo", "Pensamento (Conteudo)"],
    ["linguagem", "Linguagem"], ["humor", "Humor (Estado Basal)"], ["afeto", "Afeto (Resposta)"],
    ["psicomotricidadeVontade", "Psicomotricidade e Vontade"], ["juizoCritico", "Juizo Critico (Insight)"]
  ];
  return groups.map(([key, label]) => `
    ${chips(key, label, optionGroups[key], form[key])}
    ${questionTextarea(key, `Perguntas fixas - ${label}`, form[`${key}Perguntas`])}
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

function diagnosisTreatment(form) {
  return `
    ${section("E. Diagnostico e diferenciais", diagnosisModule(form))}
    ${section("F. Tratamento e orientacoes", treatmentModule(form))}
  `;
}

function diagnosisModule(form) {
  return `
    <div class="diagnosis-ai-panel">
      <div class="grid">
        ${selectField("aiDiagnosticAgent", "Agente de IA para gerar diagnosticos", aiDiagnosticAgents, form.aiDiagnosticAgent || "ChatGPT")}
        <label>Modelo/versao
          <input name="aiDiagnosticModel" value="${escapeAttr(form.aiDiagnosticModel || "")}" placeholder="Ex.: GPT-4.1, Claude Sonnet, Gemini Pro" />
        </label>
      </div>
      <div class="actions">
        <button class="primary" type="button" data-action="generate-diagnosis">Gerar diagnosticos por IA</button>
      </div>
      <div class="warning">Sugestoes geradas a partir da anamnese e do exame psiquico preenchidos. Revisao e decisao final permanecem do medico.</div>
    </div>
    ${textarea("diagnosticoManual", "Hipotese diagnostica principal gerada por IA, com CID-11 e DSM-5-TR", form.diagnosticoManual, "Clique em gerar diagnosticos por IA.")}
    ${textarea("diferenciais", "Diagnosticos diferenciais gerados por IA, com CID-11 e DSM-5-TR", form.diferenciais, "Clique em gerar diagnosticos por IA.")}
    <div class="info-box doctor-note">
      ${textarea("diagnosticoObservacaoMedica", "Observacao adicional do medico", form.diagnosticoObservacaoMedica, "Acrescente observacoes, ressalvas, hipoteses alternativas ou plano de investigacao.")}
    </div>
  `;
}

function treatmentModule(form) {
  return `
    ${textarea("conduta", "Plano terapeutico editavel: estilo de vida, sono, substancias, psicoterapia, exames, prescricao, risco e retorno", form.conduta)}
  `;
}

function medicationModule(form) {
  return section("Medicamentos", medicationBody(form));
}

function medicationBody(form) {
  const selected = medications.find(med => med.generic === form.medicationGeneric);
  return `
    <div class="grid">
      <label>Pesquisar medicamento
        <input list="med-list" name="medicationGeneric" value="${escapeAttr(form.medicationGeneric || "")}" placeholder="Digite o nome generico" />
        <datalist id="med-list">${medications.map(med => `<option value="${escapeAttr(med.generic)}"></option>`).join("")}</datalist>
      </label>
      ${field("manualPrice", "Preco/farmacia/observacao manual em Fortaleza", form.manualPrice)}
    </div>
    <div class="warning">Modulo de farmacias preparado para APIs publicas, scraping autorizado ou insercao manual. Nao viola termos de sites de farmacias.</div>
    ${selected ? `<div class="info-box">
      <h4>${selected.generic} - ${selected.className}</h4>
      <p><strong>Comerciais:</strong> ${selected.brands}</p>
      <p><strong>Mecanismo:</strong> ${selected.mechanism}</p>
      <p><strong>Receptores:</strong> ${selected.receptors}</p>
      <p><strong>Indicacoes:</strong> ${selected.indications}</p>
      <p><strong>Melhor indicacao clinica:</strong> ${selected.bestUse}</p>
      <p><strong>Dose inicial/usual:</strong> ${selected.initialDose} | ${selected.usualDose}</p>
      <p><strong>Efeitos comuns/graves:</strong> ${selected.commonEffects} ${selected.severeEffects}</p>
      <p><strong>Contraindicacoes/interacoes:</strong> ${selected.contraindications} ${selected.interactions}</p>
      <p><strong>Cuidados:</strong> idosos: ${selected.elderly}; gravidez: ${selected.pregnancy}; renal/hepatica: ${selected.renalHepatic}</p>
      <p><strong>Monitorizacao:</strong> ${selected.monitoring}</p>
    </div>` : ""}
  `;
}

function evolutionModule(form, patient, previous = null, isReturn = false) {
  return section(isReturn ? "Evolucao do Retorno" : "C. Evolucao do Paciente", evolutionBody(form, patient, previous, isReturn), true);
}

function evolutionBody(form, patient, previous = null, isReturn = false) {
  const evolution = outdatedEvolutionText(form.evolution) ? "" : (form.evolution || "");
  return `
    <div class="actions">
      <button class="primary" type="button" data-action="generate-evolution">Gerar evolucao</button>
    </div>
    ${textarea("evolution", "Evolucao SOAP editavel", evolution)}
    <div class="actions">
      <button class="primary" type="submit">OK</button>
    </div>
  `;
}

function medicalRecord() {
  const patient = getPatient();
  if (!patient) return emptyPatientMessage("Prontuario");
  const query = (draft.recordQuery || "").toLowerCase();
  const all = entriesForPatient(patient.id).filter(entry => JSON.stringify(entry).toLowerCase().includes(query));
  return `
    <div class="panel-title">
      <div><h2>Prontuario Longitudinal</h2><p>${escapeHtml(patient.nome)} | consultas, retornos, diagnosticos e evolucoes.</p></div>
      ${patientSelector()}
    </div>
    <div class="record-grid">
      <div>
        ${field("recordSearch", "Busca por palavra-chave, diagnostico, medicamento ou data", draft.recordQuery || "")}
        <div class="section" style="padding:14px;margin-top:12px">
          <h3>Identificacao</h3>
          <p>${escapeHtml(patient.nome || "")}, ${escapeHtml(calculateAge(patient.nascimento) || "idade nao calculada")} anos, ${escapeHtml(patient.sexo || "")}</p>
          <p>${escapeHtml(patient.telefone || "")} | ${escapeHtml(patient.email || "")}</p>
          <p>${escapeHtml([patient.endereco, patient.numero, patient.bairro, patient.cidade, patient.estado].filter(Boolean).join(", "))}</p>
          <div class="actions"><button class="secondary" data-action="edit-current-patient">Editar identificacao</button></div>
        </div>
      </div>
      <div class="timeline">
        ${all.length ? all.map(entry => `
          <article class="timeline-item">
            <h4>${escapeHtml(entry.label)} - ${new Date(entry.createdAt).toLocaleString("pt-BR")}</h4>
            <p>${escapeHtml((entry.evolution || entry.queixa || entry.observacoesRetorno || "Registro sem evolucao.").slice(0, 420))}</p>
            <div class="actions">
              <button class="secondary" data-action="open-entry" data-id="${entry.id}" data-type="${entry.type}">Abrir/Revisar</button>
              <button class="secondary" data-action="pdf-entry" data-id="${entry.id}" data-type="${entry.type}">Exportar PDF</button>
              <button class="danger" data-action="delete-entry" data-id="${entry.id}" data-type="${entry.type}">Excluir</button>
            </div>
          </article>`).join("") : `<div class="warning">Nenhum registro encontrado para os filtros atuais.</div>`}
      </div>
    </div>
  `;
}

function exitPanel() {
  return `
    <div class="panel-title"><div><h2>Sair do Sistema</h2><p>Os dados deste prototipo sao salvos localmente neste navegador.</p></div></div>
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
  return `<label>${labelText}<select name="${name}"><option value="">Selecionar</option>${options.map(option => `<option value="${escapeAttr(option)}" ${value === option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select></label>`;
}

function selectFieldWithOther(name, labelText, options, value = "") {
  const otherValue = currentClinicalDraft()?.[`${name}Outro`] || "";
  const otherBox = value === "Outro" ? `
    <div class="other-card narrow">
      <label>Descrever outro
        <input name="${name}Outro" value="${escapeAttr(otherValue)}" placeholder="Especifique aqui" />
      </label>
    </div>
  ` : "";
  return `<div>${selectField(name, labelText, options, value)}${otherBox}</div>`;
}

function textarea(name, labelText, value = "", placeholder = "", rows = "") {
  const rowsAttr = rows ? ` rows="${rows}"` : "";
  return `<label>${labelText}<textarea name="${name}"${rowsAttr} placeholder="${escapeAttr(placeholder)}">${escapeHtml(value || "")}</textarea></label>`;
}

function voiceTextarea(name, labelText, value = "", placeholder = "") {
  return `<div>${textarea(name, labelText, value, placeholder)}<div class="actions"><button class="secondary" type="button" data-action="voice" data-target="${name}">Transcrever por voz</button></div></div>`;
}

function questionTextarea(key, labelText, value = "") {
  return `<label class="mental-question">${labelText}<textarea rows="3" readonly placeholder="Perguntas fixas deste item">${escapeHtml(fixedMentalQuestion(key, value))}</textarea></label>`;
}

function fixedMentalQuestion(key, value = "") {
  return mentalExamQuestions[key] || "";
}

function anamnesisQuestionGuide() {
  const form = currentClinicalDraft();
  return `<div class="clinical-card anamnesis-guide">
    <h4>Perguntas imprescindiveis para rastreio diagnostico, impacto, gravidade e riscos</h4>
    ${anamnesisQuestionGroups.map(group => `
      <div class="guide-group">
        <strong>${escapeHtml(group.title)}</strong>
        <div class="guide-items">
          ${group.items.map(([label, questions]) => `
            <section>
              <span>${escapeHtml(label)}</span>
              ${questions.some(question => typeof question === "object")
                ? anamnesisStructuredFields(questions, form)
                : `<ul>${questions.map(question => `<li>${escapeHtml(question)}</li>`).join("")}</ul>`}
            </section>
          `).join("")}
        </div>
      </div>
    `).join("")}
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
  const otherInput = item.otherKey && set.has("Outro") ? `
    <label class="multi-choice-other">Descrever outro
      <input name="${item.otherKey}" value="${escapeAttr(form[item.otherKey] || "")}" placeholder="Especifique aqui" />
    </label>
  ` : "";
  return `<div class="risk-fields">
    ${item.question ? `<p class="structured-question">${escapeHtml(item.question)}</p>` : ""}
    <div class="multi-choice-options">
      ${item.options.map(option => `
        <label>
          <input type="checkbox" name="${item.key}" value="${escapeAttr(option)}" ${set.has(option) ? "checked" : ""} />
          ${escapeHtml(option)}
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
  const otherValue = currentClinicalDraft()?.[`${name}Outro`] || "";
  const otherBox = options.includes("Outro") && set.has("Outro") ? `
    <div class="other-card">
      <label>Descrever outro
        <input name="${name}Outro" value="${escapeAttr(otherValue)}" placeholder="Especifique aqui" />
      </label>
    </div>
  ` : "";
  return `<div><label>${labelText}</label><div class="chips">${options.map(option => `<label class="chip"><input type="checkbox" name="${name}" value="${escapeAttr(option)}" ${set.has(option) ? "checked" : ""}>${escapeHtml(option)}</label>`).join("")}</div>${otherBox}</div>`;
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
  if (!scope || !nextPageForScope(scope)) return "";
  return `<div class="actions page-actions"><button class="primary" type="button" data-action="save-next-page" data-scope="${scope}">Salvar pagina e avancar</button></div>`;
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
  bindPatientForm();
  bindConsultForm();
  bindReturnForm();
  bindRecord();
  bindActions();
}

function bindAutoDraft() {
  const forms = app.querySelectorAll("form");
  forms.forEach(form => {
    form.addEventListener("input", () => updateDraftFromForm(form));
    form.addEventListener("change", event => {
      updateDraftFromForm(form);
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
    const data = { ...draft.consultation, ...formToObject(form), patientId: selectedPatientId, type: "consultation" };
    if (!data.id) data.id = uid("consultation");
    data.updatedAt = new Date().toISOString();
    data.createdAt = data.createdAt || data.updatedAt;
    upsert("consultations", data);
    draft.consultation = defaultConsultation();
    persist();
    view = "record";
    render();
  });
}

function bindReturnForm() {
  const form = app.querySelector("#return-form");
  if (!form) return;
  form.addEventListener("submit", event => {
    event.preventDefault();
    const previous = latestEntry(selectedPatientId);
    const data = { ...draft.return, ...formToObject(form), patientId: selectedPatientId, type: "return" };
    if (!data.id) data.id = uid("return");
    data.updatedAt = new Date().toISOString();
    data.createdAt = data.createdAt || data.updatedAt;
    upsert("returns", data);
    draft.return = defaultReturn();
    persist();
    view = "record";
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
      if (action === "generate-diagnosis") generateDiagnosisFromClinicalData(element);
      if (action === "generate-evolution") generateEvolutionFromClinicalData(element);
      if (action === "clear-patient") { draft.patient = {}; render(); }
      if (action === "delete-patient") deletePatient();
      if (action === "voice") startVoice(element.dataset.target);
      if (action === "edit-current-patient") { view = "patient"; draft.patient = structuredClone(getPatient()); render(); }
      if (action === "open-entry") openEntry(element.dataset.id, element.dataset.type);
      if (action === "pdf-entry") pdfEntry(element.dataset.id, element.dataset.type);
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
  const nextPage = nextPageForScope(scope);
  if (scope === "consultation" && nextPage) consultationPage = nextPage;
  if (scope === "return" && nextPage) returnPage = nextPage;
  render();
}

function generateDiagnosisFromClinicalData(element) {
  const formElement = element.closest("form");
  if (formElement) updateDraftFromForm(formElement);
  const scope = view === "return" ? "return" : "consultation";
  const target = scope === "return" ? draft.return : draft.consultation;
  const suggestion = buildDiagnosticSuggestion(target || {});
  if (scope === "return") draft.return = { ...(draft.return || {}), ...suggestion };
  else draft.consultation = { ...(draft.consultation || {}), ...suggestion };
  render();
}

function generateEvolutionFromClinicalData(element) {
  const formElement = element.closest("form");
  if (formElement) updateDraftFromForm(formElement);
  const scope = view === "return" ? "return" : "consultation";
  const target = scope === "return" ? draft.return : draft.consultation;
  const previous = scope === "return" ? latestEntry(selectedPatientId) : null;
  const patient = getPatient() || {};
  const suggestion = {
    evolution: buildEvolutionNarrative(target || {}, patient, previous, scope === "return")
  };
  if (scope === "return") draft.return = { ...(draft.return || {}), ...suggestion };
  else draft.consultation = { ...(draft.consultation || {}), ...suggestion };
  render();
}

function buildDiagnosticSuggestion(form) {
  const sourceText = [
    form.queixa, form.historia, form.fatoresOutro,
    joinValues(form.fatores), joinValues(form.fatoresMelhora), joinValues(form.impacto),
    joinValues(form.psiPrevios), joinValues(form.tratamentos), joinValues(form.medicos), joinValues(form.familiares), joinValues(form.substancias),
    joinValues(form.aparencia), joinValues(form.consciencia), joinValues(form.atencao), joinValues(form.orientacao), joinValues(form.memoria), joinValues(form.sensopercepcao),
    joinValues(form.pensamentoCursoForma), joinValues(form.pensamentoConteudo), joinValues(form.linguagem),
    joinValues(form.humor), joinValues(form.afeto), joinValues(form.psicomotricidadeVontade), joinValues(form.juizoCritico),
    form.observacoesRetorno
  ].filter(Boolean).join(" | ");
  const text = normalizeText(sourceText);
  const agent = form.aiDiagnosticAgent || "ChatGPT";
  const model = form.aiDiagnosticModel?.trim() ? ` (${form.aiDiagnosticModel.trim()})` : "";
  const matches = diagnosticRules()
    .map(rule => ({ ...rule, score: rule.terms.reduce((sum, term) => sum + (text.includes(term) ? 1 : 0), 0) }))
    .filter(rule => rule.score > 0)
    .sort((a, b) => b.score - a.score);
  const primary = matches[0] || diagnosticRules()[0];
  const differentials = matches.slice(1, 5);
  const fallbackDifferentials = diagnosticRules().filter(rule => rule.name !== primary.name).slice(0, 4);
  const selectedDifferentials = differentials.length ? differentials : fallbackDifferentials;
  const evidence = summarizeEvidence(form);
  return {
    aiDiagnosticAgent: agent,
    diagnosticoManual: [
      `Sugestao gerada por ${agent}${model}: ${primary.name}.`,
      `CID-11: ${primary.cid11}.`,
      `DSM5 TR: ${primary.dsm5tr}.`,
      `Elementos utilizados: ${evidence || "anamnese e exame psiquico ainda insuficientes; completar dados clinicos antes de concluir."}`,
      "Conduta: confirmar criterios diagnosticos, duracao, prejuizo funcional, exclusoes clinicas/substancias e risco antes de registrar o diagnostico definitivo."
    ].join("\n"),
    diferenciais: selectedDifferentials.map((item, index) => [
      `${index + 1}. ${item.name}`,
      `CID-11: ${item.cid11}.`,
      `DSM5 TR: ${item.dsm5tr}.`,
      `Diferenciar por: ${item.differential}.`
    ].join("\n")).join("\n\n"),
    diagnosticoObservacaoMedica: form.diagnosticoObservacaoMedica || ""
  };
}

function diagnosticRules() {
  return [
    {
      name: "Transtorno depressivo, episodio depressivo",
      cid11: "6A70 - Episodio depressivo",
      dsm5tr: "Transtorno depressivo maior, episodio depressivo maior",
      terms: ["hipotimia", "anedonia", "deprim", "lentificacao", "hipobulia", "despertar precoce", "ideacao suicida"],
      differential: "luto, transtorno bipolar, uso de substancias, hipotireoidismo e transtorno de ajustamento."
    },
    {
      name: "Transtorno de ansiedade generalizada",
      cid11: "6B00 - Transtorno de ansiedade generalizada",
      dsm5tr: "Transtorno de ansiedade generalizada",
      terms: ["humor ansioso", "ansios", "preocupacoes excessivas", "inquietude", "tensao", "panico"],
      differential: "transtorno do panico, ansiedade social, TOC, hipertireoidismo e uso de estimulantes."
    },
    {
      name: "Transtorno bipolar ou relacionado",
      cid11: "6A60/6A61 - Transtorno bipolar tipo I/tipo II",
      dsm5tr: "Transtorno bipolar I ou II",
      terms: ["hipertimia", "euforia", "reducao da necessidade de sono", "fuga de ideias", "logorreia", "aceleracao", "hiperbulia"],
      differential: "TDAH, uso de substancias, transtorno de personalidade borderline e episodio depressivo unipolar."
    },
    {
      name: "Transtorno obsessivo-compulsivo",
      cid11: "6B20 - Transtorno obsessivo-compulsivo",
      dsm5tr: "Transtorno obsessivo-compulsivo",
      terms: ["obsessoes", "compulsividade", "toc", "rituais", "intrusivos"],
      differential: "ansiedade generalizada, transtornos relacionados a trauma, tiques e transtorno de personalidade obsessivo-compulsiva."
    },
    {
      name: "Transtorno psicotico primario ou secundario",
      cid11: "6A20-6A2Z - Espectro da esquizofrenia e outros transtornos psicoticos primarios",
      dsm5tr: "Espectro da esquizofrenia e outros transtornos psicoticos",
      terms: ["alucinacao", "delirio", "juizo prejudicado", "critica prejudicada", "desconfianca", "afrouxamento", "descarrilamento"],
      differential: "transtorno bipolar com sintomas psicoticos, depressao psicotica, delirium, epilepsia e substancias."
    },
    {
      name: "Transtorno relacionado a trauma ou estresse",
      cid11: "6B40/6B43 - TEPT ou transtorno de ajustamento",
      dsm5tr: "TEPT ou transtorno de ajustamento",
      terms: ["tept", "trauma", "luto", "separacao", "estresse", "conflito", "ajustamento"],
      differential: "depressao maior, ansiedade generalizada, luto prolongado e transtorno de personalidade."
    },
    {
      name: "Transtorno por uso de substancias",
      cid11: "6C40-6C4Z - Transtornos por uso de substancias",
      dsm5tr: "Transtornos relacionados a substancias e transtornos aditivos",
      terms: ["alcool", "cannabis", "cocaina", "crack", "opioides", "benzodiazepinicos", "substancias"],
      differential: "transtornos primarios do humor, ansiedade, psicose induzida por substancias e abstinencia/intoxicacao."
    }
  ];
}

function summarizeEvidence(form) {
  return [
    form.queixa && `queixa: ${form.queixa}`,
    form.historia && `historia: ${form.historia}`,
    joinValues(form.humor) && `humor: ${joinValues(form.humor)}`,
    joinValues(form.pensamentoCursoForma) && `pensamento curso/forma: ${joinValues(form.pensamentoCursoForma)}`,
    joinValues(form.pensamentoConteudo) && `pensamento conteudo: ${joinValues(form.pensamentoConteudo)}`,
    joinValues(form.sensopercepcao) && `sensopercepcao: ${joinValues(form.sensopercepcao)}`,
    joinValues(form.juizoCritico) && `juizo critico/insight: ${joinValues(form.juizoCritico)}`,
    joinValues(form.impacto) && `impacto: ${joinValues(form.impacto)}`
  ].filter(Boolean).join("; ");
}

function joinValues(value) {
  return Array.isArray(value) ? value.filter(Boolean).join(", ") : value || "";
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
  const list = Array.isArray(value) ? value.filter(Boolean) : value ? [value] : [];
  const base = list.filter(item => normalizeText(item) !== "outro").join(", ");
  return [base, otherValue].filter(Boolean).join(base && otherValue ? ", " : "");
}

function clinicalValueList(value, otherValue = "") {
  return [
    ...(Array.isArray(value) ? value.filter(Boolean) : value ? [value] : []).filter(item => normalizeText(item) !== "outro"),
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
  const cleanItems = [...new Set(items.map(clinicalPhrase).filter(Boolean))];
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
    .replace(/\. Antecedentes:/g, ". Na historia pregressa,")
    .replace(/diagnosticos psiquiatricos previos:/g, "faz mencao a")
    .replace(/tratamentos previos:/g, "tratamentos previos:")
    .trim()}.`;
}

function lowerFirst(value = "") {
  const text = String(value || "").trim();
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : "";
}

function normalizeText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function updateDraftFromForm(form) {
  if (form.id === "patient-form") draft.patient = { ...(draft.patient || {}), ...formToObject(form) };
  if (form.id === "consult-form") draft.consultation = { ...(draft.consultation || {}), ...formToObject(form) };
  if (form.id === "return-form") draft.return = { ...(draft.return || {}), ...formToObject(form) };
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
  const count = state.returns.filter(item => item.patientId === selectedPatientId).length + 1;
  return { patientId: selectedPatientId, label: `Retorno ${count}`, type: "return" };
}

function getPatient() {
  return state.patients.find(patient => patient.id === selectedPatientId);
}

function entriesForPatient(patientId) {
  return [...state.consultations, ...state.returns]
    .filter(entry => entry.patientId === patientId)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
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
}

async function copyEvolution() {
  const text = app.querySelector("[name='evolution']")?.value || "";
  await navigator.clipboard?.writeText(text);
  alert("Evolucao copiada.");
}

function printEvolution() {
  const text = app.querySelector("[name='evolution']")?.value || "";
  exportTextAsPdf("Evolucao medica", text);
}

function pdfEntry(id, type) {
  const entry = findEntry(id, type);
  exportTextAsPdf(entry?.label || "Evolucao", entry?.evolution || "");
}

function buildEvolutionNarrative(form, patient = {}, previous = null, isReturn = false) {
  return [
    evolutionOpeningText(form, patient),
    hdaEvolutionText(form, previous, isReturn),
    antecedentsEvolutionText(form),
    mentalExamEvolutionText(form)
  ].filter(Boolean).join("\n\n");
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
    joinWithOutro(form.familiares, form.familiaresOutro) ? `antecedentes familiares de ${lowerFirst(joinWithOutro(form.familiares, form.familiaresOutro))}` : ""
  ].filter(Boolean);
  return `Antecedentes: ${parts.length ? parts.join("; ") : "sem antecedentes informados"}.`;
}

function mentalExamEvolutionText(form) {
  const findings = mentalStateFindings(form);
  return `Exame psiquico: Paciente ${findings.length ? formatClinicalList(findings) : "sem alteracoes descritas no exame psiquico"}.`;
}

function consultationStoryText(form) {
  const complaint = form.queixa || form.qphda || "";
  const story = form.historia || (!form.queixa ? "" : form.qphda || "");
  const fatorText = joinWithOutro(form.fatores, form.fatoresOutro);
  const melhoraText = joinWithOutro(form.fatoresMelhora, form.fatoresMelhoraOutro);
  const impactoText = joinValues(form.impacto);
  const parts = [
    complaint
      ? `Comparece para avaliacao psiquiatrica com queixa principal de ${stripFinalPeriod(complaint)}.`
      : "Comparece para avaliacao psiquiatrica.",
    story ? `Relata que ${lowerFirst(stripFinalPeriod(story))}.` : "",
    fatorText ? `Quadro associado ou desencadeado por ${lowerFirst(fatorText)}.` : "",
    melhoraText ? improvementSentence(melhoraText) : "",
    impactoText ? `Descreve o impacto funcional como ${lowerFirst(impactoText)}.` : ""
  ].filter(Boolean);
  return parts.join(" ");
}

function returnStoryText(form, previous) {
  const parts = [
    previous ? `Retorna apos registro previo de ${new Date(previous.createdAt || Date.now()).toLocaleDateString("pt-BR")}.` : "Comparece para retorno psiquiatrico.",
    form.estadoGeral ? `Evolucao global: ${form.estadoGeral.toLowerCase()}.` : "",
    form.sintomasPrincipais ? `Sintomas principais: ${form.sintomasPrincipais.toLowerCase()}.` : "",
    form.observacoesRetorno ? `Observacoes clinicas: ${form.observacoesRetorno}` : ""
  ].filter(Boolean);
  return parts.join(" ");
}

function historyText(form) {
  return [
    joinValues(form.psiPrevios) && `diagnosticos psiquiatricos previos: ${joinValues(form.psiPrevios)}`,
    joinValues(form.tratamentos) && `tratamentos previos: ${joinValues(form.tratamentos)}`,
    joinValues(form.medicos) && `antecedentes medicos: ${joinValues(form.medicos)}`,
    joinValues(form.familiares) && `antecedentes familiares: ${joinValues(form.familiares)}`
  ].filter(Boolean).join("; ");
}

function mentalStateText(form) {
  const findings = mentalStateFindings(form);
  return findings.length ? formatClinicalList(findings) : "";
}

function mentalStateFindings(form) {
  const groups = ["aparencia", "consciencia", "atencao", "orientacao", "memoria", "sensopercepcao", "pensamentoCursoForma", "pensamentoConteudo", "linguagem", "humor", "afeto", "psicomotricidadeVontade", "juizoCritico"];
  return groups
    .flatMap(key => clinicalValueList(form[key], form[`${key}Outro`]))
    .filter(Boolean);
}

function openEntry(id, type) {
  const entry = findEntry(id, type);
  if (!entry) return;
  selectedPatientId = entry.patientId;
  if (type === "consultation") {
    draft.consultation = structuredClone(entry);
    view = "consultation";
  } else {
    draft.return = structuredClone(entry);
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

function startVoice(targetName) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return alert("Transcricao por voz nao suportada neste navegador.");
  const recognition = new SpeechRecognition();
  recognition.lang = "pt-BR";
  recognition.interimResults = false;
  recognition.onresult = event => {
    const text = event.results[0][0].transcript;
    const fieldElement = app.querySelector(`[name='${targetName}']`);
    fieldElement.value = `${fieldElement.value ? fieldElement.value + " " : ""}${text}`;
    const form = fieldElement.closest("form");
    updateDraftFromForm(form);
  };
  recognition.start();
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
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
