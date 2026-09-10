import { selectedDiagnosisText } from "./diagnosis.js";
import { scaleResults, scaleSummaryLine } from "./scoring.js";
import { arrayValue, lowerFirst, stripFinalPeriod } from "./textFormat.js";

// Documentos do atendimento, decididos com o Dr. Regis em 10/09/2026, depois
// da comparacao com o TribeMD (231 modelos, dos quais os de psiquiatria sao
// atestado, relatorio escolar e para o ENEM, e encaminhamentos).
//
// O texto sai do prontuario, SEM IA: nada do paciente vai para fora do
// aparelho para escrever um atestado. E sempre editavel antes do PDF -- o
// programa monta, o medico assina.
//
// Diagnostico so com autorizacao do paciente. E a regra do CFM para atestado
// (Res. 1.658/2002, art. 5o), e o programa a aplica a todo documento que sai
// do consultorio: sem a caixa marcada, o CID nao entra, e o relatorio diz por
// que nao entrou. A declaracao de comparecimento nunca traz diagnostico.
//
// Os campos de tela moram no rascunho com prefixo `documento_` (e `medico_`
// para os dados de assinatura) e saem do registro ao salvar -- ver
// withoutDocumentDraftFields. O que fica no prontuario e so a lista do que foi
// emitido, em `documentosEmitidos`.

export const DOCUMENT_TYPES = [
  { id: "atestado", titulo: "Atestado médico", rotulo: "Atestado de afastamento" },
  { id: "comparecimento", titulo: "Declaração de comparecimento", rotulo: "Declaração de comparecimento" },
  { id: "relatorio", titulo: "Relatório médico", rotulo: "Relatório médico" },
  { id: "escolar", titulo: "Relatório médico para fins escolares", rotulo: "Relatório escolar / ENEM" },
  { id: "encaminhamento", titulo: "Encaminhamento", rotulo: "Encaminhamento" }
];

export const SCHOOL_RECOMMENDATIONS = [
  "Tempo adicional para provas e atividades avaliativas",
  "Sala com menos alunos, ou individual, e com menos estímulos",
  "Pausas programadas durante a prova",
  "Ledor ou leitura dos enunciados em voz alta",
  "Auxílio para transcrever as respostas e preencher o gabarito",
  "Enunciados curtos, objetivos e divididos em etapas",
  "Lugar próximo ao professor, longe de portas e janelas",
  "Avaliação oral ou em formato alternativo, quando possível",
  "Adaptação curricular"
];

export const REFERRAL_DESTINATIONS = [
  "Psicoterapia",
  "Avaliação neuropsicológica",
  "Psicopedagogia",
  "Terapia ocupacional",
  "Fonoaudiologia",
  "CAPS",
  "CAPS AD (álcool e outras drogas)",
  "Emergência psiquiátrica",
  "Clínica médica",
  "Neurologia",
  "Outro"
];

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const UNIDADES = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];

export function numberInWords(numero) {
  const n = Math.trunc(Number(numero));
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 20) return UNIDADES[n];
  if (n < 100) {
    const unidade = n % 10;
    return unidade ? `${DEZENAS[Math.floor(n / 10)]} e ${UNIDADES[unidade]}` : DEZENAS[Math.floor(n / 10)];
  }
  return String(n);
}

// Data de campo (AAAA-MM-DD) ou ISO. Lida sempre como data local: um
// "2026-09-10" lido como UTC viraria dia 9 a noite no Brasil.
function toDate(value) {
  const texto = String(value || "");
  const soData = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (soData) return new Date(Number(soData[1]), Number(soData[2]) - 1, Number(soData[3]));
  const data = new Date(texto);
  return Number.isNaN(data.getTime()) ? null : data;
}

export function shortBrDate(value) {
  const data = toDate(value);
  return data ? data.toLocaleDateString("pt-BR") : "";
}

export function longBrDate(value) {
  const data = toDate(value);
  return data ? `${data.getDate()} de ${MESES[data.getMonth()]} de ${data.getFullYear()}` : "";
}

export function todayIso(agora = new Date()) {
  const data = agora instanceof Date ? agora : new Date(agora);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

export function documentField(nome) {
  return `documento_${nome}`;
}

function campo(form, nome) {
  return String(arrayValue(form[documentField(nome)])[0] ?? "").trim();
}

function autorizouDiagnostico(form) {
  return campo(form, "autorizaCid") === "sim";
}

// "Depressão Maior - CID-11: 6A70 - DSM-5-TR: F32.9" vira
// "Depressão Maior (CID-11 6A70; DSM-5-TR F32.9)".
export function formatDiagnosisForDocument(linha = "") {
  const partes = String(linha).split(/\s+-\s+(?=(?:CID-10|CID-11|DSM-5-TR)\s*:)/);
  const nome = stripFinalPeriod(partes[0] || "");
  const codigos = partes.slice(1).map(parte => parte.replace(/\s*:\s*/, " ").trim());
  return codigos.length ? `${nome} (${codigos.join("; ")})` : nome;
}

// No retorno, o diagnostico e o da consulta a que ele responde; os
// medicamentos, os do ajuste de hoje, quando houver.
function documentSource(form = {}, previous = null, isReturn = false) {
  const base = isReturn ? (previous || {}) : form;
  const diagnosticos = selectedDiagnosisText(base).split("\n").map(formatDiagnosisForDocument).filter(Boolean);
  const ajuste = isReturn ? arrayValue(form.ajusteMedicacaoSelecionada) : [];
  const medicamentos = (ajuste.length ? ajuste : arrayValue(base.tratamentoMedicamentosSelecionados))
    .map(linha => stripFinalPeriod(String(linha).replace(/\s*\|\s*/g, ", ")));
  return { diagnosticos, medicamentos, nivelCuidado: String(base.nivelCuidado || "").trim() };
}

function patientLine(patient = {}) {
  const nome = String(patient.nome || "").trim() || "[nome do paciente]";
  const nascimento = shortBrDate(patient.nascimento);
  return nascimento ? `${nome}, com data de nascimento em ${nascimento}` : nome;
}

function followUpSince(history = [], form = {}) {
  const datas = [...history, form].map(entry => Date.parse(entry?.createdAt || "")).filter(Number.isFinite);
  return datas.length ? shortBrDate(new Date(Math.min(...datas)).toISOString()) : "";
}

function diagnosisSentence(form, fonte, rotulo = "Diagnóstico") {
  if (!fonte.diagnosticos.length) return "";
  return autorizouDiagnostico(form)
    ? `${rotulo}, informado com a autorização expressa do(a) paciente: ${fonte.diagnosticos.join("; ")}.`
    : "Diagnóstico não informado neste documento, por não haver autorização do(a) paciente para a sua divulgação.";
}

function signatureBlock(doctor = {}, quando) {
  const cidade = String(doctor.cidade || "").trim();
  const data = longBrDate(quando);
  const registro = [
    doctor.crm ? `CRM${doctor.uf ? `-${String(doctor.uf).toUpperCase()}` : ""} ${doctor.crm}` : "",
    doctor.rqe ? `RQE ${doctor.rqe}` : ""
  ].filter(Boolean).join(" · ");
  return [
    cidade ? `${cidade}, ${data}.` : `${data}.`,
    "",
    "",
    "_______________________________________",
    String(doctor.nome || "").trim() || "[nome]",
    registro || "[CRM]"
  ].join("\n");
}

// A data de inicio vem do campo, e na falta dele, do dia da emissao: a tela
// mostra hoje preenchido, e o texto nao pode dizer outra coisa.
function atestadoBody(form, patient, agora) {
  const dias = Math.max(0, Math.trunc(Number(campo(form, "dias")) || 0));
  const inicio = shortBrDate(campo(form, "inicio") || todayIso(agora));
  const atividades = campo(form, "finalidade") === "escola" ? "escolares" : "laborais";
  const afastamento = dias
    ? ` e necessita de afastamento de suas atividades ${atividades} por ${dias} (${numberInWords(dias)}) ${dias === 1 ? "dia" : "dias"}, a partir de ${inicio}`
    : "";
  return [`Atesto, para os devidos fins, que ${patientLine(patient)}, passou por consulta psiquiátrica nesta data${afastamento}.`];
}

function comparecimentoBody(form, patient, agora) {
  const data = shortBrDate(campo(form, "inicio") || todayIso(agora));
  const inicio = campo(form, "horaInicio");
  const fim = campo(form, "horaFim");
  const horario = inicio && fim ? `, das ${inicio} às ${fim}` : inicio ? `, às ${inicio}` : "";
  const acompanhante = campo(form, "acompanhante");
  return [
    `Declaro, para os devidos fins, que ${patientLine(patient)}, compareceu à consulta médica em ${data}${horario}.`,
    acompanhante ? `Compareceu na companhia de ${acompanhante}, que permaneceu durante o atendimento.` : ""
  ];
}

function relatorioBody(form, patient, fonte, desde) {
  const destinatario = campo(form, "destinatario");
  const escalas = autorizouDiagnostico(form)
    ? scaleResults(form).filter(({ result }) => result.completa).map(({ scale, result }) => scaleSummaryLine(scale, result))
    : [];
  return [
    destinatario ? `Destinatário: ${destinatario}.` : "",
    `Relatório médico referente a ${patientLine(patient)}.`,
    desde ? `Em acompanhamento psiquiátrico desde ${desde}.` : "",
    diagnosisSentence(form, fonte),
    fonte.medicamentos.length ? `Tratamento em uso: ${fonte.medicamentos.join("; ")}.` : "",
    fonte.nivelCuidado ? `Nível de cuidado atual: ${lowerFirst(fonte.nivelCuidado)}.` : "",
    escalas.length ? `Escalas aplicadas: ${escalas.join("; ")}.` : "",
    "Situação atual e necessidades: [descrever]."
  ];
}

function escolarBody(form, patient, fonte, desde) {
  const recomendacoes = arrayValue(form[documentField("recomendacoes")]);
  return [
    `Relatório médico para fins escolares referente a ${patientLine(patient)}.`,
    desde ? `Em acompanhamento psiquiátrico desde ${desde}.` : "",
    diagnosisSentence(form, fonte),
    "Do ponto de vista clínico, o quadro interfere em [atenção, organização, ritmo de leitura e escrita, ansiedade diante de avaliações — ajustar ao caso].",
    recomendacoes.length
      ? `Recomendo, no ambiente escolar e nas avaliações, inclusive ENEM e vestibulares:\n${recomendacoes.map(item => `- ${item}.`).join("\n")}`
      : "Recomendações: [descrever]."
  ];
}

function encaminhamentoBody(form, patient, fonte, desde) {
  const escolhido = campo(form, "destino");
  const destino = escolhido === "Outro" ? campo(form, "destinoOutro") : escolhido;
  const motivo = campo(form, "motivo");
  const pedido = campo(form, "pergunta");
  return [
    destino ? `Encaminhamento para: ${destino}.` : "",
    `Encaminho ${patientLine(patient)}, em acompanhamento psiquiátrico${desde ? ` desde ${desde}` : ""}${destino ? `, para ${lowerFirst(destino)}` : ""}.`,
    motivo ? `Motivo: ${stripFinalPeriod(motivo)}.` : "Motivo: [descrever].",
    diagnosisSentence(form, fonte, "Hipótese diagnóstica"),
    fonte.medicamentos.length ? `Medicamentos em uso: ${fonte.medicamentos.join("; ")}.` : "",
    pedido ? `Solicito: ${stripFinalPeriod(pedido)}.` : "",
    "Agradeço a atenção e fico à disposição para discutir o caso."
  ];
}

export function documentType(id) {
  return DOCUMENT_TYPES.find(tipo => tipo.id === id) || DOCUMENT_TYPES[0];
}

export function buildDocumentText(tipoId, { form = {}, patient = {}, doctor = {}, history = [], previous = null, isReturn = false, agora = new Date() } = {}) {
  const tipo = documentType(tipoId);
  const fonte = documentSource(form, previous, isReturn);
  const desde = followUpSince(history, form);
  const corpo = {
    atestado: () => [...atestadoBody(form, patient, agora), diagnosisSentence(form, fonte)],
    comparecimento: () => comparecimentoBody(form, patient, agora),
    relatorio: () => relatorioBody(form, patient, fonte, desde),
    escolar: () => escolarBody(form, patient, fonte, desde),
    encaminhamento: () => encaminhamentoBody(form, patient, fonte, desde)
  }[tipo.id]();
  // No atestado, a frase de "diagnostico nao informado" nao cabe: o atestado
  // sem CID e o padrao, e anunciar a omissao chamaria atencao para ela.
  const linhas = corpo.filter(Boolean).filter(linha => !(tipo.id === "atestado" && linha.startsWith("Diagnóstico não informado")));
  return `${linhas.join("\n\n")}\n\n${signatureBlock(doctor, agora)}`;
}

// A linha que o prontuario guarda de cada documento: "atestado de afastamento
// por 3 dias", "encaminhamento para psicoterapia".
export function documentSummary(tipoId, form = {}) {
  const tipo = documentType(tipoId);
  if (tipo.id === "atestado") {
    const dias = Math.trunc(Number(campo(form, "dias")) || 0);
    return dias ? `atestado de afastamento por ${dias} ${dias === 1 ? "dia" : "dias"}` : "atestado de comparecimento a consulta";
  }
  if (tipo.id === "encaminhamento") {
    const escolhido = campo(form, "destino");
    const destino = escolhido === "Outro" ? campo(form, "destinoOutro") : escolhido;
    return destino ? `encaminhamento para ${lowerFirst(destino)}` : "encaminhamento";
  }
  return lowerFirst(tipo.titulo);
}

export function issuedDocument(tipoId, form = {}, texto = "", agora = new Date()) {
  const tipo = documentType(tipoId);
  return {
    tipo: tipo.id,
    titulo: tipo.titulo,
    resumo: documentSummary(tipo.id, form),
    emitidoEm: (agora instanceof Date ? agora : new Date(agora)).toISOString(),
    texto
  };
}

export function documentsNarrativeText(form = {}) {
  const emitidos = (Array.isArray(form.documentosEmitidos) ? form.documentosEmitidos : []).filter(item => item?.resumo);
  return emitidos.length ? `Documentos emitidos: ${emitidos.map(item => item.resumo).join("; ")}.` : "";
}

export function doctorFromForm(form = {}) {
  return Object.fromEntries(["nome", "crm", "uf", "rqe", "cidade"]
    .map(chave => [chave, String(form[`medico_${chave}`] ?? "").trim()])
    .filter(([, valor]) => valor));
}

const CAMPO_DE_TELA = /^(documento_|medico_)/;

export function withoutDocumentDraftFields(entry = {}) {
  return Object.fromEntries(Object.entries(entry).filter(([campoNome]) => !CAMPO_DE_TELA.test(campoNome)));
}

export function documentDraftFields(entry = {}) {
  return Object.fromEntries(Object.entries(entry || {}).filter(([campoNome]) => CAMPO_DE_TELA.test(campoNome)));
}

