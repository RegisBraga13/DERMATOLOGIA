import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { CAMPOS_DO_SERVIDOR, medicationTable } from "../../scripts/build_medication_table.mjs";
import { medicationLineReview } from "../../src/clinical/doseCheck.js";
import { medications } from "../../src/data/medications.js";

const raiz = new URL("../../", import.meta.url);
const gerada = JSON.parse(readFileSync(new URL("src/data/medications.json", raiz), "utf8"));
const casos = JSON.parse(readFileSync(new URL("testes/casos_de_dose.json", raiz), "utf8")).casos;

// A conferencia de posologia existe nos DOIS lados: aqui, para a tela poder
// conferir um registro salvo sem chamada nenhuma, e no servidor, para nenhuma
// dose sair de la sem ter passado por ela. Duas implementacoes da mesma regra
// clinica divergem com o tempo -- estes dois testes sao o que segura isso.

describe("a tabela do servidor espelha o catalogo", () => {
  it("esta em dia com src/data/medications.js", () => {
    assert.deepEqual(gerada.medicamentos, medicationTable(),
      "o catalogo mudou e a tabela nao: rode node scripts/build_medication_table.mjs");
  });

  it("leva os campos que o servidor confere, e so eles", () => {
    gerada.medicamentos.forEach(item => assert.deepEqual(Object.keys(item), CAMPOS_DO_SERVIDOR));
  });

  it("nenhum farmaco entra sem faixa usual, que e o que decide a conferencia", () => {
    gerada.medicamentos.forEach(item => {
      assert.ok(item.generic, "farmaco sem nome generico");
      assert.ok(item.usualDose, `${item.generic} sem faixa usual`);
    });
  });

  it("cobre o catalogo inteiro", () => {
    assert.equal(gerada.medicamentos.length, medications.length);
  });
});

describe("os casos compartilhados com o servidor", () => {
  // Caso novo entra em testes/casos_de_dose.json, e nao aqui: la ele e lido
  // pelas duas baterias.
  casos.forEach(caso => {
    it(caso.nome, () => {
      const revisao = medicationLineReview(caso.linha);
      assert.equal(revisao.estado, caso.estado);
      assert.deepEqual(revisao.alertas.map(alerta => alerta.codigo).sort(), [...caso.codigos].sort());
    });
  });
});
