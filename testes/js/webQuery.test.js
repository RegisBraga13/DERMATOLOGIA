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

// A Evolucao entrou nas duas buscas em 31/08/2026. Ate ali era a unica etapa
// clinica sem livro nenhum, e a chamada caia no modo Nuvem por omissao, sem
// consulta montada -- entao nem web havia. Ganhou fonte; o cerco tem de valer
// para ela igual.
describe("a evolucao pergunta pelo seguimento, nao pelo paciente", () => {
  const retorno = {
    nome: "Wagner Portela Bittencourt",
    queixa: "Estou otimo. Quem quis vir foi minha familia.",
    cidade: "Belo Horizonte",
    diagnosticoSelecionado: ["Transtorno bipolar tipo I, episodio maniaco com sintomas psicoticos"],
    tratamentoMedicamentosSelecionados: ["Risperidona - 2 mg/dia, ajustar conforme resposta"],
    evolucaoClinicaRetorno: ["Melhora clínica"],
    efeitosOutro: "diz que a boca seca atrapalha as visitas que faz aos clientes"
  };

  it("nao leva identidade nem texto livre para o buscador", () => {
    const consulta = buildWebQuery("evolution", retorno).toLowerCase();
    for (const vazamento of ["wagner", "belo horizonte", "quem quis vir", "clientes", "boca seca"]) {
      assert.ok(!consulta.includes(vazamento), `vazou para a busca: ${vazamento}`);
    }
  });

  it("leva o par que define a regua: diagnostico e farmaco em uso", () => {
    const consulta = buildWebQuery("evolution", retorno).toLowerCase();
    assert.ok(consulta.includes("bipolar"));
    assert.ok(consulta.includes("risperidona"));
    // A dose e o resto da linha do tratamento ficam de fora: o que se pergunta
    // ao buscador e sobre o farmaco, e nao sobre a prescricao deste caso.
    assert.ok(!consulta.includes("2 mg/dia"));
  });

  it("sem diagnostico e sem farmaco nao ha o que perguntar", () => {
    assert.equal(buildWebQuery("evolution", { queixa: "retorno de rotina" }), "");
  });

  it("so com farmaco ainda pergunta, porque o farmaco tem regua propria", () => {
    const consulta = buildWebQuery("evolution", { tratamentoMedicamentosSelecionados: ["Litio - 900 mg/dia"] });
    assert.ok(consulta.toLowerCase().includes("litio"));
  });

  it("a consulta do RAG pergunta por prazo, remissao e troca", () => {
    const consulta = buildRagQuery("evolution", retorno).toLowerCase();
    assert.ok(consulta.includes("risperidona"));
    assert.ok(consulta.includes("remissao"));
    assert.ok(consulta.includes("troca de farmaco"));
  });
});

// A ficha do medicamento pergunta por um NOME PROPRIO, e a consulta tem de ser
// dominada por ele. Medido em 31/08/2026: com a consulta descritiva antiga,
// "Clozapina" recuperava 8 trechos e NENHUM citava clozapina -- o livro tem o
// capitulo dela. So o nome levou para 8 de 8.
describe("a consulta do medicamento e o nome, e nada mais", () => {
  const caso = {
    medicationGeneric: "Clozapina",
    diagnosticoSelecionado: ["Esquizofrenia refrataria"],
    queixa: "vozes que nao pararam com dois antipsicoticos",
    pensamentoConteudo: ["Delírio persecutório"]
  };

  it("nao carrega prosa descritiva, que afoga o nome no embedding", () => {
    const consulta = buildRagQuery("medication", caso);
    assert.equal(consulta, "Clozapina");
  });

  it("nao carrega o contexto clinico do caso junto", () => {
    const consulta = buildRagQuery("medication", caso).toLowerCase();
    assert.ok(!consulta.includes("esquizofrenia"));
    assert.ok(!consulta.includes("vozes"));
    assert.ok(!consulta.includes("persecut"));
  });

  it("sem farmaco digitado a consulta e vazia", () => {
    assert.equal(buildRagQuery("medication", {}), "");
  });
});
