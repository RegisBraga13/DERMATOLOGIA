import assert from "node:assert/strict";
import { it } from "node:test";
import { consultationPages } from "../../src/clinical/vocabulary.js";
import { dermatologySourceText, hdIsCurrent, historyIsCurrent, planIsCurrent } from "../../src/clinical/dermatologyPipeline.js";

it("ordena o fluxo: pele, exames, história, HD e conduta", () => {
  assert.deepEqual(consultationPages.slice(0, 5).map(([key]) => key),
    ["anamnese", "psiquico", "evolucao", "diagnostico", "tratamento"]);
});

it("história reúne somente dados de origem e se torna obsoleta após alteração", () => {
  const patient = { fototipoFitzpatrick: "III" };
  const form = { dermA_queixaPrincipal: "Lesão no braço", dermImages: [
    { id: "1", date: "2025-01-01", description: "Mácula" }
  ], dermExams: [{ id: "2", date: "2026-01-01", type: "Laudo", description: "Achado conferido" }] };
  const source = dermatologySourceText(form, patient);
  assert.match(source, /Mácula/);
  assert.match(source, /Achado conferido/);
  assert.doesNotMatch(source, /Nome do paciente/);
  form.dermHistoryApproved = "História revisada";
  form.dermHistorySource = source;
  assert.equal(historyIsCurrent(form, patient), true);
  form.dermA_queixaPrincipal = "Lesão no braço e prurido";
  assert.equal(historyIsCurrent(form, patient), false);
});

it("HD só é atual com história aprovada; conduta só com HD aprovada", () => {
  const form = { dermA_queixaPrincipal: "Lesão" };
  form.dermHistoryApproved = "História salva";
  form.dermHistorySource = dermatologySourceText(form);
  form.dermHdApproved = "Hipótese revisada";
  form.dermHdSource = form.dermHistoryApproved;
  form.dermPlanApproved = "Conduta revisada";
  form.dermPlanSource = form.dermHdApproved;
  assert.equal(hdIsCurrent(form), true);
  assert.equal(planIsCurrent(form), true);
  form.dermHistoryApproved = "História alterada";
  assert.equal(hdIsCurrent(form), false);
  assert.equal(planIsCurrent(form), false);
});
