// A origem do diagnostico fica gravada no registro, desde 11/09/2026. O aviso
// na tela (aiStatus) dizia de onde veio, mas sumia na geracao seguinte, e o
// aiMode nao serve: e o seletor do modo, nao a procedencia.
//
// Rodar a partir da raiz do projeto:
//     node --test 'testes/js/*.test.js'
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { diagnosisSuggestionFromAi, diagnosisSuggestionFromLocalCatalogue } from "../../src/clinical/aiDiagnosisResult.js";

describe("origem do diagnostico no registro", () => {
  it("resposta do RAG", () => {
    assert.equal(diagnosisSuggestionFromAi({ result: {}, mode: "rag" }).diagnosticoOrigem, "rag");
  });

  it("resposta da IA Nuvem", () => {
    assert.equal(diagnosisSuggestionFromAi({ result: {}, mode: "current" }).diagnosticoOrigem, "nuvem");
  });

  it("catalogo local, quando a IA nao responde", () => {
    const local = diagnosisSuggestionFromLocalCatalogue({ qphda: "Paciente deprimida, com anedonia." }, { message: "sem rede" });
    assert.equal(local.diagnosticoOrigem, "local");
  });
});
