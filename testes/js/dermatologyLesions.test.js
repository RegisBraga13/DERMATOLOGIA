import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { newDermatologyLesion, normalizeDermatologyLesion, sanitizeDermatologyRecord } from "../../src/specialties/dermatologia/index.js";

describe("lesões dermatológicas", () => {
  it("cria uma lesão com campos próprios e sem fotografia incorporada", () => {
    const lesion = newDermatologyLesion({ id: "l1", label: "Lesão 1" });
    assert.equal(lesion.id, "l1");
    assert.deepEqual(lesion.morfologia, []);
    assert.equal(lesion.fotoReferencia, "");
  });

  it("normaliza listas vindas de registros antigos", () => {
    const lesion = normalizeDermatologyLesion({ id: "l1", localizacao: "face", morfologia: "pápula" });
    assert.deepEqual(lesion.morfologia, []);
    assert.deepEqual(lesion.distribuicao, []);
    assert.equal(lesion.localizacao, "face");
  });

  it("preserva múltiplas lesões ao sanitizar a consulta", () => {
    const record = sanitizeDermatologyRecord({ dermatology: { lesions: [{ id: "a" }, { id: "b", dimensoes: "4 mm" }] } });
    assert.deepEqual(record.dermatology.lesions.map(item => item.id), ["a", "b"]);
    assert.equal(record.dermatology.lesions[1].dimensoes, "4 mm");
  });
});
