import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatPhone, whatsappLink } from "../../src/clinical/phone.js";
import { clinicalSummaryGroups } from "../../src/views/clinicalSummary.js";

describe("Fone/WhatsApp", () => {
  it("formata celular e fixo", () => {
    assert.equal(formatPhone("31900000000"), "(31) 90000-0000");
    assert.equal(formatPhone("3130000000"), "(31) 3000-0000");
  });

  it("formata aos poucos, enquanto digita", () => {
    assert.equal(formatPhone("3"), "(3");
    assert.equal(formatPhone("319"), "(31) 9");
    assert.equal(formatPhone("3190000"), "(31) 9000-0");
    assert.equal(formatPhone("31900001"), "(31) 9000-01");
  });

  it("numero colado com +55 ou com zero interurbano vira nacional", () => {
    assert.equal(formatPhone("55 31 90000-0000"), "(31) 90000-0000");
    assert.equal(formatPhone("031900000000"), "(31) 90000-0000");
  });

  it("telefone salvo antes da mudanca continua igual", () => {
    assert.equal(formatPhone("(31) 90000-0000"), "(31) 90000-0000");
  });

  it("texto escrito junto do numero nao e apagado pela mascara", () => {
    assert.equal(formatPhone("9999-0000 recado com a mãe"), "9999-0000 recado com a mãe");
  });

  it("numero estrangeiro nao passa pela mascara brasileira", () => {
    assert.equal(formatPhone("+351 912 345 678"), "+351 912 345 678");
    assert.equal(whatsappLink("+351 912 345 678"), "https://wa.me/351912345678");
  });

  it("so gera link do WhatsApp com o numero completo", () => {
    assert.equal(whatsappLink("(31) 90000-0000"), "https://wa.me/5531900000000");
    assert.equal(whatsappLink("(31) 9000"), "");
    assert.equal(whatsappLink(""), "");
  });

  it("o Resumo mostra o rotulo Fone/WhatsApp", () => {
    const linha = clinicalSummaryGroups({}, { telefone: "(31) 90000-0000" })
      .flatMap(grupo => grupo.rows || [])
      .find(row => row.value === "(31) 90000-0000");
    assert.ok(linha);
    assert.equal(linha.item, "Fone/WhatsApp");
  });
});
