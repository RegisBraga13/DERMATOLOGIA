import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { carryForwardDermatologyLesions, newDermatologyLesion, normalizeDermatologyLesion, sanitizeDermatologyRecord, updateDermatologyLesionsFromFields } from "../../src/specialties/dermatologia/index.js";

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

  it("atualiza apenas a lesão editada e limpa seleções desmarcadas", () => {
    const original = [
      { id: "a", label: "Primeira", morfologia: ["Pápula"], distribuicao: ["Face"] },
      { id: "b", label: "Segunda", localizacao: "Tronco" }
    ];
    const fields = {
      "dermLesion__0__morfologia": [],
      "dermLesion__0__distribuicao": "Membros superiores",
      "dermLesion__0__cor": "Eritematoso",
      "dermLesion__0__label": "Lesão inicial",
      "dermLesion__3__localizacao": "Inexistente",
      "dermA_queixaPrincipal": "Prurido"
    };
    const updated = updateDermatologyLesionsFromFields(original, fields);
    assert.equal(updated[0].id, "a");
    assert.equal(updated[0].label, "Lesão inicial");
    assert.deepEqual(updated[0].morfologia, []);
    assert.deepEqual(updated[0].distribuicao, ["Membros superiores"]);
    assert.equal(updated[0].cor, "Eritematoso");
    assert.equal(updated[1].id, "b");
    assert.equal(updated[1].localizacao, "Tronco");
    assert.deepEqual(original[0].morfologia, ["Pápula"]);
    assert.deepEqual(fields, { dermA_queixaPrincipal: "Prurido" });
    assert.equal(updateDermatologyLesionsFromFields(original, { dermP_tratamento: "creme" }), null);
  });

  it("leva apenas a identificação ao retorno e exige novo registro dos achados", () => {
    const prior = [{ id: "a", label: "Lesão A", localizacao: "Braço", dimensoes: "4 mm", morfologia: ["Pápula"] }];
    const current = carryForwardDermatologyLesions(prior);
    assert.equal(current[0].id, "a");
    assert.equal(current[0].label, "Lesão A");
    assert.equal(current[0].localizacao, "");
    assert.equal(current[0].dimensoes, "");
    assert.deepEqual(current[0].morfologia, []);
    assert.equal(prior[0].dimensoes, "4 mm");
  });
});
