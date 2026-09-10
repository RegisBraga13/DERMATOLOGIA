import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scaleById } from "../../src/data/scales.js";
import { scaleChangeStatus, scaleFieldName, scaleResult, scalesNarrativeText } from "../../src/clinical/scoring.js";
import { suggestedScales } from "../../src/clinical/scaleSuggestions.js";
import { scaleTrendsView } from "../../src/views/scales.js";
import { MONITORING, monitoringExamSelection, monitoringFor } from "../../src/data/monitoring.js";
import { optionGroups } from "../../src/data/examOptions.js";
import { treatmentModule } from "../../src/views/decisions.js";

// O acompanhamento das escalas, desde 10/09/2026: resposta e remissao, a
// escala sugerida para o caso, a evolucao no prontuario e a monitorizacao
// laboratorial dos farmacos assinalados.

function formWith(id, valores, extra = {}) {
  const scale = scaleById(id);
  const form = { escalasAplicadas: [id], ...extra };
  valores.forEach((valor, index) => {
    if (valor !== undefined) form[scaleFieldName(scale, index)] = String(valor);
  });
  return form;
}

const phq = scaleById("phq9");
const nove = valor => Array(9).fill(valor);

describe("resposta e remissao", () => {
  const base = { entry: { createdAt: "2026-08-01T10:00:00Z" }, result: scaleResult(phq, formWith("phq9", nove(2))) };
  const oitoSemanasDepois = Date.parse("2026-09-26T10:00:00Z");

  it("queda de 50% ou mais e resposta, com o intervalo", () => {
    const hoje = scaleResult(phq, formWith("phq9", [1, 1, 1, 1, 1, 1, 1, 1, 0]));
    assert.equal(scaleChangeStatus(phq, hoje, base, oitoSemanasDepois).rotulo, "resposta, queda de 56% em 8 semanas");
  });

  it("total ate 4 e remissao", () => {
    const hoje = scaleResult(phq, formWith("phq9", nove(0)));
    assert.equal(scaleChangeStatus(phq, hoje, base, oitoSemanasDepois).tipo, "remissao");
  });

  it("queda pequena e sem resposta: e o que muda a conduta", () => {
    const hoje = scaleResult(phq, formWith("phq9", [2, 2, 2, 2, 2, 2, 2, 1, 1]));
    assert.equal(scaleChangeStatus(phq, hoje, base, oitoSemanasDepois).rotulo, "sem resposta, queda de 11% em 8 semanas");
  });

  it("subir e piora", () => {
    const hoje = scaleResult(phq, formWith("phq9", nove(3)));
    assert.equal(scaleChangeStatus(phq, hoje, base, oitoSemanasDepois).tipo, "piora");
  });

  it("escala sem criterio de mudanca nao inventa status", () => {
    const gds = scaleById("gds15");
    const valores = Array(15).fill(1);
    const antes = { entry: { createdAt: "2026-08-01T10:00:00Z" }, result: scaleResult(gds, formWith("gds15", valores)) };
    assert.equal(scaleChangeStatus(gds, scaleResult(gds, formWith("gds15", Array(15).fill(0))), antes), null);
  });

  it("o intervalo conta ate a data do registro, e nao ate hoje", () => {
    const consulta = formWith("phq9", nove(2), { id: "c1", createdAt: "2026-08-01T10:00:00Z" });
    const retorno = formWith("phq9", [1, 1, 1, 1, 1, 1, 1, 1, 0], { id: "r1", createdAt: "2026-09-26T10:00:00Z" });
    assert.match(scalesNarrativeText(retorno, consulta), /resposta, queda de 56% em 8 semanas/);
  });
});

describe("escalas sugeridas para o caso", () => {
  it("cada sugestao vem de um dado registrado; negacao nao sugere", () => {
    const sugestoes = suggestedScales({
      depressaoSintomas: ["Desanimo ou desesperanca"],
      riscoSuicidioIndicadores: ["Ideacao suicida"],
      usoSubstanciasComportamentos: ["Alcool"],
      maniaHipomaniaSintomas: ["Nega sintomas relacionados"]
    }, { nascimento: "1950-01-01" });
    const ids = sugestoes.map(item => item.id);
    for (const id of ["cssrs", "phq9", "audit", "gds15"]) assert.ok(ids.includes(id), id);
    assert.ok(!ids.includes("mdq"));
    assert.ok(sugestoes.every(item => item.motivos.length));
  });

  it("gestacao e puerperio sugerem a EPDS", () => {
    assert.ok(suggestedScales({ gravidez: "Sim, com certeza" }, {}).some(item => item.id === "epds"));
    assert.ok(suggestedScales({ cicloReprodutivo: ["Puerperio"] }, {}).some(item => item.id === "epds"));
  });

  it("no retorno: as escalas ja aplicadas, a CGI-I e a anamnese da consulta", () => {
    const ids = suggestedScales({}, {}, { isReturn: true, previous: { escalasAplicadas: ["gad7"], depressaoSintomas: ["Fala lenta"] } }).map(item => item.id);
    assert.deepEqual(ids.slice(0, 2), ["gad7", "cgi-i"]);
    assert.ok(ids.includes("phq9"));
  });

  it("caso sem dado que motive escala nao sugere nada", () => {
    assert.deepEqual(suggestedScales({}, {}), []);
  });
});

describe("evolucao das escalas no prontuario", () => {
  const consulta = (id, valor, createdAt) => formWith("phq9", nove(valor), { id, createdAt, label: id });

  it("tres aplicacoes viram grafico, com a sequencia na legenda", () => {
    const html = scaleTrendsView([
      consulta("c3", 0, "2026-09-20T10:00:00Z"),
      consulta("c1", 2, "2026-08-01T10:00:00Z"),
      consulta("c2", 1, "2026-08-25T10:00:00Z")
    ]);
    assert.match(html, /Evolução das escalas/);
    assert.match(html, /18 → 9 → 0/);
    assert.match(html, /<svg/);
  });

  it("uma aplicacao so nao e evolucao", () => {
    assert.equal(scaleTrendsView([consulta("c1", 2, "2026-08-01T10:00:00Z")]), "");
  });

  it("C-SSRS nao tem numero para eixo: vira lista das classificacoes", () => {
    const alto = formWith("cssrs", [0, 1, 0, 0, 1, 0], { createdAt: "2026-08-01T10:00:00Z" });
    const baixo = formWith("cssrs", [1, 0, undefined, undefined, undefined, 0], { createdAt: "2026-09-01T10:00:00Z" });
    const html = scaleTrendsView([alto, baixo]);
    assert.match(html, /scale-trend-list/);
    assert.match(html, /Risco alto/);
    assert.match(html, /Risco baixo/);
    assert.doesNotMatch(html, /<svg/);
  });
});

describe("monitorizacao por medicamento", () => {
  it("todo exame que o botao marca existe entre as opcoes da tela", () => {
    const opcoes = new Set(optionGroups.examesPsiquiatria);
    for (const bloco of MONITORING) {
      for (const exame of bloco.exames) assert.ok(opcoes.has(exame), `${bloco.rotulo}: ${exame}`);
    }
    assert.ok(opcoes.has("Beta-HCG"));
  });

  it("litio pede litemia; beta-hCG so para quem pode engravidar", () => {
    const comGestacao = monitoringFor(["Carbonato de lítio | 300 mg 2x/dia"], { podeEngravidar: true });
    assert.ok(comGestacao[0].exames.includes("Litemia"));
    assert.ok(comGestacao[0].exames.includes("Beta-HCG"));
    const semGestacao = monitoringFor(["Carbonato de lítio | 300 mg 2x/dia"]);
    assert.ok(!semGestacao[0].exames.includes("Beta-HCG"));
  });

  it("o farmaco citado na justificativa nao puxa o exame dele", () => {
    const blocos = monitoringFor(["Quetiapina 50 mg/dia | evitar associar ao lítio"]);
    assert.deepEqual(blocos.map(bloco => bloco.rotulo), ["Antipsicótico de segunda geração"]);
  });

  it("clozapina leva neutrofilos e troponina para o campo Outro", () => {
    const { opcoes, extras } = monitoringExamSelection(monitoringFor(["Clozapina 25 mg/noite"]));
    assert.ok(opcoes.includes("ECG"));
    assert.ok(extras.includes("Contagem de neutrófilos"));
    assert.ok(extras.includes("Troponina"));
  });

  it("o Tratamento so mostra o bloco com farmaco assinalado", () => {
    assert.match(treatmentModule({ tratamentoMedicamentosSelecionados: ["Clozapina 25 mg/noite"] }), /Monitorização dos medicamentos assinalados/);
    assert.doesNotMatch(treatmentModule({}), /Monitorização dos medicamentos/);
  });
});
