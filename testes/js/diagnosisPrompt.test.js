import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildClinicalAiPrompt } from "../../src/services/clinicalAiService.js";

// Pedido dele, 14/09/2026, para valer SEMPRE: criterio do DSM-5-TR e referencia,
// e nao veredito; a mente e espectro; criterio se repete entre transtornos;
// gravidade pelo sofrimento e pela funcionalidade; diagnostico no tempo. Se uma
// destas regras sair do prompt, a IA volta a contar criterios.
const caso = {
  queixa: "Tristeza ha dois meses.",
  hdaManual: "Parou de trabalhar, nao sai de casa, dorme mal.",
  humor: ["Deprimido"]
};

describe("o diagnostico nao e contagem de criterios", () => {
  const geracao = buildClinicalAiPrompt("diagnosis", caso, {});
  const refino = buildClinicalAiPrompt("diagnosis_review", caso, {});

  it("quadro abaixo do limiar com sofrimento nao some", () => {
    assert.match(geracao, /referencia, e nao veredito/);
    assert.match(geracao, /abaixo do limiar de uma entidade NAO some/);
    assert.match(geracao, /outro transtorno especificado/);
  });

  it("criterio compartilhado nao decide o diferencial", () => {
    assert.match(geracao, /NAO separam uma hipotese da outra/);
  });

  it("a gravidade sai do sofrimento e da funcionalidade", () => {
    assert.match(geracao, /dominio 'Funcionalidade'/);
    assert.match(geracao, /e nao do numero de criterios preenchidos/);
  });

  it("o que pode mudar o diagnostico vira o que vigiar no seguimento", () => {
    assert.match(geracao, /O diagnostico e longitudinal/);
  });

  // Lista dele, 14/09/2026.
  it("toda hipotese depressiva confere os sete sinais de alerta para bipolaridade no criterio de mania", () => {
    assert.match(geracao, /sete sinais de alerta para bipolaridade/);
    for (const sinal of [/antes dos 20 anos/, /tres ou mais episodios/, /falta de resposta ao antidepressivo/,
      /esgotado por fora/, /pai, mae ou irmao com transtorno bipolar/, /hipersonia/, /inicio ou termino abrupto/]) {
      assert.match(geracao, sinal);
    }
  });

  // Medido em 14/09/2026: o oposto do sinal saia marcado como alerta.
  it("sinal presente ou em aberto deixa o criterio de mania nao avaliavel, e o oposto do sinal nao conta", () => {
    assert.match(geracao, /criterio de exclusao de mania ou hipomania/);
    assert.match(geracao, /Com algum sinal PRESENTE/);
    assert.match(geracao, /mostrar o CONTRARIO do sinal/);
    // Medido em 14/09/2026: "ausencia de sinais de bipolaridade" com a historia
    // familiar e a resposta ao antidepressivo sem registro.
    assert.match(geracao, /nao registrado nao e ausente/);
    assert.doesNotMatch(geracao, /shift_signs/);
  });

  it("funcionalidade pede o fato, e nao o rotulo do formulario", () => {
    assert.match(geracao, /o que a pessoa deixou de fazer, e desde quando/);
  });

  it("o Refinar herda as regras e nao conta criterios do DSM anexado", () => {
    assert.match(refino, /Conferir nao e contar/);
    assert.match(refino, /referencia, e nao veredito/);
    assert.match(refino, /O diagnostico e longitudinal/);
  });

  it("o prompt nao manda escrever em justificativa que o esquema nao tem", () => {
    assert.doesNotMatch(geracao, /diga isso na justificativa/);
  });
});
