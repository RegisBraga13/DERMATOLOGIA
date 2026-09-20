// O refinamento e a analise psicopatologica no fluxo (20/09/2026): entram na
// historia clinica e, o que ficou em aberto, vira pergunta do retorno.
//
// Rodar a partir da raiz do projeto:
//     node --test 'testes/js/*.test.js'
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildEvolutionNarrative, refinementNarrativeText } from "../../src/clinical/narrative.js";
import { analysisFindingsForReturn, pendingRefinementItems } from "../../src/clinical/returnCarryover.js";
import { caseViewForReturn } from "../../src/clinical/caseTimeline.js";
import { missingReturnAssessment } from "../../src/views/exams.js";

const plano = {
  questions: [
    { topic: "Mania", prompt: "Ja teve periodo de energia muito aumentada, com pouco sono, por dias?", options: ["Sim", "Nao", "Nao esclarecido"] },
    { topic: "Substancias", prompt: "Ha relacao temporal com alguma substancia?", options: ["Nao", "Cafeina", "Nao esclarecido"] },
    { topic: "Sono", prompt: "Como esta o sono?", options: ["Bom", "Ruim"] }
  ],
  red_flags: [{ topic: "Risco suicida", reason: "Confirmar plano e meios." }],
  important_points: [{ topic: "Causa clinica", reason: "Excluir tireoide." }]
};

const consulta = {
  id: "c1", type: "consultation", refinementPlan: plano,
  refinementQuestion_0: ["Sim"], refinementQuestion_1: ["Nao esclarecido"], refinementQuestion_2: [],
  refinementRedFlag_0: "Negada", refinementImportant_0: "Nao esclarecido",
  refinementDoctorNotes: "Familiar confirma o relato."
};

describe("refinamento na historia clinica", () => {
  it("entra o que foi respondido, com a pergunta, e a observacao do medico", () => {
    const texto = refinementNarrativeText(consulta);
    assert.match(texto, /Mania \(ja teve periodo de energia muito aumentada.*\?\): sim/);
    assert.match(texto, /red flag risco suicida: negada/i);
    assert.match(texto, /observação do médico: familiar confirma o relato/);
  });

  it("pendencia nao e achado: nao esclarecido e nao avaliada ficam de fora", () => {
    const texto = refinementNarrativeText(consulta);
    assert.doesNotMatch(texto, /Substancias|Causa clinica/);
  });

  it("sem resposta nenhuma, sem paragrafo", () => {
    assert.equal(refinementNarrativeText({ refinementPlan: plano }), "");
  });

  it("vem antes do exame psiquico e tambem na historia preliminar; no retorno nao", () => {
    const form = { ...consulta, queixa: "Tristeza.", humor: ["Deprimido"] };
    const texto = buildEvolutionNarrative(form, {}, null, false, { preliminar: true });
    assert.ok(texto.indexOf("refinamento clínico") > -1 && texto.indexOf("refinamento clínico") < texto.indexOf("exame psíquico"));
    assert.doesNotMatch(buildEvolutionNarrative(form, {}, null, true), /refinamento clínico/);
  });
});

describe("o que o retorno herda", () => {
  it("as pendencias do refinamento: so as em aberto", () => {
    const itens = pendingRefinementItems(consulta);
    assert.equal(itens.length, 2);
    assert.ok(itens.some(item => /^Substancias/.test(item)));
    assert.ok(itens.some(item => /^Risco suicida/.test(item)) === false);
    assert.ok(itens.some(item => /^Causa clinica — falta: Excluir tireoide/.test(item)));
  });

  it("achados da analise: fora o que hipotese e sintoma-alvo ja acompanham, e a funcionalidade", () => {
    const previous = {
      diagnosticoSelecionado: ["Esquizofrenia - CID-11: 6A20 - DSM-5-TR: F20.9"],
      sintomasAlvoSelecionados: ["Insonia"],
      analisePsicopatologica: [
        "Sensopercepcao: alucinacoes auditivas (ouve vozes)",
        "Pensamento: afrouxamento de nexos, neologismo (frases nao terminam)",
        "Funcionalidade: prejuizo grave (trancou a faculdade)",
        "Sono: insonia (dorme de dia)"
      ].join("\n"),
      analisePsicopatologicaAchados: "Alucinacoes auditivas\nAfrouxamento de nexos, neologismo\nPrejuizo grave\nInsonia"
    };
    assert.deepEqual(analysisFindingsForReturn(previous), ["Alucinacoes auditivas", "Afrouxamento de nexos, neologismo"]);
  });

  it("registro antigo, sem os achados casados, nao pede nada", () => {
    assert.deepEqual(analysisFindingsForReturn({ analisePsicopatologica: "Humor: triste (chora)" }), []);
  });

  it("o retorno nao sai sem responder os novos blocos", () => {
    const faltando = missingReturnAssessment({}, consulta);
    assert.ok(faltando.some(item => /Substancias/.test(item)));
  });

  it("no segundo retorno, o que o primeiro confirmou ou descartou nao volta", () => {
    const rotulo = pendingRefinementItems(consulta)[0];
    const retorno1 = { id: "r1", type: "return", previousId: "c1", retornoPendencia_0Rotulo: rotulo, retornoPendencia_0: ["Confirmado"] };
    const visao = caseViewForReturn(retorno1, [consulta, retorno1]);
    assert.ok(Array.isArray(visao.pendenciasRefino));
    assert.ok(!visao.pendenciasRefino.includes(rotulo));
  });
});
