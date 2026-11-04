import assert from "node:assert/strict";
import { it } from "node:test";
import { exportTextAsPdf, needsUnicodePrint } from "../../src/services/pdfService.js";

it("documento clínico com caracteres fora de WinAnsi vai à impressão Unicode", () => {
  assert.equal(needsUnicodePrint("Saturação 98% — revisão"), false);
  assert.equal(needsUnicodePrint("α-sinucleína e 你好"), true);
  assert.equal(needsUnicodePrint("pessoa 😀"), true);
});

it("impressão Unicode conserva caracteres e funciona sem onclick embutido", () => {
  let markup = "";
  let onClick;
  let printed = false;
  globalThis.window = { open: () => ({
    document: {
      write: text => { markup = text; }, close() {},
      querySelector: () => ({ addEventListener: (event, callback) => { if (event === "click") onClick = callback; } })
    },
    print: () => { printed = true; }
  }) };
  exportTextAsPdf("Relatório α", "Paciente <Teste> 😀");
  assert.match(markup, /Relatório α/);
  assert.match(markup, /Paciente &lt;Teste&gt; 😀/);
  assert.doesNotMatch(markup, /onclick=/);
  onClick();
  assert.equal(printed, true);
});
