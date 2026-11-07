import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { consultationPages, returnPages } from "../../src/clinical/vocabulary.js";
import { dermatologyConsultationPage, dermatologyReturnPage, dermatologyReportText, dermatologyFormValues } from "../../src/views/dermatologyFlow.js";

describe("fluxo clínico dermatológico", () => {
  it("renderiza conteúdo para todas as etapas da consulta", () => {
    for (const [page] of consultationPages) {
      const html = dermatologyConsultationPage(page, {}, { nome: "Pessoa fictícia" });
      assert.ok(html.length > 0, `Página vazia: ${page}`);
      assert.doesNotMatch(html, /exame psíquico|mania|risco suicida/i);
    }
  });

  it("renderiza conteúdo para todas as etapas do retorno", () => {
    for (const [page] of returnPages) {
      const html = dermatologyReturnPage(page, {}, { label: "Consulta anterior" });
      assert.ok(html.length > 0, `Página vazia: ${page}`);
    }
  });

  it("o prontuário e o PDF usam dados dermatológicos", () => {
    const text = dermatologyReportText({ dermA_queixaPrincipal: "Prurido", dermD_diagnosticoPrincipal: "Hipótese em avaliação" });
    assert.match(text, /Prurido/);
    assert.match(text, /Hipótese em avaliação/);
  });

  it("abre os registros da primeira versão sem ocultar a anamnese", () => {
    const old = { dermatology: { anamnese: { queixaPrincipal: "Lesão no braço" }, exameFisico: { morfologiaSelecionada: ["Pápula"] } } };
    assert.equal(dermatologyFormValues(old).dermA_queixaPrincipal, "Lesão no braço");
    assert.match(dermatologyConsultationPage("anamnese", old), /Lesão no braço/);
    assert.match(dermatologyReportText(old), /Lesão no braço/);
  });

  it("mostra lesões individualizadas já salvas e as inclui no prontuário", () => {
    const record = { dermatology: { lesions: [{ id: "l1", label: "Lesão 1", localizacao: "Antebraço", dimensoes: "4 mm" }] } };
    assert.match(dermatologyConsultationPage("psiquico", record), /Antebraço/);
    assert.match(dermatologyReportText(record), /4 mm/);
  });

  it("só leva a descrição revisada para diagnóstico, história e prontuário", () => {
    const pending = dermatologyConsultationPage("neurologico", {});
    assert.match(pending, /data-derm-photo/);
    assert.match(pending, /data-derm-description/);
    assert.doesNotMatch(dermatologyConsultationPage("diagnostico", {}), /Descrição revisada da lesão/);
    assert.doesNotMatch(dermatologyReportText({}), /Descrição revisada da lesão/);

    const record = { dermApprovedDescription: "Placa eritematosa de 2 cm no antebraço" };
    assert.match(dermatologyConsultationPage("diagnostico", record), /Placa eritematosa de 2 cm/);
    assert.match(dermatologyConsultationPage("evolucao", record), /Placa eritematosa de 2 cm/);
    assert.match(dermatologyReportText(record), /Placa eritematosa de 2 cm/);
  });
});
