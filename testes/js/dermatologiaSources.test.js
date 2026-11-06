import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dermatologySourceForScope, dermatologySources, dermatologySourcesAreReady, dermatologySourceStatus } from "../../src/specialties/dermatologia/sources.js";

describe("governança das fontes dermatológicas", () => {
  it("não habilita RAG ou guideline enquanto o catálogo estiver em draft", () => {
    assert.deepEqual(dermatologySources(), []);
    assert.equal(dermatologySourcesAreReady("diagnostico"), false);
    assert.match(dermatologySourceStatus(), /não foram habilitadas/);
  });

  it("filtra fonte ativa pelo escopo clínico", () => {
    const catalog = [
      { id: "rag", status: "active", scope: ["anamnese"] },
      { id: "guideline", status: "active", scope: ["conduta"] },
      { id: "fora", status: "draft", scope: ["anamnese"] }
    ];
    assert.deepEqual(dermatologySources(catalog).map(item => item.id), ["rag", "guideline"]);
    assert.deepEqual(dermatologySourceForScope("anamnese", catalog).map(item => item.id), ["rag"]);
    assert.equal(dermatologySourcesAreReady("conduta", catalog), true);
  });
});
