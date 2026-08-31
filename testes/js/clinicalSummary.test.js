import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clinicalSummaryGroups } from "../../src/views/clinicalSummary.js";

function linhaSintomaAlvo(form) {
  return clinicalSummaryGroups(form, {})
    .flatMap(grupo => grupo.rows || [])
    .filter(linha => linha.section === "Sintoma-Alvo");
}

// Ate 31/08/2026 esta linha do Resumo era montada percorrendo o catalogo dos
// trinta sintomas: so aparecia o que estivesse nele. Com a busca por sintoma no
// apendice, o medico escreve o que quiser -- e pelo caminho antigo o sintoma
// digitado sumia do prontuario em silencio, que e o pior jeito de sumir.
describe("Sintoma-Alvo no Resumo", () => {
  it("mostra o sintoma que o medico digitou, fora de qualquer catalogo", () => {
    const linhas = linhaSintomaAlvo({ sintomasResiduais: ["ideação delirante de grandeza"] });
    assert.equal(linhas.length, 1);
    assert.equal(linhas[0].value, "ideação delirante de grandeza");
  });

  it("prontuario salvo antes da mudanca continua igual", () => {
    const linhas = linhaSintomaAlvo({ sintomasResiduais: ["Insônia inicial ou de manutenção", "Agitação psicomotora"] });
    assert.equal(linhas[0].value, "Insônia inicial ou de manutenção; Agitação psicomotora");
  });

  it("o texto do antigo campo Outro sobrevive, e o rotulo Outro nao aparece", () => {
    const linhas = linhaSintomaAlvo({
      sintomasResiduais: ["Anedonia", "Outro"],
      sintomasResiduaisOutro: "sobressalto a portas batendo"
    });
    assert.equal(linhas[0].value, "Anedonia; sobressalto a portas batendo");
  });

  it("sem sintoma nenhum a secao nao aparece", () => {
    assert.deepEqual(linhaSintomaAlvo({}), []);
  });
});
