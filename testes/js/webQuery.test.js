import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildWebQuery, buildRagQuery } from "../../src/services/clinicalAiService.js";

// A consulta da web vai para um buscador de TERCEIROS. A do RAG vai para o
// acervo do proprio medico, na conta dele, e pode carregar a narrativa inteira.
// Na primeira versao as duas eram a mesma, e o prontuario -- inclusive a fala do
// paciente entre aspas -- foi parar num buscador.
describe("a consulta da web nao leva o paciente junto", () => {
  const wagner = {
    nome: "Wagner Portela Bittencourt",
    queixa: "Estou otimo. Quem quis vir foi minha familia.",
    hdaManual: "Trazido pelo irmao. Gastou cerca de R$ 40 mil no cartao do irmao.",
    cidade: "Belo Horizonte",
    ocupacao: "Corretor de imoveis",
    pensamentoConteudo: ["Delírio de grandeza"],
    linguagem: ["Logorreia", "Outro"],
    linguagemOutro: "interrompe o examinador e faz trocadilhos com as perguntas",
    memoria: ["Preservada"]
  };

  it("nao leva queixa, historia, cidade, ocupacao nem nome", () => {
    const consulta = buildWebQuery("diagnosis", wagner).toLowerCase();
    for (const vazamento of ["quem quis vir", "40 mil", "irmao", "wagner", "belo horizonte", "corretor"]) {
      assert.ok(!consulta.includes(vazamento), `vazou para a busca: ${vazamento}`);
    }
  });

  it("nao leva o texto livre do campo Outro do exame psiquico", () => {
    const consulta = buildWebQuery("diagnosis", wagner).toLowerCase();
    assert.ok(!consulta.includes("trocadilhos"));
    assert.ok(!consulta.includes("interrompe o examinador"));
  });

  it("leva o vocabulario de lista, que e palavra de livro", () => {
    const consulta = buildWebQuery("diagnosis", wagner).toLowerCase();
    assert.ok(consulta.includes("delírio de grandeza") || consulta.includes("delirio de grandeza"));
    assert.ok(consulta.includes("logorreia"));
  });

  it("achado normal nao entra: nao ha o que pesquisar em 'preservada'", () => {
    assert.ok(!buildWebQuery("diagnosis", wagner).toLowerCase().includes("preservada"));
  });

  // A do RAG continua podendo levar tudo: outro destino, outra regra.
  it("a consulta do RAG continua completa, porque o destino e outro", () => {
    assert.ok(buildRagQuery("diagnosis", wagner).includes("Quem quis vir"));
  });

  it("sem termo nenhum nao ha busca, e isso e a resposta certa", () => {
    assert.equal(buildWebQuery("diagnosis", {}), "");
    assert.equal(buildWebQuery("medication", {}), "");
  });

  it("a ficha do medicamento pesquisa o farmaco, e nao o caso", () => {
    const consulta = buildWebQuery("medication", { ...wagner, medicationGeneric: "Risperidona" });
    assert.ok(consulta.startsWith("Risperidona"));
    assert.ok(!consulta.toLowerCase().includes("wagner"));
  });
});
