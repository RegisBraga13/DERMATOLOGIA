// A resposta da IA chega dezenas de segundos depois do clique. Se o rascunho
// foi trocado nesse intervalo, ela nao pode ser gravada no do paciente seguinte.
//
// Rodar a partir da raiz do projeto:
//     node --test 'testes/js/*.test.js'
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createDraftGuard } from "../../src/clinical/draftGuard.js";

describe("guarda do rascunho durante a chamada de IA", () => {
  it("sem troca de rascunho, a resposta ainda vale", () => {
    const guarda = createDraftGuard();
    const vigente = guarda.capture();
    assert.equal(vigente(), true);
  });

  it("trocar de paciente durante a espera invalida a resposta", () => {
    const guarda = createDraftGuard();
    const vigente = guarda.capture();
    guarda.replaced();
    assert.equal(vigente(), false);
  });

  it("a invalidacao nao volta: trocar de novo nao ressuscita a chamada antiga", () => {
    const guarda = createDraftGuard();
    const vigente = guarda.capture();
    guarda.replaced();
    guarda.replaced();
    assert.equal(vigente(), false);
  });

  it("uma chamada iniciada depois da troca vale, e a anterior continua invalida", () => {
    const guarda = createDraftGuard();
    const antiga = guarda.capture();
    guarda.replaced();
    const nova = guarda.capture();
    assert.equal(antiga(), false);
    assert.equal(nova(), true);
  });

  it("chamadas simultaneas caem juntas quando o rascunho troca", () => {
    const guarda = createDraftGuard();
    const diagnostico = guarda.capture();
    const tratamento = guarda.capture();
    guarda.replaced();
    assert.equal(diagnostico(), false);
    assert.equal(tratamento(), false);
  });

  it("cada guarda tem a sua contagem", () => {
    const a = createDraftGuard();
    const b = createDraftGuard();
    const vigenteB = b.capture();
    a.replaced();
    assert.equal(vigenteB(), true);
  });
});
