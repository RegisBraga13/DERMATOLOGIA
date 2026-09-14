import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeText } from "../../src/clinical/textFormat.js";

// Texto que vem de PDF traz ligadura tipografica: "ﬂuoxetina" com o "ﬂ" num
// caractere so. Com NFD a ligadura nao se desfazia, e o nome nao casava com o
// digitado. NFKD desfaz a ligadura e continua tirando o acento.
describe("normalizeText", () => {
  it("desfaz ligadura de PDF", () => {
    assert.equal(normalizeText("ﬂuoxetina"), "fluoxetina");
    assert.equal(normalizeText("especiﬁcado"), "especificado");
  });

  it("continua tirando acento e caixa", () => {
    assert.equal(normalizeText("Episódio Depressivo"), "episodio depressivo");
  });
});
