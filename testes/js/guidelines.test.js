import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { aiModeSelector, treatmentAiMode } from "../../src/views/decisions.js";
import { buildRagQuery, patientQueryProfile, requestClinicalAi } from "../../src/services/clinicalAiService.js";
import { loadAiSourceCatalog } from "../../src/services/aiSourceCatalog.js";

before(async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ sources: [
    { id: "current", label: "IA Nuvem", kinds: ["diagnosis", "treatment", "return_plan", "medication", "symptomatic", "evolution"] },
    { id: "rag", label: "RAG com literatura", kinds: ["diagnosis", "treatment", "return_plan", "medication", "symptomatic", "evolution"] },
    { id: "guidelines", label: "Guidelines", kinds: ["treatment", "return_plan"] }
  ] }) });
  try { await loadAiSourceCatalog(); }
  finally { globalThis.fetch = original; }
});

// O terceiro modo de resposta: Guidelines. Nao e etapa nova, e valor novo do
// eixo que ja existia -- o mesmo Tratamento, o mesmo schema, outra prateleira.

describe("o radio so oferece Guidelines onde o servidor o aceita", () => {
  it("por padrao mostra os dois modos de sempre", () => {
    const html = aiModeSelector("rag", "pharmaAiMode", { kind: "medication" });
    assert.ok(!html.includes('value="guidelines"'),
      "a ficha do Medicamento nao responde por diretriz; oferecer o radio la vira 400");
    assert.ok(html.includes('value="current"') && html.includes('value="rag"'));
  });

  it("mostra os tres quando a etapa e de conduta", () => {
    const html = aiModeSelector("rag", "treatmentAiMode", { kind: "treatment" });
    assert.ok(html.includes('value="guidelines"'));
  });
});

// Com DOIS modos, "nao e rag" bastava para marcar a Nuvem. Com tres, essa conta
// marca duas caixas ao mesmo tempo -- e o radio passa a mostrar um modo que nao
// e o que vai ser usado na chamada.
describe("uma caixa marcada, e so uma", () => {
  const marcados = html => (html.match(/checked/g) || []).length;

  it("em guidelines nao marca tambem a IA Nuvem", () => {
    const html = aiModeSelector("guidelines", "treatmentAiMode", { kind: "treatment" });
    assert.equal(marcados(html), 1);
    assert.match(html, /value="guidelines" checked/);
  });

  for (const modo of ["current", "rag"]) {
    it(`marca exatamente um em ${modo}`, () => {
      assert.equal(marcados(aiModeSelector(modo, "treatmentAiMode", { kind: "treatment" })), 1);
    });
  }

  it("fonte salva fora da etapa exige nova escolha", () => {
    const html = aiModeSelector("guidelines", "pharmaAiMode", { kind: "medication" });
    assert.equal(marcados(html), 0);
    assert.match(html, /Fonte salva indisponível/);
  });
});

// O Tratamento dividia o `pharmaAiMode` com a pagina Medicamentos: um valor so,
// dois radios. Era surpresa; com o terceiro modo viraria erro, porque a ficha
// do farmaco passaria a pedir ao servidor um modo que aquela etapa recusa.
describe("o Tratamento tem campo proprio, sem perder o registro antigo", () => {
  it("prefere o campo novo", () => {
    assert.equal(treatmentAiMode({ treatmentAiMode: "guidelines", pharmaAiMode: "rag" }), "guidelines");
  });

  it("registro salvo antes da separacao reabre no modo em que foi gerado", () => {
    assert.equal(treatmentAiMode({ pharmaAiMode: "current" }), "current");
  });

  it("sem nada gravado, o padrao do programa e o RAG", () => {
    assert.equal(treatmentAiMode({}), "rag");
  });

  it("valor desconhecido nao vira IA Nuvem", () => {
    assert.equal(treatmentAiMode({ treatmentAiMode: "qualquer-coisa" }), "qualquer-coisa");
  });
});

// A faixa etaria so entra na consulta das DIRETRIZES. No acervo de livros quem
// faz esse trabalho e o ragPatientScopes, por cima da busca geral; aqui nao ha
// escopo, ha um arquivo proprio da faixa que so vence se for chamado.
describe("a consulta das diretrizes diz de quem se trata", () => {
  const crianca = { nascimento: "2017-03-04", sexo: "Feminino" };
  const caso = { diagnosticoMedicoOutro: "Episodio depressivo", diagnosticoSelecionado: ["Outro"], queixa: "tristeza" };

  it("sem paciente, a consulta e a mesma de sempre", () => {
    assert.equal(buildRagQuery("treatment", caso), buildRagQuery("treatment", caso, {}));
  });

  it("com paciente, leva faixa, idade e sexo", () => {
    const consulta = buildRagQuery("treatment", caso, { paciente: crianca }).toLowerCase();
    assert.ok(consulta.includes("anos"), "a idade precisa chegar a busca");
    assert.ok(consulta.includes("sexo feminino"));
  });

  // Posta na frente, a faixa desloca o peso do embedding e afasta a busca do
  // que se pergunta. O diagnostico continua liderando.
  it("o diagnostico continua abrindo a consulta", () => {
    const consulta = buildRagQuery("treatment", caso, { paciente: crianca });
    assert.ok(consulta.indexOf("Episodio depressivo") < consulta.indexOf("anos"));
  });

  it("o seguimento tambem leva a faixa", () => {
    const consulta = buildRagQuery("return_plan", caso, { paciente: crianca }).toLowerCase();
    assert.ok(consulta.includes("anos"));
  });

  it("paciente sem data de nascimento nao quebra a consulta", () => {
    const consulta = buildRagQuery("treatment", caso, { paciente: { sexo: "Masculino" } });
    assert.ok(consulta.includes("Episodio depressivo"));
    assert.ok(!consulta.includes("undefined") && !consulta.includes("null"));
  });

  it("paciente vazio nao acrescenta oracao nenhuma", () => {
    assert.equal(patientQueryProfile({}), "");
    assert.equal(buildRagQuery("treatment", caso, { paciente: {} }), buildRagQuery("treatment", caso));
  });
});

// O corpus de medicao. Nao chama a rede: confere que ele esta coerente antes de
// alguem gastar 23 chamadas reais para descobrir que um caso estava torto.
describe("o corpus de medicao das diretrizes se sustenta", () => {
  const { casos } = JSON.parse(readFileSync(new URL("../diretrizes_corpus.json", import.meta.url), "utf8"));

  it("todo caso tem o que a medicao le", () => {
    for (const caso of casos) {
      assert.ok(caso.id && caso.grupo && caso.diagnostico, `caso incompleto: ${caso.id}`);
      assert.ok(Array.isArray(caso.esperado), `gabarito ausente: ${caso.id}`);
      assert.ok(caso.sintomas, `sem achados clinicos, a consulta medida nao e a consulta real: ${caso.id}`);
    }
  });

  it("nenhum id repetido", () => {
    assert.equal(new Set(casos.map(c => c.id)).size, casos.length);
  });

  // Um par com um lado so nao mede nada: o que se compara e um diagnostico em
  // duas idades, e "a idade separou" exige os dois lados.
  it("todo par de faixa tem exatamente dois lados, de idades diferentes", () => {
    const pares = {};
    for (const caso of casos.filter(c => c.grupo === "faixa")) {
      assert.ok(caso.par, `caso de faixa sem par: ${caso.id}`);
      (pares[caso.par] ||= []).push(caso);
    }
    assert.ok(Object.keys(pares).length > 0);
    for (const [par, lados] of Object.entries(pares)) {
      assert.equal(lados.length, 2, `o par ${par} nao tem dois lados`);
      assert.notDeepEqual(lados[0].esperado, lados[1].esperado,
        `o par ${par} espera o mesmo arquivo dos dois lados -- nao mede a faixa`);
      const anos = lados.map(l => new Date(l.paciente.nascimento).getFullYear());
      assert.ok(Math.abs(anos[0] - anos[1]) > 5, `o par ${par} tem idades proximas demais`);
    }
  });

  // Aqui acertar e RECUSAR. Um gabarito nao vazio inverteria a leitura da
  // tabela: o grupo passaria a contar acerto onde deveria contar ruido.
  it("os casos fora do acervo nao esperam arquivo nenhum", () => {
    const fora = casos.filter(c => c.grupo === "fora");
    assert.ok(fora.length > 0);
    for (const caso of fora) assert.equal(caso.esperado.length, 0);
  });

  it("os casos de diferencial esperam mais de um arquivo", () => {
    const diferencial = casos.filter(c => c.grupo === "diferencial");
    assert.ok(diferencial.length > 0);
    for (const caso of diferencial) {
      assert.ok(caso.esperado.length >= 2, `${caso.id} nao exige dois arquivos, entao nao testa o filtro`);
    }
  });
});

// O modo tinha de CHEGAR ao servidor, e nao chegava. Enquanto eram dois modos,
// o cliente mandava `mode === "rag" ? "rag" : "current"` -- verdade com dois,
// mentira com tres: "guidelines" caia em "current" antes de sair do navegador,
// e escolher Guidelines dava IA Nuvem sem erro nenhum na tela.
describe("o modo escolhido chega ao servidor", () => {
  async function corpoEnviado(mode) {
    const original = globalThis.fetch;
    let corpo;
    globalThis.fetch = async (_url, options) => {
      corpo = JSON.parse(options.body);
      return { ok: true, json: async () => ({ result: null, text: "", sources: [] }) };
    };
    // O 8o argumento e `diagnosisSelection` (criterios do DSM-5-TR no Refinar do
    // Diagnostico); a entidade das diretrizes e o 9o.
    try { await requestClinicalAi("treatment", "p", mode, "q", "", "", [], [], "Episodio depressivo"); }
    catch { /* a validacao do payload nao interessa aqui: o corpo ja foi montado */ }
    finally { globalThis.fetch = original; }
    return corpo;
  }

  it("guidelines nao vira current no caminho", async () => {
    assert.equal((await corpoEnviado("guidelines")).mode, "guidelines");
  });

  for (const modo of ["rag", "current"]) {
    it(`${modo} continua chegando como ${modo}`, async () => {
      assert.equal((await corpoEnviado(modo)).mode, modo);
    });
  }

  it("modo desconhecido falha antes de enviar pedido", async () => {
    let chamadas = 0;
    const original = globalThis.fetch;
    globalThis.fetch = async () => { chamadas++; throw new Error("não deveria enviar"); };
    try {
      await assert.rejects(requestClinicalAi("treatment", "p", "inventado"), /Modo de IA inválido/);
      assert.equal(chamadas, 0);
    } finally { globalThis.fetch = original; }
  });

  it("Guidelines fora da etapa falha antes do POST", async () => {
    let chamadas = 0;
    const original = globalThis.fetch;
    globalThis.fetch = async () => { chamadas++; throw new Error("não deveria enviar"); };
    try {
      await assert.rejects(requestClinicalAi("medication", "p", "guidelines"), /Modo de IA inválido/);
      assert.equal(chamadas, 0);
    } finally { globalThis.fetch = original; }
  });

  // A entidade vai SEPARADA da consulta: a consulta carrega sintomas, idade e
  // sexo, e casar termo contra ela faria o quadro clinico escolher o documento
  // garantido. Quem escolhe e a hipotese que o medico fechou.
  it("a hipotese assinalada vai em campo proprio", async () => {
    const corpo = await corpoEnviado("guidelines");
    assert.equal(corpo.guidelineEntity, "Episodio depressivo");
    assert.notEqual(corpo.ragQuery, corpo.guidelineEntity);
  });
});
