import { curtaData, drugLabel, parseMedicationDecision, respostasDeFarmaco } from "./caseTimeline.js";
import { arrayValue, normalizeText } from "./textFormat.js";
import { optionParts } from "./optionParts.js";

// O que o paciente RELATA de tratamento anterior, fora deste programa --
// P8 do PENDENCIAS.md, na parte simples. So transporte: nenhum codigo
// classifica, resume ou valida o que esta aqui -- e por isso que fica em
// texto livre, e nao em campo com Sim/Nao. Decisao do Dr. Regis, 24/09/2026:
// "so isso, sem analise de IA para validar essas informacoes".
//
// So filtra linha vazia. A frase inteira, do jeito que foi escrita ou
// extraida da transcricao, e o que chega ao Tratamento.
export function reportedMedicationTreatmentLines(form = {}) {
  return String(form.tratamentoFarmacoPrevioRelato || "")
    .split("\n")
    .map(linha => linha.trim())
    .filter(Boolean);
}

// Leitura de dose em mg, so o suficiente para saber QUANTO foi usado num
// ensaio -- nao para comparar contra tabela nenhuma (essa comparacao, e o
// catalogo que a sustentava, foram retirados por decisao dele em 23/09/2026).
const MEDIDA = /(\d+(?:[.,]\d+)?)\s*(mg|mcg|µg|g)\b/gi;
const POR_PESO = /mg\s*\/\s*kg/i;
const FAIXA_DE_DOSE = /(\d+(?:[.,]\d+)?)\s*(?:a|-|ate|até)\s*(\d+(?:[.,]\d+)?)\s*(mg|mcg|µg|g)\b/gi;

function numero(texto) {
  return Number(String(texto).replace(",", "."));
}

function valoresEmMg(texto = "") {
  const limpo = String(texto || "");
  if (!limpo.trim() || POR_PESO.test(limpo)) return null;
  const comUnidade = limpo.replace(FAIXA_DE_DOSE, (_, piso, teto, unidade) => `${piso} ${unidade} a ${teto} ${unidade}`);
  const valores = [];
  for (const [, valor, unidade] of comUnidade.matchAll(MEDIDA)) {
    if (normalizeText(unidade) !== "mg") return null;
    valores.push(numero(valor));
  }
  const validos = valores.filter(valor => Number.isFinite(valor) && valor > 0);
  return validos.length ? validos : null;
}

/** O maior valor em mg do texto, ou null -- o topo do que a linha propoe. */
function tetoEmMg(texto = "") {
  const valores = valoresEmMg(texto);
  return valores ? Math.max(...valores) : null;
}

// O HISTORICO FARMACOLOGICO COMO ENSAIO, e nao como lista de nomes.
//
// O `medicationHistory` do caseTimeline responde "o que ele toma hoje", que e a
// pergunta da tela. A proposta de tratamento faz outra pergunta, e nenhuma das
// duas respostas estava chegando ao modelo: o que ja foi tentado, em que dose,
// por quanto tempo, e como terminou. Sem isso a IA propunha sertralina para
// quem tomou 150 mg dela por dois meses sem resposta -- e propunha uma terceira
// classe para quem entrou em remissao com fluoxetina em 2024.
//
// A regra clinica e dele, 23/09/2026, e e o que esta codificado aqui:
//
//   - usado na dose correta e pelo tempo necessario e nao respondeu
//     -> aponta para NAO prescrever de novo;
//   - funcionou em outro episodio
//     -> forte indicacao de prescrever o mesmo.
//
// A consequencia de cada veredito vai no PROMPT, e nao neste arquivo: aqui se
// apura o que aconteceu, la se diz o que fazer com isso. E a mesma divisao do
// resto do programa -- este modulo monta a evidencia, a politica fica escrita
// onde pode ser lida e discutida.
//
// UM ENSAIO NAO E UM FARMACO. O mesmo farmaco pode ter sido tentado duas vezes,
// e as duas podem ter terminado diferente -- interrompido por conta propria em
// 2024, e depois levado ate 200 mg por tres meses em 2026. Sao dois ensaios, e
// juntá-los num registro so apagaria justamente a diferenca que decide a
// conduta de hoje. Por isso a lista e de ensaios, e um farmaco pode aparecer
// mais de uma vez.

// O tempo minimo para chamar um ensaio de adequado.
//
// QUATRO SEMANAS, PARA TODO FARMACO. Decisao dele em 23/09/2026, escolhida
// entre tabela por classe, 4, 6 e 8 semanas.
//
// O corte e o mesmo para todos de propósito: um numero so, declarado aqui, em
// vez de espalhado por condicionais. Se um dia precisar variar por classe, o
// lugar e este, e a classe ja esta em medications.js (`className`).
//
// Quatro semanas e um corte PERMISSIVO: mais ensaios passam a contar como
// adequados, e portanto mais farmacos ficam excluidos da proxima proposta. O
// erro que ele escolheu evitar e o oposto -- represcrever o que ja foi testado
// --, e o preco e excluir de vez em quando um farmaco que teria respondido com
// mais tempo. Vale rever quando o log tiver caso suficiente para medir.
export const ENSAIO_MINIMO_SEMANAS = 4;

const MS_POR_SEMANA = 7 * 24 * 60 * 60 * 1000;

// Motivo de retirada que fala de tolerabilidade, e nao de eficacia. So o texto
// ESCRITO por ele decide isto: efeito colateral marcado no retorno e do
// periodo, nao do farmaco, e atribui-lo a um dos tres em uso seria inventar o
// que ninguem registrou.
const MARCAS_DE_INTOLERANCIA = /(efeito|intoler|adverso|reacao|colateral)/;

const ADESAO_QUE_FECHA = { interrompeu: "interrompeu", "nunca iniciou": "nunca iniciou" };

const RESPOSTA_BOA = /(melhora|remissao)/;

function quando(entry = {}) {
  return Date.parse(entry.createdAt || "") || 0;
}

function chave(linha = "") {
  return normalizeText(drugLabel(linha));
}

// A dose que a linha do tratamento planeja. "Dose final" e o alvo; sem ele, a
// inicial e o unico numero que existe.
function doseDaPrescricao(linha = "") {
  const { partes } = optionParts(linha);
  const alvo = partes.find(parte => ["Dose final", "Dose alvo"].includes(parte.rotulo))
    || partes.find(parte => parte.rotulo === "Dose inicial");
  return { mg: tetoEmMg(alvo?.valor || ""), texto: alvo?.valor || "" };
}

/**
 * O ensaio teve tempo suficiente? Dose deixou de entrar nesta conta: a tabela
 * de faixa usual por farmaco foi retirada por decisao dele em 23/09/2026, e
 * sem ela nao ha piso para comparar. Tempo insuficiente ainda fecha como
 * `false`; tempo suficiente nunca mais confirma "adequado" -- vira `null`,
 * "nao da para afirmar", e o veredito cai em INDETERMINADO.
 */
function ensaioAdequado(ensaio) {
  return ensaio.semanas === null || ensaio.semanas < ENSAIO_MINIMO_SEMANAS ? false : null;
}

function veredito(ensaio) {
  if (!ensaio.fim) return "EM_USO";
  if (ensaio.fechadoPor === "interrompeu" || ensaio.fechadoPor === "nunca iniciou") return "NAO_TESTADO";
  // Intolerancia antes de eficacia: um farmaco retirado por efeito colateral
  // nao "falhou" -- nao chegou a ser testado contra o quadro, e o que o exclui
  // e outro motivo, que vale tambem para a classe dele.
  if (ensaio.intolerancia) return "INTOLERANCIA";
  if (RESPOSTA_BOA.test(normalizeText(ensaio.evolucao))) return "RESPOSTA_BOA";
  if (ensaio.adequado === false) return "ENSAIO_INSUFICIENTE";
  return "INDETERMINADO";
}

/**
 * Todos os ensaios do paciente, do mais antigo para o mais recente.
 *
 * `entries` sao TODOS os atendimentos dele, e nao os do caso: o que funcionou
 * em outro episodio e justamente o que nao esta na cadeia deste.
 */
export function medicationTrials(entries = [], { agora = Date.now() } = {}) {
  const abertos = new Map();
  const ensaios = [];
  const abrir = (nome, entry, dose = { mg: null, texto: "" }) => {
    const item = {
      nome, inicio: entry.createdAt || "", fim: "", fechadoPor: "",
      doseMg: dose.mg, doseTexto: dose.texto, adesao: "", evolucao: "",
      efeitos: [], motivo: "", intolerancia: false, semanas: null, adequado: null
    };
    ensaios.push(item);
    abertos.set(chave(nome), item);
    return item;
  };
  const aberto = (nome, entry, dose) => abertos.get(chave(nome)) || abrir(drugLabel(nome), entry, dose);
  const fechar = (item, entry, porque, motivo = "") => {
    if (!item) return;
    item.fim = entry.createdAt || "";
    item.fechadoPor = porque;
    if (motivo) item.motivo = motivo;
    item.intolerancia = item.intolerancia || MARCAS_DE_INTOLERANCIA.test(normalizeText(motivo));
    abertos.delete(chave(item.nome));
  };

  [...entries].filter(Boolean).sort((a, b) => quando(a) - quando(b)).forEach(entry => {
    if (entry.type !== "return") {
      arrayValue(entry.tratamentoMedicamentosSelecionados).forEach(linha => {
        if (!chave(linha)) return;
        const dose = doseDaPrescricao(linha);
        const jaAberto = abertos.get(chave(linha));
        // Represcrito depois de fechado e ensaio NOVO. Represcrito com o
        // ensaio aberto e a mesma tentativa seguindo: o que muda e a dose.
        if (jaAberto) {
          jaAberto.doseMg = Math.max(jaAberto.doseMg ?? 0, dose.mg ?? 0) || null;
          if (dose.texto) jaAberto.doseTexto = dose.texto;
        } else {
          abrir(drugLabel(linha), entry, dose);
        }
      });
      return;
    }
    const evolucao = arrayValue(entry.evolucaoClinicaRetorno)[0] || "";
    const efeitos = arrayValue(entry.efeitos).filter(item => normalizeText(item) !== "nenhum");
    respostasDeFarmaco(entry).forEach(({ rotulo, valor }) => {
      if (!chave(rotulo)) return;
      const item = aberto(rotulo, entry, doseDaPrescricao(rotulo));
      item.adesao = valor;
      item.evolucao = evolucao;
      item.efeitos = efeitos;
      const fecha = ADESAO_QUE_FECHA[normalizeText(valor)];
      if (fecha) fechar(item, entry, fecha);
      // "Em uso com dose alterada" sem o quanto registrado apaga a dose: a
      // linha da prescricao deixou de valer e nada ocupou o lugar dela. Dose
      // desconhecida e null, e null nao acusa ensaio insuficiente.
      else if (normalizeText(valor).includes("dose alterada")) item.doseMg = null;
    });
    arrayValue(entry.ajusteMedicacaoSelecionada).map(parseMedicationDecision).forEach(decisao => {
      if (!decisao.nome || !chave(decisao.nome)) return;
      const item = aberto(decisao.nome, entry);
      item.evolucao = item.evolucao || evolucao;
      if (!item.efeitos.length) item.efeitos = efeitos;
      if (decisao.motivo) item.motivo = decisao.motivo;
      if (decisao.tipo === "aumentar" || decisao.tipo === "diminuir") {
        const nova = tetoEmMg(decisao.detalhe);
        // A dose do ensaio e a MAIOR que ele chegou a tomar: e ela que diz se
        // o farmaco foi testado. Reduzir depois nao desfaz o que ja foi usado.
        if (nova !== null) item.doseMg = Math.max(item.doseMg ?? 0, nova);
        if (decisao.detalhe) item.doseTexto = decisao.detalhe;
      }
      if (decisao.tipo === "retirar" || decisao.tipo === "trocar") {
        fechar(item, entry, decisao.tipo, decisao.motivo || decisao.acao);
      }
    });
  });

  return ensaios.map(item => {
    const fim = item.fim ? Date.parse(item.fim) : agora;
    const inicio = Date.parse(item.inicio || "");
    const semanas = Number.isFinite(inicio) && Number.isFinite(fim) && fim >= inicio
      ? Math.floor((fim - inicio) / MS_POR_SEMANA)
      : null;
    // O intervalo entre dois atendimentos so e tempo de uso para quem usou o
    // intervalo inteiro. Quem nunca iniciou tem zero; quem INTERROMPEU parou
    // em algum ponto que ninguem registrou, e dizer "10 semanas de uso" ali
    // seria afirmar o que nao se sabe -- exatamente o que o programa nao faz
    // com dose. Tempo desconhecido e null, e null nao vira ensaio adequado.
    item.semanas = item.fechadoPor === "nunca iniciou" ? 0
      : item.fechadoPor === "interrompeu" ? null
        : semanas;
    item.adequado = ensaioAdequado(item);
    item.veredito = veredito(item);
    return item;
  });
}

const ROTULO_DO_VEREDITO = {
  EM_USO: "em uso agora",
  RESPOSTA_BOA: "RESPOSTA BOA em episodio anterior",
  ENSAIO_INSUFICIENTE: "ensaio insuficiente",
  NAO_TESTADO: "nao testado",
  INTOLERANCIA: "INTOLERANCIA",
  INDETERMINADO: "sem dados suficientes"
};

function evidencia(ensaio) {
  const partes = [];
  partes.push(ensaio.doseTexto ? `dose ${ensaio.doseTexto}` : "dose nao registrada");
  partes.push(ensaio.semanas === null ? "tempo nao registrado"
    : `${ensaio.semanas} semana(s) de uso`);
  if (ensaio.adesao) partes.push(`adesao: ${ensaio.adesao.toLowerCase()}`);
  if (ensaio.evolucao) partes.push(`evolucao do caso no periodo: ${ensaio.evolucao.toLowerCase()}`);
  if (ensaio.efeitos.length) partes.push(`efeitos no periodo: ${ensaio.efeitos.join(", ").toLowerCase()}`);
  if (ensaio.motivo) partes.push(`motivo do fim: "${ensaio.motivo}"`);
  const periodo = [curtaData(ensaio.inicio), ensaio.fim ? curtaData(ensaio.fim) : "hoje"].filter(Boolean).join(" a ");
  if (periodo) partes.push(periodo);
  return partes.join("; ");
}

/** Uma linha por ensaio, para o prompt. Fatos e veredito; a conduta e a tarefa. */
export function medicationTrialsText(ensaios = []) {
  return ensaios
    .map(ensaio => `- ${ensaio.nome} — ${ROTULO_DO_VEREDITO[ensaio.veredito] || ensaio.veredito}: ${evidencia(ensaio)}.`)
    .join("\n");
}

