import assert from "node:assert/strict";
import { it } from "node:test";
import { needsUnicodePrint } from "../../src/services/pdfService.js";

it("documento clínico com caracteres fora de WinAnsi vai à impressão Unicode", () => {
  assert.equal(needsUnicodePrint("Saturação 98% — revisão"), false);
  assert.equal(needsUnicodePrint("α-sinucleína e 你好"), true);
  assert.equal(needsUnicodePrint("pessoa 😀"), true);
});
