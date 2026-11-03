import assert from "node:assert/strict";
import { it } from "node:test";
import { sanitizeConsultationRecord } from "../../src/clinical/consultationRecord.js";

it("identificadores das decisões de IA permanecem no atendimento salvo", () => {
  const record = sanitizeConsultationRecord({
    aiDecisionIds: { diagnosis: "d123", treatment: "t456" },
    medicationChapter: { texto: "capítulo licenciado só da tela" }
  });
  assert.deepEqual(record.aiDecisionIds, { diagnosis: "d123", treatment: "t456" });
  assert.equal(record.medicationChapter, undefined);
});
