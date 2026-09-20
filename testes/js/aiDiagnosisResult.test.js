// Testes da traducao do que a IA devolve para o que o formulario guarda. O
// proprio modulo se anuncia testavel sem navegador, sem servidor e sem chave
// de API -- e o que esta coberto aqui e a regra clinica que ele carrega: quem
// concorre com quem, quem pode repetir, e o que a tela diz ao medico.
//
// Rodar a partir da raiz do projeto:
//     node --test 'testes/js/*.test.js'
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { doctorDiagnosisOptions } from "../../src/clinical/vocabulary.js";
import { normalizeText } from "../../src/clinical/textFormat.js";
import { diagnosticCriteriaByOption, diagnosticRangeByOption } from "../../src/views/decisions.js";
import {
  countLabel,
  diagnosisReviewFailure,
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
  const HIPOTESE_DO_MEDICO = doctorDiagnosisOptions[1];
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

describe("troca de codigo nao acontece calada", () => {
  // O servidor troca o codigo quando ele contradiz o nome da hipotese: 6A70.3
  // e "grave, SEM sintomas psicoticos", e a hipotese dizia "COM". A correcao e
  // ancorada em tabela, mas trocar um codigo diagnostico sem dizer seria pedir
  // que o medico confie sem poder conferir.
  const resultado = diagnosisSuggestionFromAi({
    result: { nosological_options: [{ name: "Transtorno depressivo maior, episódio atual grave com sintomas psicóticos", cid11: "6A70.4", dsm5tr: "F32.3" }] },
    codeWarnings: [
      { kind: "mismatch", text: "Transtorno depressivo maior: CID-11 6A70.3 contradiz a hipotese em psicotico; reancorado em 6A70.4." },
      { kind: "anchor", text: "detalhe que fica no log" }
    ]
  });

  it("o aviso diz qual codigo saiu e qual entrou", () => {
    assert.match(resultado.aiStatus, /6A70\.3/);
    assert.match(resultado.aiStatus, /reancorado em 6A70\.4/);
  });

  it("aviso de ancoragem comum continua no log, sem poluir a tela", () => {
    assert.doesNotMatch(resultado.aiStatus, /fica no log/);
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

  it("a contingencia nao produz analise psicopatologica, e limpa a que havia", () => {
    // O catalogo casa termo: nao le o registro e nao tem como apontar
    // evidencia. Analise sem evidencia e o que esta etapa recusa a produzir.
    const resultado = diagnosisSuggestionFromLocalCatalogue(
      { qphda: "Paciente deprimida, anedonia.", impacto: ["Grave"], analisePsicopatologica: "Humor: deprimido (anedonia)" },
      falha
    );
    assert.equal(resultado.analisePsicopatologica, "");
  });
});

describe("analise psicopatologica", () => {
  const analise = [
    { domain: "Humor", finding: "Deprimido, com anedonia severa.", evidence: "parou de sair, de cozinhar e de atender o telefone" },
    { domain: "Sono", finding: "Insônia terminal", evidence: "acorda às 3h e não reata o sono" },
    { domain: "Pensamento", finding: "Delírios niilistas e de ruína", evidence: "órgãos apodrecendo; família gasta dinheiro à toa" }
  ];

  it("cada achado sai com a evidencia do registro entre parenteses", () => {
    const resultado = diagnosisSuggestionFromAi({ result: { psychopathological_analysis: analise } });
    assert.deepEqual(linhas(resultado.analisePsicopatologica), [
      "Humor: Deprimido, com anedonia severa (parou de sair, de cozinhar e de atender o telefone)",
      "Sono: Insônia terminal (acorda às 3h e não reata o sono)",
      "Pensamento: Delírios niilistas e de ruína (órgãos apodrecendo; família gasta dinheiro à toa)"
    ]);
  });

  it("achado que a IA nao ancorou no registro nao entra", () => {
    // Sem evidencia e afirmacao, e o prontuario nao afirma o que nao foi
    // registrado. Descartar o item e melhor do que mostra-lo com cara de
    // ancorado -- e melhor do que derrubar a resposta inteira por causa dele.
    const resultado = diagnosisSuggestionFromAi({
      result: {
        psychopathological_analysis: [
          analise[0],
          { domain: "Cognição", finding: "Provável declínio cognitivo", evidence: "" },
          { domain: "", finding: "Achado sem domínio", evidence: "algo" },
          { domain: "Risco", finding: "", evidence: "sem achado" }
        ]
      }
    });
    assert.deepEqual(linhas(resultado.analisePsicopatologica).length, 1);
    assert.doesNotMatch(resultado.analisePsicopatologica, /declínio cognitivo/);
  });

  it("evidencia ja escrita dentro do achado nao sai duas vezes", () => {
    // Visto na tela em 28/08/2026, nos oito dominios do mesmo caso: a IA fecha
    // o achado com a evidencia entre parenteses, e o formato da linha poe a
    // evidencia entre parenteses de novo.
    const resultado = diagnosisSuggestionFromAi({
      result: { psychopathological_analysis: [{
        domain: "Humor",
        finding: "Tristeza persistente, desesperança (tristeza continua que nao cedeu com o tempo)",
        evidence: "tristeza continua que nao cedeu com o tempo"
      }] }
    });
    assert.equal(resultado.analisePsicopatologica,
      "Humor: Tristeza persistente, desesperança (tristeza continua que nao cedeu com o tempo)");
  });

  it("parentese que diz outra coisa e informacao, e fica", () => {
    const resultado = diagnosisSuggestionFromAi({
      result: { psychopathological_analysis: [{
        domain: "Sono",
        finding: "Insônia terminal (desde a morte do marido)",
        evidence: "acorda às 3h e não reata o sono"
      }] }
    });
    assert.match(resultado.analisePsicopatologica, /\(desde a morte do marido\) \(acorda às 3h/);
  });

  it("o mesmo dominio repetido nao sai duas vezes", () => {
    const resultado = diagnosisSuggestionFromAi({
      result: { psychopathological_analysis: [analise[0], analise[0], analise[1]] }
    });
    assert.equal(linhas(resultado.analisePsicopatologica).length, 2);
  });

  it("a tela diz quantos dominios vieram, e que cada um tem evidencia", () => {
    const resultado = diagnosisSuggestionFromAi({ result: { psychopathological_analysis: analise } });
    assert.match(resultado.aiStatus, /Análise psicopatológica: 3 domínios, cada um com a evidência do registro\./);
  });

  it("um dominio so fala no singular", () => {
    const resultado = diagnosisSuggestionFromAi({ result: { psychopathological_analysis: [analise[0]] } });
    assert.match(resultado.aiStatus, /1 domínio,/);
  });

  it("resposta sem analise nao inventa a secao nem o aviso", () => {
    const resultado = diagnosisSuggestionFromAi({ result: {} });
    assert.equal(resultado.analisePsicopatologica, "");
    assert.doesNotMatch(resultado.aiStatus, /Análise psicopatológica/);
  });

  it("a analise nao vem assinalada: nao ha o que assinalar num raciocinio", () => {
    const resultado = diagnosisSuggestionFromAi({ result: { psychopathological_analysis: analise } });
    assert.deepEqual(resultado.diagnosticoSelecionado, []);
  });
});

// O Refinar so libera depois que o medico assinala (31/08/2026). Se a revisao
// devolvesse a tela sem marcacao, ela apagaria exatamente a escolha que
// habilitou o botao -- e o medico teria de reassinalar tudo a cada refino.
describe("o refino nao apaga a escolha do medico", () => {
  const HIPOTESE = "Transtorno depressivo maior - CID-11: 6A70.4 - DSM-5-TR: F32.3";
  const resposta = nomes => ({
    nosological_options: nomes.map(nome => ({ name: nome, cid11: "6A70.4", dsm5tr: "F32.3" })),
    syndromic_options: [], etiological_options: [], specifier_options: [],
    comorbidity_options: [], aggravating_options: [], psychopathological_analysis: []
  });
  const refinar = (result, marcadas) => diagnosisSuggestionFromAi({
    result, target: { diagnosticoSelecionado: marcadas }, sources: [], mode: "rag", codeWarnings: [], revisao: true
  });

  it("a hipotese que sobrevive a revisao continua marcada", () => {
    const r = refinar(resposta(["Transtorno depressivo maior"]), [HIPOTESE]);
    assert.deepEqual(r.diagnosticoSelecionado, [HIPOTESE]);
    assert.match(r.aiStatus, /continua marcada/);
  });

  it("a hipotese que a revisao descartou sai da marcacao, e isso e dito", () => {
    const r = refinar(resposta(["Transtorno bipolar tipo I"]), [HIPOTESE]);
    assert.deepEqual(r.diagnosticoSelecionado, []);
    assert.match(r.aiStatus, /não foi mantida|nao foi mantida/);
  });

  it("gerar de novo, fora do refino, continua devolvendo a tela sem marcacao", () => {
    const r = diagnosisSuggestionFromAi({
      result: resposta(["Transtorno depressivo maior"]),
      target: { diagnosticoSelecionado: [HIPOTESE] }, sources: [], mode: "rag", codeWarnings: []
    });
    assert.deepEqual(r.diagnosticoSelecionado, []);
  });
});

// Os criterios entraram em 31/08/2026 porque a medicao dele mostrou que o
// esquema, e nao a recuperacao, era o gargalo: com nome e dois codigos como
// unicos campos, o livro nao tinha onde falar e os dois modos convergiam.
describe("criterios da hipotese nosologica", () => {
  const hipotese = {
    name: "Transtorno bipolar tipo I, episódio maníaco",
    cid11: "6A60.1",
    dsm5tr: "F31.2",
    criteria: [
      { criterion: "Critério A: humor elevado por pelo menos 1 semana", status: "preenchido", evidence: "há três semanas, energia de sobra" },
      { criterion: "Critério C: exclusão de causa por substância", status: "nao avaliavel", evidence: "falta toxicológico de urina" }
    ]
  };

  it("cada criterio viaja chaveado pela linha que rotula a hipotese", () => {
    const s = diagnosisSuggestionFromAi({ result: { nosological_options: [hipotese] } });
    const linhas = s.diagnosticoAiCriterios.split("\n");
    assert.equal(linhas.length, 2);
    assert.ok(linhas.every(linha => linha.startsWith(s.diagnosticoAiNosologico)));
    assert.ok(linhas[1].includes("nao avaliavel"));
  });

  it("a tela reencontra os criterios pela hipotese", () => {
    const s = diagnosisSuggestionFromAi({ result: { nosological_options: [hipotese] } });
    const mapa = diagnosticCriteriaByOption(s);
    const encontrados = mapa.get(normalizeText(s.diagnosticoAiNosologico));
    assert.equal(encontrados.length, 2);
    assert.equal(encontrados[0].status, "preenchido");
    assert.equal(encontrados[1].evidence, "falta toxicológico de urina");
  });

  // A hipotese que a deduplicacao derruba nao pode deixar criterio orfao na
  // tela: ele apareceria sob a hipotese errada ou sob nenhuma.
  it("hipotese descartada pela deduplicacao nao deixa criterio para tras", () => {
    const s = diagnosisSuggestionFromAi({
      result: {
        nosological_options: [hipotese],
        syndromic_options: [{ name: "Transtorno bipolar tipo I, episódio maníaco", cid11: "", dsm5tr: "" }]
      }
    });
    const mapa = diagnosticCriteriaByOption(s);
    const orfaos = [...mapa.keys()].filter(chave => chave !== normalizeText(s.diagnosticoAiNosologico));
    assert.deepEqual(orfaos, []);
  });

  it("hipotese sem criterio nao inventa linha", () => {
    const s = diagnosisSuggestionFromAi({ result: { nosological_options: [{ ...hipotese, criteria: [] }] } });
    assert.equal(s.diagnosticoAiCriterios, "");
    assert.equal(diagnosticCriteriaByOption(s).size, 0);
  });
});

describe("faixa de sustentacao das hipoteses (20/09/2026)", () => {
  const nosologica = (name, extra = {}) => ({ name, cid11: "6A70", dsm5tr: "F32.1", criteria: [], ...extra });

  it("vira linha propria por hipotese, fora do texto que vai para documento", () => {
    const r = diagnosisSuggestionFromAi({ result: { nosological_options: [nosologica("Transtorno depressivo maior", { support_min: 60, support_max: 75 })] } });
    assert.doesNotMatch(r.diagnosticoAiNosologico, /60|75|%/);
    assert.equal(diagnosticRangeByOption(r).get(normalizeText(linhas(r.diagnosticoAiNosologico)[0])).max, 75);
  });

  it("faixa invalida some e a hipotese continua", () => {
    for (const ruim of [{ support_min: 80, support_max: 60 }, { support_min: -1, support_max: 20 }, { support_min: 10, support_max: 120 }, { support_min: 55.5, support_max: 70 }, {}]) {
      const r = diagnosisSuggestionFromAi({ result: { nosological_options: [nosologica("Transtorno depressivo maior", ruim)] } });
      assert.equal(linhas(r.diagnosticoAiNosologico).length, 1);
      assert.equal(r.diagnosticoAiFaixas, "");
    }
  });

  it("nao obriga a soma a dar 100 nem ordena as faixas", () => {
    const r = diagnosisSuggestionFromAi({ result: { nosological_options: [
      nosologica("Transtorno depressivo maior", { support_min: 60, support_max: 80 }),
      nosologica("Transtorno de ansiedade generalizada", { support_min: 50, support_max: 70 })
    ] } });
    assert.equal(linhas(r.diagnosticoAiFaixas).length, 2);
  });
});

describe("Refinar que falha mantem a primeira passada", () => {
  const falha = diagnosisReviewFailure(new Error("rag_insufficient_evidence"));

  it("so o aviso muda: nada da primeira passada e trocado ou apagado", () => {
    assert.deepEqual(Object.keys(falha), ["aiStatus"]);
  });

  it("o aviso diz o motivo, que a fonte era o RAG e que a primeira passada ficou", () => {
    assert.match(falha.aiStatus, /rag_insufficient_evidence/);
    assert.match(falha.aiStatus, /RAG/);
    assert.match(falha.aiStatus, /primeira passada foi mantida/);
  });

  it("aplicado sobre o rascunho, analise, hipoteses, criterios e marcacao continuam", () => {
    const rascunho = {
      analisePsicopatologica: "Humor: deprimido (parou de sair)",
      diagnosticoAiNosologico: "Transtorno depressivo maior",
      diagnosticoAiCriterios: "x ::: y ::: preenchido ::: z",
      diagnosticoAiFaixas: "x ::: 60 ::: 80",
      diagnosticoSelecionado: ["Transtorno depressivo maior"],
      diagnosticoOrigem: "rag"
    };
    const depois = { ...rascunho, ...falha };
    for (const chave of Object.keys(rascunho)) assert.deepEqual(depois[chave], rascunho[chave]);
  });

  it("ja a primeira geracao que falha continua caindo no catalogo local", () => {
    const local = diagnosisSuggestionFromLocalCatalogue({ aiMode: "rag" }, new Error("fora do ar"));
    assert.equal(local.diagnosticoOrigem, "local");
  });
});

describe("o seletor de modo do diagnostico guarda a escolha dele", () => {
  it("a resposta que veio da web nao muda aiMode, mas a origem fica registrada", () => {
    const sugestao = diagnosisSuggestionFromAi({ result: {}, target: {}, sources: [], mode: "current" });
    assert.equal("aiMode" in sugestao, false);
    assert.equal(sugestao.diagnosticoOrigem, "nuvem");
  });

  it("resposta do acervo registra origem rag", () => {
    const sugestao = diagnosisSuggestionFromAi({ result: {}, target: {}, sources: [], mode: "rag" });
    assert.equal(sugestao.diagnosticoOrigem, "rag");
  });
});
