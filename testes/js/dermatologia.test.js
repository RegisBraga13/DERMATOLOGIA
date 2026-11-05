import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DERMATOLOGIA_SPECIALTY,
  DERMATOLOGY_PHYSICAL_EXAM_FIELDS,
  defaultDermatologyConsultation,
  sanitizeDermatologyRecord
} from "../../src/specialties/dermatologia/index.js";
import { specialtyById } from "../../src/specialties/registry.js";

describe("módulo de Dermatologia", () => {
  it("expõe o contrato da especialidade sem depender do domínio psiquiátrico", () => {
    assert.equal(specialtyById("dermatologia"), DERMATOLOGIA_SPECIALTY);
    assert.ok(DERMATOLOGIA_SPECIALTY.consultationPages.some(([key]) => key === "exame-fisico"));
    assert.ok(DERMATOLOGY_PHYSICAL_EXAM_FIELDS.some(([key]) => key === "morfologia"));
  });

  it("cria uma consulta com namespaces próprios", () => {
    const record = defaultDermatologyConsultation({ patientId: "p1", sequence: 2 });
    assert.equal(record.specialty, "dermatologia");
    assert.equal(record.label, "Consulta dermatológica 2");
    assert.deepEqual(record.dermatology.exameFisico, {});
  });

  it("normaliza registro legado sem apagar dados transversais", () => {
    const record = sanitizeDermatologyRecord({ id: "c1", patientId: "p1", notes: "ok", dermatology: { avaliacao: { diagnosticoPrincipal: "Acne" } } });
    assert.equal(record.id, "c1");
    assert.equal(record.notes, "ok");
    assert.equal(record.specialty, "dermatologia");
    assert.equal(record.dermatology.avaliacao.diagnosticoPrincipal, "Acne");
    assert.deepEqual(record.dermatology.conduta, {});
  });
});
