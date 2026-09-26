import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { returnAssessmentBody } from "../../src/views/exams.js";
import { pendingCriteriaFromPrevious } from "../../src/clinical/returnCarryover.js";
import { returnStoryText } from "../../src/clinical/narrative.js";

// A avaliacao de evolucao passou a ler o atendimento anterior em 31/08/2026.
// Antes eram sete grupos fixos, iguais para todo retorno: "Sono" com as mesmas
// quatro opcoes servia igual para uma recaida maniaca e para um panico.
describe("a evolucao conversa com o diagnostico e o tratamento", () => {
  const anterior = {
    diagnosticoSelecionado: ["Transtorno bipolar tipo I, episódio maníaco - DSM-5-TR: F31.2"],
    tratamentoMedicamentosSelecionados: ["Lítio | Dose inicial: 300 mg 2x/dia"],
    sintomasAlvoSelecionados: ["Agitação psicomotora — contenção verbal e ambiente calmo"],
    diagnosticoAiCriterios: [
      "Hipótese X ::: Critério A: humor elevado por 1 semana ::: preenchido ::: dorme duas horas há três semanas",
      "Hipótese X ::: Critério D: exclusão de causa por substância ::: nao avaliavel ::: falta toxicológico de urina"
    ].join("\n")
  };

  it("sem atendimento anterior a tela mostra so a espinha fixa", () => {
    const html = returnAssessmentBody({}, null);
    assert.ok(html.includes("Adesao ao tratamento"));
    assert.ok(!html.includes("return-case-blocks"));
  });

  it("cada item do atendimento anterior vira uma pergunta", () => {
    const html = returnAssessmentBody({}, anterior);
    assert.ok(html.includes("Hipóteses do atendimento anterior"));
    assert.ok(html.includes("Medicamentos prescritos"));
    assert.ok(html.includes("Sintomas-alvo"));
    assert.ok(html.includes("Lítio"));
  });

  // O retorno do investimento dos criterios: o que ficou sem poder avaliar no
  // diagnostico e a lista do que perguntar hoje.
  it("so o criterio nao avaliavel vira pendencia, com o que falta", () => {
    const pendentes = pendingCriteriaFromPrevious(anterior);
    assert.equal(pendentes.length, 1);
    assert.ok(pendentes[0].startsWith("Critério D"));
    assert.ok(pendentes[0].includes("falta: falta toxicológico de urina"));
  });

  it("as respostas entram na narrativa com o rotulo, e nao com o indice", () => {
    const texto = returnStoryText({
      retornoHipotese_0: "Remissão parcial",
      retornoHipotese_0Rotulo: "Transtorno bipolar tipo I, episódio maníaco",
      retornoFarmaco_0: "Interrompeu",
      retornoFarmaco_0Rotulo: "Lítio 900 mg/dia"
    }, null);
    assert.ok(texto.includes("Transtorno bipolar tipo I, episódio maníaco, remissão parcial"));
    assert.ok(texto.includes("Lítio 900 mg/dia, interrompeu"));
  });

  // Retorno gravado antes da mudanca continua com sonoRetorno e
  // humorAnsiedadeRetorno no registro: o texto dele nao pode mudar.
  it("retorno salvo antes da mudanca mantem o texto que tinha", () => {
    const texto = returnStoryText({ sonoRetorno: "Insônia", humorAnsiedadeRetorno: "Deprimido" }, null);
    assert.ok(texto.includes("sono"));
    assert.ok(texto.toLowerCase().includes("deprimido"));
  });
});
