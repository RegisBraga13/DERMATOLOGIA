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
    const record = { dermatology: { lesions: [{ id: "l1", label: "Lesão 1", localizacao: "Antebraço", dimensoes: "4 mm", morfologia: ["Pápula"], cor: "Eritematoso" }] } };
    const editor = dermatologyConsultationPage("psiquico", record);
    assert.match(editor, /Antebraço/);
    assert.match(editor, /name="dermLesion__0__morfologia" value="Pápula" checked/);
    assert.match(editor, /name="dermLesion__0__cor"/);
    assert.match(dermatologyReportText(record), /Pápula; Eritematoso; 4 mm/);
    const summary = dermatologyConsultationPage("resumo", record);
    assert.doesNotMatch(summary, /\[object Object\]|Nenhum achado dermatológico registrado/);
    assert.match(summary, /Pápula; Eritematoso; 4 mm/);
  });

  it("o retorno mostra o histórico sem fingir exame atual e registra a reavaliação", () => {
    const prior = { label: "Consulta inicial", dermLesions: [{ id: "l1", label: "Placa do braço", localizacao: "Braço" }] };
    const html = dermatologyReturnPage("evolucao-retorno", {}, prior);
    assert.match(html, /Histórico para comparação; não representa exame realizado hoje/);
    assert.match(html, /Placa do braço/);
    assert.match(html, /data-action="copy-derm-lesions"/);
    const current = { dermLesions: [{ id: "l1", label: "Placa do braço", dimensoes: "6 mm" }], dermRet_resposta: "Melhora parcial" };
    const withCurrent = dermatologyReturnPage("evolucao-retorno", current, prior);
    assert.match(withCurrent, /6 mm/);
    assert.doesNotMatch(withCurrent, /data-action="copy-derm-lesions"/);
    assert.match(dermatologyReportText(current), /Resposta à conduta anterior: Melhora parcial/);
  });
});
