// Testes da traducao do que a IA devolve para o que o formulario guarda. O
// proprio modulo se anuncia testavel sem navegador, sem servidor e sem chave
// de API -- e o que esta coberto aqui e a regra clinica que ele carrega: quem
// concorre com quem, quem pode repetir, e o que a tela diz ao medico.
//
// Rodar a partir da raiz do projeto:
//     node --test 'testes/js/*.test.js'
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  countLabel,
  diagnosisSuggestionFromAi,
  diagnosisSuggestionFromLocalCatalogue
} from "../../src/clinical/aiDiagnosisResult.js";

const linhas = texto => String(texto || "").split("\n").filter(Boolean);

describe("hipotese repetida entre categorias", () => {
  const resultado = diagnosisSuggestionFromAi({
    result: {
      nosological_options: [{ name: "Transtorno de ansiedade generalizada", cid11: "6B00", dsm5tr: "F41.1" }],
      syndromic_options: [{ name: "Transtorno de ansiedade generalizada" }, { name: "Síndrome Ansiosa" }]
    }
  });

  it("fica com a nosologica, que e a afirmacao mais especifica", () => {
    assert.deepEqual(linhas(resultado.diagnosticoAiNosologico), [
      "Transtorno de ansiedade generalizada - CID-11: 6B00 - DSM-5-TR: F41.1"
    ]);
    assert.deepEqual(linhas(resultado.diagnosticoAiSindromico), ["Síndrome Ansiosa"]);
  });

  it("nao escolhe em silencio: o aviso diz o que saiu e onde ficou", () => {
    assert.match(resultado.aiStatus, /Transtorno de ansiedade generalizada \(mantida em Nosológico\)/);
  });

  it("compara so a entidade, e nao a linha com os codigos", () => {
    // A sindromica sai sem codigo por construcao; comparando a linha inteira
    // ela nunca colidiria com a nosologica, que sai com os dois.
    assert.equal(linhas(resultado.diagnosticoAiSindromico).length, 1);
  });
});

describe("o que concorre e o que qualifica", () => {
  const resultado = diagnosisSuggestionFromAi({
    result: {
      nosological_options: [{ name: "Depressão Maior", cid11: "6A70" }],
      specifier_options: [{ name: "Depressão Maior", applies_to: "com sintomas psicóticos" }],
      comorbidity_options: [{ name: "Depressão Maior" }, { name: "Transtorno de ansiedade generalizada" }],
      aggravating_options: [{ name: "Desemprego", effect: "piora a adesão" }]
    }
  });

  it("comorbidade nao pode ser a propria hipotese principal", () => {
    assert.deepEqual(linhas(resultado.diagnosticoAiComorbidades), ["Transtorno de ansiedade generalizada"]);
  });

  it("especificador qualifica a hipotese, entao repetir o nome dela e legitimo", () => {
    assert.deepEqual(linhas(resultado.diagnosticoAiEspecificadores), ["Depressão Maior — com sintomas psicóticos"]);
  });

  it("agravante e circunstancia do caso, e tambem fica fora da disputa", () => {
    assert.deepEqual(linhas(resultado.diagnosticoAiAgravantes), ["Desemprego — piora a adesão"]);
  });
});

describe("quem assinala e o medico", () => {
  const HIPOTESE_DO_MEDICO = "Sintomas reativos/adaptativos - sofrimento como reação a um problema específico, como luto, término ou estresse profissional.";
  const resultado = diagnosisSuggestionFromAi({
    result: { nosological_options: [{ name: "Depressão Maior", cid11: "6A70" }] },
    target: { diagnosticoSelecionado: [HIPOTESE_DO_MEDICO] }
  });

  it("nada do que a IA propos vem marcado", () => {
    assert.deepEqual(resultado.especificadorSelecionado, []);
    assert.deepEqual(resultado.comorbidadeSelecionada, []);
    assert.deepEqual(resultado.agravanteSelecionado, []);
    assert.ok(!resultado.diagnosticoSelecionado.includes("Depressão Maior - CID-11: 6A70"));
  });

  it("a hipotese que ele ja tinha assinalado continua marcada", () => {
    assert.deepEqual(resultado.diagnosticoSelecionado, [HIPOTESE_DO_MEDICO]);
    assert.match(resultado.aiStatus, /As hipóteses do médico foram mantidas\./);
  });
});

describe("nao completa as vagas que sobram", () => {
  it("duas propostas viram duas linhas, e nao tres", () => {
    const resultado = diagnosisSuggestionFromAi({
      result: { syndromic_options: [{ name: "Síndrome Ansiosa" }, { name: "Síndrome Depressiva" }] }
    });
    assert.equal(linhas(resultado.diagnosticoAiSindromico).length, 2);
    assert.match(resultado.aiStatus, /0 nosológicas, 2 sindrômicas e 0 etiológicas/);
  });

  it("resposta vazia nao inventa hipotese", () => {
    const resultado = diagnosisSuggestionFromAi({ result: {} });
    assert.equal(resultado.diagnosticoAiSindromico, "");
    assert.equal(resultado.diagnosticoAiNosologico, "");
    assert.equal(resultado.diagnosticoAiEtiologico, "");
  });
});

describe("aviso de renomeacao", () => {
  it("renomear muda o que ele le na tela, entao e dito", () => {
    const resultado = diagnosisSuggestionFromAi({
      result: { nosological_options: [{ name: "Transtorno depressivo recorrente", cid11: "6A71" }] },
      codeWarnings: [
        { kind: "rename", text: "\"Depressão Maior\" foi renomeada para \"Transtorno depressivo recorrente\"." },
        { kind: "incomplete", text: "F33.- precisa ser especificado." }
      ]
    });
    assert.match(resultado.aiStatus, /foi renomeada para/);
    // Codigo nao aparece nesta etapa: esse aviso fica no log.
    assert.doesNotMatch(resultado.aiStatus, /F33\.-/);
  });
});

describe("contagem no texto da tela", () => {
  it("singular e plural", () => {
    assert.equal(countLabel(1, "nosológica"), "1 nosológica");
    assert.equal(countLabel(2, "nosológica"), "2 nosológicas");
    assert.equal(countLabel(0, "nosológica"), "0 nosológicas");
    assert.equal(countLabel(1, "especificador", "especificadores"), "1 especificador");
    assert.equal(countLabel(3, "especificador", "especificadores"), "3 especificadores");
  });
});

describe("contingencia do catalogo local", () => {
  const falha = { message: "tempo esgotado" };

  it("diz que veio do catalogo, e que e contingencia", () => {
    const resultado = diagnosisSuggestionFromLocalCatalogue(
      { qphda: "Paciente deprimida, anedonia, hipotimia.", impacto: ["Grave"], aiMode: "rag" },
      falha
    );
    assert.ok(resultado.diagnosticoAiNosologico);
    assert.match(resultado.aiStatus, /RAG indisponível \(tempo esgotado\)/);
    assert.match(resultado.aiStatus, /catálogo local/);
    assert.match(resultado.aiStatus, /contingência, não substituto/);
  });

  it("sem correspondencia, diz que nao propos nada -- e nao fica em silencio", () => {
    const resultado = diagnosisSuggestionFromLocalCatalogue({ qphda: "" }, falha);
    assert.equal(resultado.diagnosticoAiNosologico, "");
    assert.match(resultado.aiStatus, /IA indisponível/);
    assert.match(resultado.aiStatus, /nenhuma hipótese foi proposta/);
  });

  it("a contingencia nao traz fonte de RAG junto", () => {
    const resultado = diagnosisSuggestionFromLocalCatalogue({ qphda: "Paciente deprimida." }, falha);
    assert.deepEqual(resultado.ragSourcesDiagnostico, []);
  });
});
