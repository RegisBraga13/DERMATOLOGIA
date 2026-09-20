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
