import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDiagnosticSuggestion } from "../../src/clinical/diagnosis.js";

// Dele, 14/09/2026: "qualquer episodio de mania documentado caracteriza
// bipolaridade. Invariavelmente". Vale tambem no catalogo local, que responde
// quando a IA nao responde.
describe("mania documentada caracteriza bipolaridade", () => {
  const depressao = { hdaManual: "Episodio depressivo ha dois meses, com anedonia, desesperanca e insonia.", impacto: ["Grave", "Prejuizo social"] };

  it("sem mania no registro, a depressao unipolar continua proposta", () => {
    assert.match(buildDiagnosticSuggestion(depressao).diagnosticoAiNosologico, /Depressão Maior/);
  });

  it("com mania no registro, o bipolar entra e a depressao unipolar sai", () => {
    const nosologico = buildDiagnosticSuggestion({
      ...depressao,
      hdaManual: `${depressao.hdaManual} Ha dois anos teve episodio com euforia, logorreia e reducao da necessidade de sono.`
    }).diagnosticoAiNosologico;
    assert.match(nosologico, /Transtorno Bipolar/);
    assert.doesNotMatch(nosologico, /Depressão Maior/);
  });
});
