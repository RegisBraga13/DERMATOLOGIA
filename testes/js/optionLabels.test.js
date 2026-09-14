import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { optionDisplayLabel, optionScreenLabel } from "../../src/clinical/textFormat.js";
import { ANAMNESIS_AI_FIELDS, anamnesisQuestionGroups, optionShortLabels } from "../../src/clinical/vocabulary.js";
import { optionGroups } from "../../src/data/examOptions.js";
import { anamnesisStructuredFields, chips } from "../../src/ui/controls.js";
import { clinicalSummaryGroups } from "../../src/views/clinicalSummary.js";

// Desde 14/09/2026 a caixa mostra um rotulo curto. O curto e so de tela: o
// valor gravado, o resumo e a resposta da IA seguem com a frase inteira.
describe("Rotulo curto das caixas", () => {
  it("a caixa mostra o curto, grava a frase inteira e a guarda no title", () => {
    const html = chips("maniaHipomaniaSintomas", "Mania", ["Fazendo coisas impulsivas"], []);
    assert.match(html, /value="Fazendo coisas impulsivas"/);
    assert.match(html, /title="Fazendo coisas impulsivas"/);
    assert.match(html, />Impulsividade<\/label>/);
  });

  it("opcao sem rotulo curto nao ganha title", () => {
    const html = chips("fatores", "Fatores", ["Luto"], []);
    assert.doesNotMatch(html, /title=/);
    assert.match(html, />Luto<\/label>/);
  });

  it("o resumo do prontuario continua com a frase inteira", () => {
    const linha = clinicalSummaryGroups({ maniaHipomaniaSintomas: ["Fazendo coisas impulsivas"] }, {})
      .flatMap(grupo => grupo.rows || [])
      .find(row => row.value.includes("impulsiv"));
    assert.equal(linha.value, "Fazendo coisas impulsivas");
  });

  it("todo rotulo curto aponta para uma opcao que existe", () => {
    const existentes = new Set([
      ...Object.values(optionGroups).flat(),
      ...Object.values(ANAMNESIS_AI_FIELDS).flatMap(([, opcoes]) => opcoes),
      ...anamnesisQuestionGroups.flatMap(g => g.items.flatMap(([, itens]) => itens.flatMap(item => item.options || []))),
      "Alteracao de peso ou metabolica", "Conflito, estressor ou luto"
    ]);
    const orfaos = Object.keys(optionShortLabels).filter(frase => !existentes.has(frase));
    assert.deepEqual(orfaos, []);
  });

  it("o curto e mais curto, e o display label segue intacto", () => {
    for (const [frase, curto] of Object.entries(optionShortLabels)) {
      assert.ok(curto.length < frase.length, frase);
      assert.equal(optionDisplayLabel(frase), frase);
      assert.equal(optionScreenLabel(frase), curto);
    }
  });

  it("a anamnese estruturada usa a mesma caixa .chip", () => {
    const html = anamnesisStructuredFields([{ key: "riscoSuicidioIndicadores", response: "multiple", options: ["Desesperanca"] }], {});
    assert.match(html, /<div class="chips">/);
    assert.match(html, /<label class="chip"><input type="checkbox" name="riscoSuicidioIndicadores" value="Desesperanca"/);
    assert.doesNotMatch(html, /multi-choice-options/);
  });
});
