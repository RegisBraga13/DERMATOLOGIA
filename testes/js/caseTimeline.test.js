import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalDrug, caseChain, caseIndices, caseViewForReturn, drugLabel, groupCases,
  medicationHistory, parseMedicationDecision
} from "../../src/clinical/caseTimeline.js";
import { missingReturnAssessment } from "../../src/views/exams.js";
import { caseSummaryView } from "../../src/views/caseSummary.js";

// Leva 4 (14/09/2026): retornos em cadeia, farmaco com nome unico, medicamentos
// ao longo do caso e o resumo do caso.

const consulta = {
  id: "c1", type: "consultation", label: "Consulta 1", createdAt: "2026-07-01T10:00:00.000Z",
  diagnosticoSelecionado: ["Depressão Maior - CID-11: 6A70 - DSM-5-TR: F32.9"],
  diagnosticoAiCriterios: [
    "Depressão Maior ::: Critério A ::: preenchido ::: humor deprimido",
    "Depressão Maior ::: Critério C ::: nao avaliavel ::: TSH"
  ].join("\n"),
  sintomasAlvoSelecionados: ["Insônia"],
  tratamentoMedicamentosSelecionados: ["Sertralina | Dose inicial: 50 mg/dia", "Clonazepam 0,5 mg à noite"]
};
const retorno1 = {
  id: "r1", type: "return", label: "Retorno", previousEntryId: "c1", createdAt: "2026-08-01T10:00:00.000Z",
  retornoFarmaco_0: "Em uso como prescrito", retornoFarmaco_0Rotulo: "Sertralina | Dose inicial: 50 mg/dia",
  retornoFarmaco_1: "Interrompeu", retornoFarmaco_1Rotulo: "Clonazepam 0,5 mg à noite",
  retornoCriterio_0: "Descartado", retornoCriterio_0Rotulo: "Critério C — falta: TSH",
  ajusteMedicacaoSelecionada: ["Sertralina — Aumentar dose | 100 mg/dia | resposta parcial"]
};
const retorno2 = { id: "r2", type: "return", label: "Retorno", previousEntryId: "r1", createdAt: "2026-09-01T10:00:00.000Z" };
const todos = [retorno2, consulta, retorno1];

describe("farmaco com nome unico", () => {
  it("nome, sal, marca e minuscula viram o mesmo farmaco", () => {
    assert.equal(canonicalDrug("Sertralina | Dose inicial: 50 mg"), "Sertralina");
    assert.equal(canonicalDrug("Zoloft 50 mg"), "Sertralina");
    assert.equal(canonicalDrug("Carbonato de lítio 300 mg 2x/dia"), "Lítio");
    assert.equal(canonicalDrug("divalproato ER 500 mg"), "Ácido valproico");
  });

  it("so o comeco da linha conta: a justificativa nao troca o farmaco", () => {
    assert.equal(canonicalDrug("Quetiapina 25 mg | evitar associar ao lítio"), "Quetiapina");
  });

  it("farmaco fora da lista fica com o nome escrito, sem a dose", () => {
    assert.equal(canonicalDrug("Esketamina nasal 56 mg"), null);
    assert.equal(drugLabel("Esketamina nasal 56 mg"), "Esketamina nasal");
  });

  it("le a decisao do Ajuste de conduta", () => {
    assert.deepEqual(parseMedicationDecision("Sertralina — Aumentar dose | 100 mg/dia | resposta parcial"),
      { nome: "Sertralina", acao: "Aumentar dose", tipo: "aumentar", detalhe: "100 mg/dia", motivo: "resposta parcial" });
    assert.equal(parseMedicationDecision("Clonazepam — Retirar | reduzir 0,25 mg por semana").tipo, "retirar");
  });
});

describe("retornos em cadeia", () => {
  it("o retorno do retorno chega a consulta que abriu o caso", () => {
    assert.deepEqual(caseChain(retorno2, todos).map(item => item.id), ["c1", "r1", "r2"]);
  });

  it("ciclo gravado por engano nao trava", () => {
    const a = { id: "a", type: "return", previousEntryId: "b" };
    const b = { id: "b", type: "return", previousEntryId: "a" };
    assert.equal(caseChain(a, [a, b]).length, 2);
  });

  it("o prontuario agrupa a consulta e todos os retornos, em ordem", () => {
    const outra = { id: "c2", type: "consultation", createdAt: "2026-06-01T10:00:00.000Z" };
    const casos = groupCases([...todos, outra]);
    assert.equal(casos.length, 2);
    assert.equal(casos[0].consulta.id, "c1");
    assert.deepEqual(casos[0].retornos.map(item => item.id), ["r1", "r2"]);
  });

  it("retorno cuja consulta nao esta na lista abre grupo proprio", () => {
    const casos = groupCases([retorno1, retorno2]);
    assert.equal(casos.length, 1);
    assert.equal(casos[0].consulta, null);
    assert.equal(casos[0].retornos.length, 2);
  });
});

describe("o retorno do retorno le o caso", () => {
  const visao = caseViewForReturn(retorno1, todos);

  it("herda hipoteses e sintomas-alvo da consulta, e guarda id e data do retorno", () => {
    assert.equal(visao.id, "r1");
    assert.equal(visao.createdAt, retorno1.createdAt);
    assert.deepEqual(visao.diagnosticoSelecionado, consulta.diagnosticoSelecionado);
    assert.deepEqual(visao.sintomasAlvoSelecionados, ["Insônia"]);
  });

  it("os medicamentos sao os em uso depois do retorno, com a dose nova", () => {
    assert.deepEqual(visao.tratamentoMedicamentosSelecionados, ["Sertralina 100 mg/dia"]);
  });

  it("criterio descartado no retorno nao volta a ser pergunta", () => {
    assert.doesNotMatch(visao.diagnosticoAiCriterios, /Critério C/);
    const faltando = missingReturnAssessment({}, visao);
    assert.ok(faltando.includes("Sertralina 100 mg/dia"));
    assert.ok(!faltando.some(item => item.includes("Critério C")));
    assert.ok(!faltando.some(item => item.includes("Clonazepam")));
  });

  it("a consulta anterior continua sendo lida como era", () => {
    assert.equal(caseViewForReturn(consulta, todos), consulta);
  });
});

describe("medicamentos ao longo do caso", () => {
  const historico = medicationHistory(todos);

  it("um farmaco por nome, com situacao e historico", () => {
    assert.deepEqual(historico.map(item => [item.nome, item.situacao]), [
      ["Sertralina", "em uso"],
      ["Clonazepam", "interrompido pelo paciente"]
    ]);
    assert.equal(historico[0].eventos.length, 3);
    assert.match(historico[0].eventos[2].texto, /aumentar dose: 100 mg\/dia/);
  });

  it("retirar e trocar suspendem", () => {
    const decisao = { id: "r3", type: "return", createdAt: "2026-09-10T10:00:00.000Z", ajusteMedicacaoSelecionada: ["Zoloft — Trocar medicamento | escitalopram 10 mg"] };
    assert.equal(medicationHistory([...todos, decisao])[0].nome, "Sertralina");
    assert.equal(medicationHistory([...todos, decisao]).find(item => item.nome === "Sertralina").situacao, "suspenso (troca)");
  });
});

describe("resumo do caso", () => {
  const agora = Date.parse("2026-09-14T10:00:00.000Z");

  it("indices: inicio, atendimentos, ultimo, em uso e hipoteses", () => {
    const indices = caseIndices(todos, agora);
    assert.equal(indices.consultas, 1);
    assert.equal(indices.retornos, 2);
    assert.equal(indices.tempoAcompanhamento, "2 meses");
    assert.equal(indices.desdeUltimo, "13 dias");
    assert.deepEqual(indices.emUso, ["Sertralina"]);
    assert.deepEqual(indices.hipoteses, ["Depressão Maior (CID-11 6A70; DSM-5-TR F32.9)"]);
  });

  it("a tela mostra o resumo e a tabela; sem atendimento, nada", () => {
    const html = caseSummaryView(todos, agora);
    assert.match(html, /Resumo do caso/);
    assert.match(html, /1 consulta · 2 retornos/);
    assert.match(html, /Medicamentos ao longo do caso/);
    assert.equal(caseSummaryView([], agora), "");
  });
});
