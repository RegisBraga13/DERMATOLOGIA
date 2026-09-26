import { CRITERION_SEPARATOR, entityName } from "./aiDiagnosisResult.js";
import { diagnosticEtiologicalOptionLines } from "./diagnosis.js";
import { stemsOf, termAlreadyWritten } from "./termMatch.js";
import { arrayValue, cleanClinicalLine, normalizeText } from "./textFormat.js";

// O que o atendimento anterior deixa para o retorno alem das hipoteses, dos
// criterios, dos farmacos e dos sintomas-alvo. Sao duas fontes, decisao dele em
// 20/09/2026:
//
// 1. O que o REFINAMENTO deixou sem esclarecer. Pergunta respondida "nao
//    esclarecido", red flag "nao avaliada", ponto importante "nao esclarecido":
//    e literalmente o que perguntar hoje, e antes ficava so no rascunho da
//    consulta.
// 2. Os ACHADOS da analise psicopatologica que o retorno ainda nao acompanha.
//    Hipotese e sintoma-alvo ja tem linha propria; o que esta no nome de uma ou
//    de outro nao se pergunta duas vezes. "Funcionalidade" tambem fica de fora:
//    a espinha fixa do retorno ja pergunta funcionalidade e eventos.

const MAX_PENDENCIAS = 6;
const MAX_ACHADOS = 6;

export function pendingRefinementItems(previous = {}) {
  const plan = previous.refinementPlan || {};
  const itens = [];
  (plan.questions || []).forEach((item, index) => {
    const respostas = arrayValue(previous[`refinementQuestion_${index}`]).map(normalizeText);
    if (respostas.includes("nao esclarecido")) itens.push(`${item.topic || "Pergunta"} — ${cleanClinicalLine(item.prompt || "")}`);
  });
  [["red_flags", "refinementRedFlag", "nao avaliada"], ["important_points", "refinementImportant", "nao esclarecido"]].forEach(([key, prefix, pendente]) => {
    (plan[key] || []).forEach((item, index) => {
      if (normalizeText(arrayValue(previous[`${prefix}_${index}`])[0] || "") === pendente) {
        itens.push(`${item.topic || "Ponto"} — falta: ${cleanClinicalLine(item.reason || "")}`);
      }
    });
  });
  return itens.slice(0, MAX_PENDENCIAS);
}

// AS HIPOTESES QUE EVOLUEM, e nao todas as que ele assinalou.
//
// A camada etiologica fica de fora. "Vulnerabilidade genetica para transtornos
// do humor" chegou ao retorno pedindo melhora, piora ou inalterado -- e ela nao
// e nenhuma das tres: nao evolui, nao muda, e nao ha o que responder ali. As
// tres camadas respondem a perguntas diferentes, e so duas delas respondem "como
// esta hoje": a nosologica diz QUAL entidade, a sindromica QUAL agrupamento --
// as duas descrevem o quadro, e quadro melhora ou piora. A etiologica diz POR
// QUE, e uma causa nao remite entre uma consulta e outra.
//
// O casamento e pelo nome da entidade porque a linha guardada carrega os codigos
// e a etiologica declarada guarda a mesma entidade com outra formatacao.
//
// Movida de views/exams.js para ca (24/09/2026): so depende de outros modulos
// clinical/, e o prompt (services/clinicalAiService.js) tambem precisa dela
// para dizer a extracao do retorno com que rotulos casar -- e services/ nao
// pode importar de views/ sem criar dependencia circular.
export function returnHypothesisLabels(previous = {}) {
  const etiologicas = new Set(diagnosticEtiologicalOptionLines(previous)
    .map(linha => normalizeText(entityName(linha))));
  return arrayValue(previous.diagnosticoSelecionado)
    .filter(item => !etiologicas.has(normalizeText(entityName(item))));
}

// Le as linhas de criterio gravadas pelo diagnostico e devolve so os que
// ficaram sem poder avaliar, com a pendencia que a IA apontou. Formato:
// hipotese ::: criterio ::: status ::: evidencia.
export function pendingCriteriaFromPrevious(previous = {}) {
  return String(previous.diagnosticoAiCriterios || "").split("\n")
    .map(linha => linha.split(CRITERION_SEPARATOR).map(parte => parte.trim()))
    .filter(partes => partes.length === 4 && partes.every(Boolean) && partes[2] === "nao avaliavel")
    .map(([, criterio, , pendencia]) => `${criterio} — falta: ${pendencia}`);
}

// No primeiro retorno o "anterior" e a propria consulta e as pendencias saem
// dela; nos seguintes vem ja filtradas pela cadeia (caseViewForReturn), sem as
// que um retorno confirmou ou descartou. Movida de views/exams.js pelo mesmo
// motivo de returnHypothesisLabels, acima.
export function pendingRefinementForReturn(previous = {}) {
  return Array.isArray(previous.pendenciasRefino) ? previous.pendenciasRefino : pendingRefinementItems(previous);
}

export function analysisFindingsForReturn(previous = {}) {
  const linhas = String(previous.analisePsicopatologica || "").split("\n").map(linha => linha.trim()).filter(Boolean);
  const achados = String(previous.analisePsicopatologicaAchados || "").split("\n").map(linha => linha.trim()).filter(Boolean);
  // Os dois campos nascem juntos, na mesma ordem. Se nao casarem (registro
  // antigo, ou editado), nao ha como saber o dominio de cada achado: nada a pedir.
  if (!linhas.length || linhas.length !== achados.length) return [];
  const jaAcompanhado = new Set(stemsOf([
    ...arrayValue(previous.diagnosticoSelecionado),
    ...arrayValue(previous.sintomasAlvoSelecionados)
  ].join(" ")));
  return achados
    .filter((achado, index) => !/^funcionalidade\b/i.test(normalizeText(linhas[index])))
    .filter(achado => !achado.split(",").map(termo => termo.trim()).filter(Boolean)
      .every(termo => termAlreadyWritten(termo, jaAcompanhado)))
    .slice(0, MAX_ACHADOS);
}
