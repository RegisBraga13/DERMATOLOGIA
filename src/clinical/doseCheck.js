import { catalogoConferido } from "../data/medicationCatalog.js";
import { MONITORING } from "../data/monitoring.js";
import { optionParts } from "./optionParts.js";
import { normalizeText } from "./textFormat.js";

// Conferencia deterministica da posologia proposta pela IA.
//
// O `validate_result` do servidor pergunta "isto e uma string nao vazia?" sobre
// `initial_dose`, `target_dose` e `progression`. "Sertralina 400 mg/dia,
// aumentar a cada 3 dias" passa em todos os portoes e chega a tela como caixa
// de assinalar, com a mesma cara de uma proposta certa. Foi exatamente a ficha
// que ele montou errada de proposito em 02/09/2026 para testar a revisao --
// e a revisao saiu da tela desde entao.
//
// O material da conferencia ja estava no repositorio sem ser usado para
// conferir nada: `medications.js` guarda `initialDose` e `usualDose` por
// farmaco, e `monitoring.js` marca com `gestacao: true` os teratogenicos. Aqui
// eles viram verificador.
//
// O QUE ISTO NAO E. Nao e revisao clinica: sao tres regras que se leem de
// tabela, escolhidas por errarem pouco para o lado do alarme falso. Alerta que
// aparece sem motivo deixa de ser lido em duas semanas, e ai o alerta que
// importa tambem nao e lido -- a mesma razao pela qual a porta de recusa das
// diretrizes foi calibrada para ZERO recusa falsa antes de entrar.
//
// Interacao e contraindicacao ficaram de fora de proposito: em `medications.js`
// sao texto corrido ("IMAO, outros serotoninergicos, anticoagulantes, AINEs"),
// e cruzar isso com o que o paciente toma e casamento de termo sobre prosa --
// que e justamente o que o RAG.md registra como a coisa errada a fazer quando
// o que se quer e um digito. Quem confere isso e a revisao pelo `tratado`.

// Dose e fármaco em mg/dia, que e como o catalogo escreve e como a IA responde.
const MEDIDA = /(\d+(?:[.,]\d+)?)\s*(mg|mcg|µg|g)\b/gi;
// Dose por peso nao se compara com teto em mg/dia: 2 mg/kg/dia num adulto
// passa de 100 mg e nao e dose alta. Linha assim sai da conferencia inteira.
const POR_PESO = /mg\s*\/\s*kg/i;

function numero(texto) {
  return Number(String(texto).replace(",", "."));
}

// "50 a 200 mg/dia" tem UM numero com unidade colada e outro sem. Lido como
// esta, o 50 nao existe -- e o teto continuava certo, porque teto e o maior,
// enquanto o piso saia 200 e reprovava toda dose abaixo do topo da faixa. A
// faixa ganha a unidade nos dois lados antes de qualquer leitura.
const FAIXA_DE_DOSE = /(\d+(?:[.,]\d+)?)\s*(?:a|-|ate|até)\s*(\d+(?:[.,]\d+)?)\s*(mg|mcg|µg|g)\b/gi;

/**
 * Todos os valores em mg do texto, ou null quando nao da para afirmar.
 *
 * Null em tres casos, e todos os tres significam "nao conferido", nunca
 * "conferido e certo": sem numero nenhum, com unidade que nao e mg (mcg e g
 * comparados como mg dariam alarme falso por fator de mil), e com dose por
 * peso.
 */
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

/**
 * O maior valor em mg do texto, ou null.
 *
 * O maior, e nao o primeiro: "50 a 200 mg/dia" e "200 mg/dia divididos em duas
 * tomadas" devolvem 200 nos dois casos, porque o que se compara com o teto e o
 * topo da faixa proposta.
 */
export function tetoEmMg(texto = "") {
  const valores = valoresEmMg(texto);
  return valores ? Math.max(...valores) : null;
}

/**
 * O MENOR valor em mg do texto, pelas mesmas regras do teto.
 *
 * No catalogo, o piso de `usualDose` e a dose a partir da qual o farmaco foi
 * estudado como tratamento -- 50 mg de sertralina, 20 de fluoxetina. E o que
 * separa "foi testado" de "foi tomado": abaixo dele, o que falhou nao foi o
 * farmaco, foi a dose. Quem usa isto e o historico farmacologico.
 */
export function pisoEmMg(texto = "") {
  const valores = valoresEmMg(texto);
  return valores ? Math.min(...valores) : null;
}

const DIAS_POR_UNIDADE = { dia: 1, dias: 1, semana: 7, semanas: 7, mes: 30, meses: 30 };
const FAIXA_DE_TEMPO = /(\d+)\s*(?:a|-|ate|até)\s*(\d+)\s*(dias?|semanas?|mes|meses)/gi;
const TEMPO_SIMPLES = /(\d+)\s*(dias?|semanas?|mes|meses)/gi;

/**
 * O MENOR intervalo entre aumentos, em dias, ou null.
 *
 * O menor porque e o que define o ritmo mais rapido que a linha autoriza, e
 * porque a faixa do catalogo ("intervalos de 1 a 2 semanas") tem de ser lida
 * pelo seu piso: titular a cada 7 dias esta dentro dela, e comparar contra as
 * 2 semanas acusaria o que o proprio livro permite.
 */
export function intervaloMinimoEmDias(texto = "") {
  const limpo = normalizeText(String(texto || ""));
  if (!limpo) return null;
  const dias = [];
  // As faixas saem primeiro e deixam o lugar em branco: sem isto, "1 a 2
  // semanas" seria lido de novo pela regra simples, como se fossem dois
  // intervalos separados de 1 e de 2 semanas.
  const semFaixas = limpo.replace(FAIXA_DE_TEMPO, (_, piso, __, unidade) => {
    dias.push(numero(piso) * (DIAS_POR_UNIDADE[unidade] || 0));
    return " ";
  });
  for (const [, valor, unidade] of semFaixas.matchAll(TEMPO_SIMPLES)) {
    dias.push(numero(valor) * (DIAS_POR_UNIDADE[unidade] || 0));
  }
  if (/\bsemanal(mente)?\b/.test(semFaixas)) dias.push(7);
  if (/\bquinzenal(mente)?\b/.test(semFaixas)) dias.push(15);
  if (/\bmensal(mente)?\b/.test(semFaixas)) dias.push(30);
  const validos = dias.filter(valor => Number.isFinite(valor) && valor > 0);
  return validos.length ? Math.min(...validos) : null;
}

// O farmaco e procurado SO no titulo da linha -- o pedaco antes da primeira
// barra --, pela mesma razao que `monitoringFor` ja usa: a justificativa cita
// outros nomes ("evitar associar ao litio"), e deixar o texto todo escolher o
// farmaco puxaria o teto do fármaco errado.
function tituloDaLinha(linha = "") {
  return normalizeText(optionParts(linha).titulo);
}

export function catalogoDoFarmaco(linha = "") {
  const titulo = tituloDaLinha(linha);
  if (!titulo) return null;
  const catalogo = catalogoConferido();
  return catalogo.find(item => titulo.includes(normalizeText(item.generic)))
    || catalogo.find(item => String(item.brands || "").split(",")
      .some(marca => marca.trim() && titulo.includes(normalizeText(marca))))
    || null;
}

export function teratogenicoDaLinha(linha = "") {
  const titulo = tituloDaLinha(linha);
  if (!titulo) return null;
  return MONITORING.find(bloco => bloco.gestacao && bloco.farmacos.some(farmaco => titulo.includes(farmaco))) || null;
}

function valorDaParte(linha, rotulos) {
  const { partes } = optionParts(linha);
  const achada = partes.find(parte => rotulos.includes(parte.rotulo));
  return achada ? achada.valor : "";
}

/**
 * A conferencia de uma linha de tratamento.
 *
 * Tres estados, e a diferenca entre eles e o ponto: `conferido` afirma que a
 * conferencia rodou e nao achou divergencia; `sem_catalogo` afirma que ela NAO
 * rodou. Sao coisas diferentes e a tela precisa dizer qual e qual -- ausencia
 * de alerta nao pode passar por dose conferida, pelo mesmo motivo que a nuvem
 * sem pagina achada nao afirma ter pesquisado.
 */
export function medicationLineReview(linha = "", { gestacaoConfirmada = false } = {}) {
  const texto = String(linha || "").trim();
  if (!texto) return null;
  const alertas = [];

  const teratogenico = teratogenicoDaLinha(texto);
  if (teratogenico && gestacaoConfirmada) {
    alertas.push({
      codigo: "teratogenico_em_gestacao",
      texto: `${teratogenico.rotulo} é teratogênico e a gestação está confirmada nesta anamnese.`
    });
  }

  const catalogo = catalogoDoFarmaco(texto);
  if (!catalogo) {
    return { linha: texto, estado: alertas.length ? "divergencia" : "sem_catalogo", farmaco: "", alertas, referencia: "" };
  }

  const teto = tetoEmMg(catalogo.usualDose);
  const propostas = [
    { rotulo: "Dose final", valor: valorDaParte(texto, ["Dose final", "Dose alvo"]) },
    { rotulo: "Dose inicial", valor: valorDaParte(texto, ["Dose inicial"]) }
  ];
  propostas.forEach(({ rotulo, valor }) => {
    const proposta = tetoEmMg(valor);
    if (teto && proposta && proposta > teto) {
      alertas.push({
        codigo: "dose_acima_do_teto",
        texto: `${rotulo} proposta (${valor}) acima da faixa usual para ${catalogo.generic}: ${catalogo.usualDose}.`
      });
    }
  });

  const intervaloCatalogo = intervaloMinimoEmDias(catalogo.progression);
  const intervaloProposto = intervaloMinimoEmDias(valorDaParte(texto, ["Progressão", "Titulação"]));
  if (intervaloCatalogo && intervaloProposto && intervaloProposto < intervaloCatalogo) {
    alertas.push({
      codigo: "titulacao_mais_rapida",
      texto: `Titulação proposta a cada ${intervaloProposto} ${intervaloProposto === 1 ? "dia" : "dias"}, mais rápida que a usual para ${catalogo.generic}: ${catalogo.progression}`
    });
  }

  return {
    linha: texto,
    estado: alertas.length ? "divergencia" : "conferido",
    farmaco: catalogo.generic,
    alertas,
    referencia: `${catalogo.generic}: inicial ${catalogo.initialDose}; usual ${catalogo.usualDose}.`
  };
}

/**
 * A conferencia das opcoes de tratamento, uma por linha, na ordem da tela.
 *
 * `alertasDoServidor` sao os que vieram na resposta (`dose_warnings`). O
 * servidor confere a mesma coisa, pela mesma tabela (`medications.json`,
 * gerada deste mesmo catalogo) e pelos mesmos casos
 * (`testes/casos_de_dose.json`) -- entao, com tudo em dia, os dois dizem o
 * mesmo e a uniao nao acrescenta nada.
 *
 * A uniao existe para o dia em que NAO disserem: se o servidor viu uma
 * divergencia que esta copia nao viu, quem esta desatualizado e a tela, e o
 * alerta precisa aparecer assim mesmo. O contrario tambem vale -- o registro
 * salvo e redesenhado sem chamada nenhuma, e ali so existe esta conferencia.
 */
export function treatmentDoseReview(linhas = [], { alertasDoServidor = [], ...opcoes } = {}) {
  const porLinha = new Map();
  arrayDeAlertas(alertasDoServidor).forEach(alerta => {
    const chave = String(alerta?.linha || "");
    if (!chave) return;
    porLinha.set(chave, [...(porLinha.get(chave) || []), { codigo: alerta.codigo, texto: alerta.texto }]);
  });
  return (Array.isArray(linhas) ? linhas : [])
    .map(linha => {
      const revisao = medicationLineReview(linha, opcoes);
      if (!revisao) return null;
      const doServidor = porLinha.get(revisao.linha) || [];
      const novos = doServidor.filter(alerta => !revisao.alertas.some(
        existente => existente.codigo === alerta.codigo && existente.texto === alerta.texto));
      if (!novos.length) return revisao;
      return { ...revisao, estado: "divergencia", alertas: [...revisao.alertas, ...novos] };
    })
    .filter(Boolean);
}

function arrayDeAlertas(valor) {
  return Array.isArray(valor) ? valor.filter(item => item && item.codigo && item.texto) : [];
}

// A gestacao que suspende prescricao e a CONFIRMADA. "Nao sabe" pede beta-hCG
// antes de prescrever -- e o que o cartao da saude reprodutiva ja diz na tela
// --, e nao um alerta de teratogenicidade sobre uma gestacao que talvez nao
// exista. Afirmar demais aqui e o mesmo defeito de afirmar de menos.
export function gestacaoConfirmadaEm(form = {}) {
  const resposta = Array.isArray(form.gravidez) ? form.gravidez[0] : form.gravidez;
  return normalizeText(resposta || "").startsWith("sim");
}

/** Quantos farmacos o catalogo local cobre -- a tela diz isto ao recusar conferir. */
export const CATALOGO_LOCAL_TAMANHO = catalogoConferido().length;
