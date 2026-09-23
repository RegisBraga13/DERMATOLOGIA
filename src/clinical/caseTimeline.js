import { DRUG_ALIASES, DRUG_NAMES } from "../data/drugNames.js";
import { selectedDiagnosisText } from "./diagnosis.js";
import { pendingRefinementItems } from "./returnCarryover.js";
import { formatDiagnosisForDocument } from "./documents.js";
import { arrayValue, lowerFirst, normalizeText } from "./textFormat.js";

// O CASO ao longo do tempo, desde 14/09/2026 (leva 4).
//
// Ate aqui o app forcava um retorno por consulta, e o terceiro atendimento de
// um paciente em acompanhamento so cabia como consulta nova, sem ligacao com o
// retorno de antes. Agora o retorno pode responder a outro retorno: cada
// atendimento continua com UM retorno, e o caso vira uma cadeia -- consulta,
// retorno, retorno. Funcoes puras: a tela do retorno, o prontuario e os testes
// leem daqui.

function entryTime(entry = {}) {
  return Date.parse(entry.createdAt || "") || 0;
}

function porData(a, b) {
  return entryTime(a) - entryTime(b);
}

// ---------------------------------------------------------------- farmaco

const escaparRegex = texto => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const PADROES_FARMACO = [
  ...DRUG_NAMES.map(nome => [normalizeText(nome), nome]),
  ...Object.entries(DRUG_ALIASES).map(([apelido, nome]) => [normalizeText(apelido), nome])
]
  .sort((a, b) => b[0].length - a[0].length)
  .map(([termo, nome]) => ({ nome, re: new RegExp(`(^|[^a-z0-9])${escaparRegex(termo)}(?=$|[^a-z0-9])`) }));

// O nome se procura so no COMECO da linha: antes do primeiro "|", do " — " da
// decisao e do " - " das opcoes. A justificativa as vezes cita outro farmaco
// ("evitar associar ao litio"), e isso nao pode virar o farmaco da linha.
export function drugHead(linha = "") {
  return String(linha).split("|")[0].split(" — ")[0].split(/\s+-\s+/)[0].trim();
}

export function canonicalDrug(linha = "") {
  const cabeca = normalizeText(drugHead(linha));
  let melhor = null;
  for (const { nome, re } of PADROES_FARMACO) {
    const achado = re.exec(cabeca);
    if (!achado) continue;
    const posicao = achado.index + achado[1].length;
    if (!melhor || posicao < melhor.posicao) melhor = { nome, posicao };
  }
  return melhor?.nome || null;
}

// Farmaco fora da lista continua sendo farmaco: vale o que foi escrito, sem a
// dose.
export function drugLabel(linha = "") {
  return canonicalDrug(linha) || drugHead(linha).replace(/\s+\d[\s\S]*$/, "").trim();
}

function drugKey(linha = "") {
  return normalizeText(drugLabel(linha));
}

// Linha do Ajuste de conduta: "Sertralina — Aumentar dose | 100 mg/dia | por que".
//
// O `motivo` entrou em 23/09/2026, com o historico farmacologico. Ele sempre
// esteve na linha -- returnPlanMedicationLines o escreve -- e este leitor o
// jogava fora, entao a razao pela qual um farmaco saiu ficava legivel na tela e
// invisivel para quem lesse o caso depois. E a diferenca entre "retirado porque
// nao respondeu" e "retirado porque deu efeito colateral": a primeira exclui o
// farmaco por ineficacia, a segunda por intolerancia, e as duas levam a
// condutas diferentes no proximo episodio.
export function parseMedicationDecision(linha = "") {
  const [cabeca = "", detalhe = "", motivo = ""] = String(linha).split("|").map(parte => parte.trim());
  const [farmaco = "", acao = ""] = cabeca.split(" — ").map(parte => parte.trim());
  const a = normalizeText(acao);
  const tipo = /aument/.test(a) ? "aumentar"
    : /diminu|reduz/.test(a) ? "diminuir"
      : /troca/.test(a) ? "trocar"
        : /retir|suspend/.test(a) ? "retirar"
          : /acrescent|inici|associ/.test(a) ? "iniciar"
            : /mant/.test(a) ? "manter" : "";
  return { nome: drugLabel(farmaco), acao, tipo, detalhe, motivo };
}

// ---------------------------------------------------------------- cadeia

// Do atendimento ate a consulta que abriu o caso, do mais antigo para o mais
// recente. O `vistos` protege de ciclo: dois aparelhos sem conexao podem gravar
// ligacoes que ninguem previu.
export function caseChain(entry, entries = []) {
  if (!entry) return [];
  const mapa = new Map(entries.filter(Boolean).map(item => [item.id, item]));
  const cadeia = [entry];
  const vistos = new Set([entry.id]);
  let atual = entry;
  while (atual?.type === "return" && atual.previousEntryId && mapa.has(atual.previousEntryId) && !vistos.has(atual.previousEntryId)) {
    atual = mapa.get(atual.previousEntryId);
    vistos.add(atual.id);
    cadeia.unshift(atual);
  }
  return cadeia;
}

// O prontuario agrupado por caso: a consulta e todos os retornos que descendem
// dela, em ordem. Retorno cuja consulta nao esta na lista -- filtrada pela
// busca, arquivada -- abre o seu proprio grupo, com consulta nula: registro
// clinico nao some por falta de par.
export function groupCases(entries = []) {
  const grupos = new Map();
  entries.filter(Boolean).forEach(entry => {
    const raiz = caseChain(entry, entries)[0];
    grupos.set(raiz.id, [...(grupos.get(raiz.id) || []), entry]);
  });
  return [...grupos.values()]
    .map(itens => {
      const ordenados = [...itens].sort(porData);
      const consulta = ordenados.find(item => item.type !== "return") || null;
      return { consulta, retornos: ordenados.filter(item => item.type === "return") };
    })
    .sort((a, b) => {
      const ultimo = caso => Math.max(...[caso.consulta, ...caso.retornos].filter(Boolean).map(entryTime));
      return ultimo(b) - ultimo(a);
    });
}

// ---------------------------------------------------------------- medicamentos

const SITUACAO_POR_RESPOSTA = {
  "interrompeu": "interrompido pelo paciente",
  "nunca iniciou": "não iniciado"
};

const SITUACAO_POR_DECISAO = {
  retirar: "suspenso",
  trocar: "suspenso (troca)"
};

// As respostas "Em uso como prescrito / Em uso com dose alterada / Interrompeu
// / Nunca iniciou", uma por farmaco prescrito, com o rotulo que viajou no campo
// oculto. Exportada para o historico farmacologico (medicationTrial.js), que le
// a mesma coisa por outro recorte: aqui interessa a situacao de hoje, la
// interessa o ensaio inteiro.
export function respostasDeFarmaco(entry) {
  const respostas = [];
  for (let indice = 0; indice < 12; indice += 1) {
    const rotulo = String(entry[`retornoFarmaco_${indice}Rotulo`] || "").trim();
    const valor = arrayValue(entry[`retornoFarmaco_${indice}`])[0] || "";
    if (rotulo && valor) respostas.push({ rotulo, valor });
  }
  return respostas;
}

export function curtaData(value) {
  const data = new Date(value || "");
  return Number.isNaN(data.getTime()) ? "" : data.toLocaleDateString("pt-BR");
}

// Cada farmaco que passou pelo caso, com a situacao atual e o historico: o que
// foi prescrito na consulta, o que o paciente disse no retorno ("interrompeu",
// "nunca iniciou") e o que o medico decidiu no Ajuste de conduta. A decisao do
// medico vem depois da resposta do paciente no mesmo retorno, e vence.
export function medicationHistory(entries = []) {
  const farmacos = new Map();
  const tocar = (linha, entry, texto, situacao, atual) => {
    const chave = drugKey(linha);
    if (!chave) return;
    const item = farmacos.get(chave) || { nome: drugLabel(linha), inicio: entry.createdAt, eventos: [] };
    item.ultimaMencao = entry.createdAt;
    item.eventos.push({ data: entry.createdAt, registro: entry.label || "", texto });
    if (situacao) item.situacao = situacao;
    if (atual) item.atual = atual;
    farmacos.set(chave, item);
  };
  [...entries].filter(Boolean).sort(porData).forEach(entry => {
    if (entry.type !== "return") {
      arrayValue(entry.tratamentoMedicamentosSelecionados).forEach(linha => tocar(linha, entry, "prescrito", "em uso", linha));
      return;
    }
    respostasDeFarmaco(entry).forEach(({ rotulo, valor }) => {
      tocar(rotulo, entry, lowerFirst(valor), SITUACAO_POR_RESPOSTA[normalizeText(valor)] || "em uso");
    });
    arrayValue(entry.ajusteMedicacaoSelecionada).map(parseMedicationDecision).forEach(decisao => {
      if (!decisao.nome) return;
      const texto = [lowerFirst(decisao.acao || "decisão registrada"), decisao.detalhe].filter(Boolean).join(": ");
      const atual = `${decisao.nome}${decisao.detalhe ? ` ${decisao.detalhe}` : ""}`;
      tocar(decisao.nome, entry, texto, SITUACAO_POR_DECISAO[decisao.tipo] || "em uso", decisao.tipo === "manter" ? "" : atual);
    });
  });
  const ordem = item => (item.situacao === "em uso" ? 0 : 1);
  return [...farmacos.values()].sort((a, b) => ordem(a) - ordem(b) || entryTime({ createdAt: a.inicio }) - entryTime({ createdAt: b.inicio }));
}

export function medicationEventsText(item) {
  return item.eventos.map(evento => `${curtaData(evento.data)} ${evento.texto}`.trim()).join("; ");
}

// ---------------------------------------------------------------- retorno

const CAMPOS_DO_CASO = [
  "diagnosticoSelecionado", "diagnosticoMedicoOutro", "diagnosticoAiSindromico", "diagnosticoAiNosologico",
  "diagnosticoAiEtiologico", "diagnosticoAiOpcoes", "diagnosticoAiOutrasOpcoes", "especificadorSelecionado",
  "comorbidadeSelecionada", "agravanteSelecionado", "sintomasAlvoSelecionados", "sintomasResiduais",
  "analisePsicopatologica", "analisePsicopatologicaAchados"
];

// O refinamento tambem e do caso, e nao do retorno: as pendencias dele vem da
// consulta que abriu o caso.
const CAMPOS_DO_REFINAMENTO = /^refinement(Plan|Question_|RedFlag_|Observation_|Important_|DoctorNotes)/;

const RESOLVIDO = new Set(["confirmado", "descartado"]);

// Pendencia do refinamento que um retorno ja confirmou ou descartou tambem nao
// volta a ser pergunta. Mesma regra dos criterios.
function pendenciasDoRefinamentoAindaAbertas(raiz, retornos) {
  const resolvidos = new Set();
  retornos.forEach(entry => {
    for (let indice = 0; indice < 12; indice += 1) {
      const rotulo = String(entry[`retornoPendencia_${indice}Rotulo`] || "").trim();
      const valor = normalizeText(arrayValue(entry[`retornoPendencia_${indice}`])[0] || "");
      if (rotulo && RESOLVIDO.has(valor)) resolvidos.add(rotulo);
    }
  });
  return pendingRefinementItems(raiz).filter(item => !resolvidos.has(item));
}

// Criterio que um retorno ja confirmou ou descartou nao volta a ser pergunta.
function criteriosAindaPendentes(raiz, retornos) {
  const resolvidos = new Set();
  retornos.forEach(entry => {
    for (let indice = 0; indice < 12; indice += 1) {
      const rotulo = String(entry[`retornoCriterio_${indice}Rotulo`] || "").trim();
      const valor = normalizeText(arrayValue(entry[`retornoCriterio_${indice}`])[0] || "");
      if (rotulo && RESOLVIDO.has(valor)) resolvidos.add(rotulo);
    }
  });
  return String(raiz.diagnosticoAiCriterios || "").split("\n").filter(linha => {
    const partes = linha.split(":::").map(parte => parte.trim());
    return !(partes.length === 4 && resolvidos.has(`${partes[1]} — falta: ${partes[3]}`));
  }).join("\n");
}

// O atendimento anterior como o retorno de hoje precisa ler. Se ele e a
// consulta, e ela mesma. Se e um retorno, o retorno nao tem hipotese, criterio
// nem sintoma-alvo proprios: vem da consulta que abriu o caso. Os medicamentos
// sao os que estao em uso depois dele, e nao os da primeira receita. O id, a
// data, a historia clinica e as escalas continuam sendo os do retorno.
export function caseViewForReturn(previous, entries = []) {
  if (!previous || previous.type !== "return") return previous || null;
  const cadeia = caseChain(previous, entries);
  const raiz = cadeia[0]?.type === "return" ? {} : cadeia[0];
  const retornos = cadeia.filter(item => item.type === "return");
  const doCaso = Object.fromEntries([
    ...CAMPOS_DO_CASO,
    ...Object.keys(raiz).filter(campo => CAMPOS_DO_REFINAMENTO.test(campo))
  ].filter(campo => raiz[campo] !== undefined).map(campo => [campo, raiz[campo]]));
  const emUso = medicationHistory(cadeia).filter(item => item.situacao === "em uso").map(item => item.atual || item.nome);
  return {
    ...previous,
    ...doCaso,
    diagnosticoAiCriterios: criteriosAindaPendentes(raiz, retornos),
    pendenciasRefino: pendenciasDoRefinamentoAindaAbertas(raiz, retornos),
    tratamentoMedicamentosSelecionados: emUso,
    casoRaizId: raiz.id || ""
  };
}

// ---------------------------------------------------------------- indices

const DIA_MS = 24 * 60 * 60 * 1000;

function duracaoTexto(dias) {
  if (dias < 1) return "hoje";
  if (dias < 60) return `${dias} ${dias === 1 ? "dia" : "dias"}`;
  const meses = Math.floor(dias / 30);
  return meses < 24 ? `${meses} meses` : `${Math.floor(meses / 12)} anos`;
}

export function caseIndices(entries = [], agora = Date.now()) {
  const ordem = entries.filter(Boolean).filter(entry => entryTime(entry)).sort(porData);
  if (!ordem.length) return null;
  const primeira = ordem[0];
  const ultima = ordem[ordem.length - 1];
  const ultimaConsulta = [...ordem].reverse().find(entry => entry.type !== "return");
  const diasDe = entry => Math.max(0, Math.floor((agora - entryTime(entry)) / DIA_MS));
  return {
    inicio: primeira.createdAt,
    tempoAcompanhamento: duracaoTexto(diasDe(primeira)),
    consultas: ordem.filter(entry => entry.type !== "return").length,
    retornos: ordem.filter(entry => entry.type === "return").length,
    ultimoAtendimento: ultima.createdAt,
    desdeUltimo: duracaoTexto(diasDe(ultima)),
    hipoteses: ultimaConsulta ? selectedDiagnosisText(ultimaConsulta).split("\n").filter(Boolean).map(formatDiagnosisForDocument) : [],
    emUso: medicationHistory(ordem).filter(item => item.situacao === "em uso").map(item => item.nome)
  };
}
