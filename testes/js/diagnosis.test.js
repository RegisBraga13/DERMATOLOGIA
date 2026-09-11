// Testes do motor diagnostico local -- o catalogo que responde quando a IA/RAG
// nao responde. As regras aqui foram revisadas pelo medico, e cada uma destas
// asserções corresponde a um defeito que ja chegou na tela.
//
// Rodar a partir da raiz do projeto:
//     node --test testes/js
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { doctorDiagnosisOptions } from "../../src/clinical/vocabulary.js";
import {
  buildDiagnosticSuggestion,
  doctorSelectedOptions,
  formatDiagnosticOption,
  normalizeDiagnosticOptions,
  parseTreatmentResponse,
  selectedDiagnosisText
} from "../../src/clinical/diagnosis.js";

const nomes = texto => String(texto || "").split("\n").filter(Boolean).map(linha => linha.split(" - ")[0]);

// Sem prejuizo funcional nem curso registrados, so o NOME da entidade libera a
// camada nosologica -- e o nome casava por pedaco de palavra ate 11/09/2026.
describe("o nome da entidade casa palavra inteira", () => {
  const TAG = "Transtorno de Ansiedade Generalizada";

  it("'estagio' nao nomeia TAG", () => {
    const resultado = buildDiagnosticSuggestion({ qphda: "Ansiedade desde o inicio do estagio." });
    assert.ok(!nomes(resultado.diagnosticoAiNosologico).includes(TAG));
  });

  it("'tagarela' tambem nao", () => {
    const resultado = buildDiagnosticSuggestion({ qphda: "Ansiedade. Paciente tagarela na entrevista." });
    assert.ok(!nomes(resultado.diagnosticoAiNosologico).includes(TAG));
  });

  it("a sigla TAG escrita pelo medico nomeia", () => {
    const resultado = buildDiagnosticSuggestion({ qphda: "Ansiedade. Diagnostico previo de TAG." });
    assert.ok(nomes(resultado.diagnosticoAiNosologico).includes(TAG));
  });

  it("o plural continua nomeando", () => {
    const resultado = buildDiagnosticSuggestion({ qphda: "Historia de psicoses, com alucinacao." });
    assert.ok(nomes(resultado.diagnosticoAiNosologico).includes("Transtorno Psicótico Primário ou Secundário"));
  });
});

// "dependencia de" trocado por vicio e adicao, a pedido dele em 11/09/2026.
describe("nome do transtorno por uso de substancias", () => {
  const USO = "Transtorno por Uso de Substâncias";
  const propoe = qphda => nomes(buildDiagnosticSuggestion({ qphda }).diagnosticoAiNosologico).includes(USO);

  it("'dependencia de cuidados' nao nomeia mais", () => {
    assert.equal(propoe("Uso de alcool nos fins de semana. Dependência de cuidados da filha."), false);
  });

  it("vicio nomeia", () => {
    assert.equal(propoe("Vício em cocaína há dois anos."), true);
  });

  it("adicao nomeia", () => {
    assert.equal(propoe("Adição à cocaína desde a adolescência."), true);
  });

  it("uso abusivo nomeia, com de, do ou da", () => {
    assert.equal(propoe("Uso abusivo de álcool nos fins de semana."), true);
    assert.equal(propoe("Uso abusivo do crack há um ano."), true);
  });

  it("uso abusivo negado nao nomeia", () => {
    assert.equal(propoe("Humor deprimido. Nega uso abusivo de álcool."), false);
  });

  it("adicao no sentido de acrescimo nao nomeia", () => {
    assert.equal(propoe("Uso social de alcool. Adição de lítio ao tratamento."), false);
    assert.equal(propoe("Uso social de alcool. Em adição ao antidepressivo, psicoterapia."), false);
  });
});

describe("negacao da anamnese", () => {
  it("nao propoe Induzido por Substancia para quem nega uso", () => {
    const resultado = buildDiagnosticSuggestion({
      qphda: "Paciente deprimida, com anedonia e insonia. Nega uso de substancias.",
      impacto: ["Moderado"]
    });
    assert.equal(resultado.diagnosticoAiEtiologico, "");
  });

  it("continua propondo quando o uso e afirmado", () => {
    const resultado = buildDiagnosticSuggestion({
      qphda: "Paciente deprimida, com anedonia. Refere uso diario de alcool.",
      impacto: ["Moderado"]
    });
    assert.ok(nomes(resultado.diagnosticoAiEtiologico).includes("Induzido por Substância"));
  });

  it("a negacao apaga so a propria oracao, nao o resto do periodo", () => {
    const resultado = buildDiagnosticSuggestion({
      qphda: "Nega uso de substancias; apresenta alucinacoes auditivas e delirio persecutorio.",
      impacto: ["Grave"]
    });
    assert.equal(resultado.diagnosticoAiEtiologico, "");
    assert.ok(nomes(resultado.diagnosticoAiSindromico).includes("Síndrome Psicótica"));
  });
});

describe("sindrome nao vira transtorno sozinha", () => {
  const achadoDepressivo = "Paciente deprimida, com anedonia, hipotimia e insonia.";

  it("sintoma sem marca de transtorno fica so na camada sindromica", () => {
    const resultado = buildDiagnosticSuggestion({ qphda: achadoDepressivo });
    assert.ok(nomes(resultado.diagnosticoAiSindromico).includes("Síndrome Depressiva"));
    assert.equal(resultado.diagnosticoAiNosologico, "");
  });

  it("prejuizo funcional registrado abre a camada nosologica", () => {
    const resultado = buildDiagnosticSuggestion({ qphda: achadoDepressivo, impacto: ["Moderado"] });
    assert.ok(nomes(resultado.diagnosticoAiNosologico).includes("Depressão Maior"));
  });

  it('"Sem impacto" e negacao do prejuizo, e nao conta como marca', () => {
    const resultado = buildDiagnosticSuggestion({ qphda: achadoDepressivo, impacto: ["Sem impacto"] });
    assert.equal(resultado.diagnosticoAiNosologico, "");
  });

  it("curso definido tambem serve de marca", () => {
    const resultado = buildDiagnosticSuggestion({ qphda: achadoDepressivo, curso: ["Episodico"] });
    assert.ok(nomes(resultado.diagnosticoAiNosologico).includes("Depressão Maior"));
  });

  it("a entidade nomeada pelo medico dispensa a marca", () => {
    const resultado = buildDiagnosticSuggestion({
      qphda: "Historia compativel com transtorno depressivo, com anedonia e hipotimia."
    });
    assert.ok(nomes(resultado.diagnosticoAiNosologico).includes("Depressão Maior"));
  });
});

describe("hipoteses sem correspondencia", () => {
  it("registro vazio nao propoe nada", () => {
    const resultado = buildDiagnosticSuggestion({});
    assert.equal(resultado.diagnosticoAiSindromico, "");
    assert.equal(resultado.diagnosticoAiNosologico, "");
    assert.equal(resultado.diagnosticoAiEtiologico, "");
  });

  it("especificador, comorbidade e agravante saem vazios: o catalogo local nao os propoe", () => {
    const resultado = buildDiagnosticSuggestion({
      qphda: "Paciente deprimida, anedonia.",
      impacto: ["Grave"],
      diagnosticoAiEspecificadores: "Grave, com sintomas psicoticos",
      diagnosticoAiComorbidades: "TAG",
      diagnosticoAiAgravantes: "Desemprego"
    });
    assert.equal(resultado.diagnosticoAiEspecificadores, "");
    assert.equal(resultado.diagnosticoAiComorbidades, "");
    assert.equal(resultado.diagnosticoAiAgravantes, "");
  });
});

describe("hipotese do medico", () => {
  const ATUAL = doctorDiagnosisOptions[0];
  const SEM_CODIGO = "Ausência de psicopatologia de relevância clínica - a mente está funcionando dentro do esperado para os desafios atuais.";

  it("prontuario salvo sem acento continua casando com o rotulo atual", () => {
    const semAcento = "Ausencia de psicopatologia de relevancia clinica - a mente esta funcionando dentro do esperado para os desafios atuais.";
    assert.deepEqual(doctorSelectedOptions({ diagnosticoSelecionado: [semAcento] }), [ATUAL]);
  });

  it("prontuario salvo antes dos codigos continua casando com o rotulo atual", () => {
    assert.ok(ATUAL.includes("CID-10: Z03.2"));
    assert.deepEqual(doctorSelectedOptions({ diagnosticoSelecionado: [SEM_CODIGO] }), [ATUAL]);
  });

  // Duas das quatro levam codigo; o exame psiquiatrico geral ficou sem, por
  // decisao dele -- e ato administrativo, e nao achado clinico.
  it("as hipoteses clinicas do medico levam CID-10 e DSM-5-TR", () => {
    const comCodigo = doctorDiagnosisOptions.filter(option => /CID-10/.test(option));
    assert.equal(comCodigo.length, 2);
    comCodigo.forEach(option => assert.match(option, /DSM-5-TR: /, option));
    assert.equal(doctorDiagnosisOptions.length, 4);
    assert.ok(!doctorDiagnosisOptions.some(option => option.startsWith("Z00.4")));
    assert.ok(!doctorDiagnosisOptions.some(option => option.startsWith("Z03.2")));
  });

  // O Z00.4 apenas perdeu os codigos: e a mesma opcao, e continua marcada.
  it("prontuario com o rotulo antigo do exame geral continua marcado", () => {
    const z004 = "Z00.4 (CID-10) - Exame psiquiátrico geral, incluindo exames admissionais sem psicopatologia identificada. - DSM-5-TR: Z02.89 (Exame administrativo)";
    assert.deepEqual(doctorSelectedOptions({ diagnosticoSelecionado: [z004] }), [doctorDiagnosisOptions[2]]);
  });

  // A Z03.2 foi excluida e desaparece: por decisao dele, nao vira outra opcao.
  it("a Z03.2 excluida nao reaparece como outra hipotese", () => {
    const z032 = "Z03.2 (CID-10) - Observação por suspeita de transtornos mentais e de comportamento, quando a suspeita foi descartada. - DSM-5-TR: Z03.89";
    assert.deepEqual(doctorSelectedOptions({ diagnosticoSelecionado: [z032] }), []);
  });

  it("a escolha do medico sobrevive a gerar o diagnostico de novo", () => {
    const resultado = buildDiagnosticSuggestion({ diagnosticoSelecionado: [ATUAL] });
    assert.deepEqual(resultado.diagnosticoSelecionado, [ATUAL]);
  });

  it("texto que nao esta no catalogo e descartado", () => {
    assert.deepEqual(doctorSelectedOptions({ diagnosticoSelecionado: ["Inventado"] }), []);
  });

  it('"Outro" vira o que ele escreveu', () => {
    const texto = selectedDiagnosisText({
      diagnosticoSelecionado: ["Outro"],
      diagnosticoMedicoOutro: "Transtorno de ajustamento com humor deprimido"
    });
    assert.equal(texto, "Transtorno de ajustamento com humor deprimido");
  });

  it('"Outro" sem texto escrito nao deixa a palavra no prontuario', () => {
    assert.equal(selectedDiagnosisText({ diagnosticoSelecionado: ["Outro"] }), "");
  });
});

describe("linha da hipotese", () => {
  it("N/A e ausencia de codigo, e nao um codigo", () => {
    assert.equal(formatDiagnosticOption({ name: "Síndrome Ansiosa", cid11: "N/A", dsm5tr: "N/A" }), "Síndrome Ansiosa");
  });

  it("codigo presente entra rotulado", () => {
    assert.equal(
      formatDiagnosticOption({ name: "Depressão Maior", cid11: "6A70", dsm5tr: "F32.9" }),
      "Depressão Maior - CID-11: 6A70 - DSM-5-TR: F32.9"
    );
  });

  it("so o codigo que existe aparece", () => {
    assert.equal(formatDiagnosticOption({ name: "Insonia", cid11: "7A00", dsm5tr: "" }), "Insonia - CID-11: 7A00");
  });
});

describe("opcoes devolvidas pela IA", () => {
  it("tira marcador de lista e corta no limite", () => {
    const linhas = normalizeDiagnosticOptions("- Uma\n2. Duas\n* Tres\nQuatro", 3);
    assert.deepEqual(linhas, ["Uma", "Duas", "Tres"]);
  });

  it("descarta os cabecalhos de secao do prompt", () => {
    const linhas = normalizeDiagnosticOptions("Hipotese principal:\nDepressão Maior\nJustificativa: humor\nDados ausentes: sono", 5);
    assert.deepEqual(linhas, ["Depressão Maior"]);
  });
});

describe("resposta do tratamento", () => {
  const resposta = [
    "TRATAMENTO MEDICAMENTOSO:",
    "Sertralina | Dose inicial: 50 mg/dia | Progressão: aumentar 50 mg a cada 7 dias | Dose final: 150 mg/dia",
    "Escitalopram | Dose inicial: 10 mg/dia | Progressão: semanal | Dose final: 20 mg/dia",
    "OUTRAS ABORDAGENS NÃO FARMACOLÓGICAS:",
    "Terapia cognitivo-comportamental | 1 sessao por semana"
  ].join("\n");

  it("separa as duas secoes e desmonta a linha em campos", () => {
    const { medicationOptions, approachOptions } = parseTreatmentResponse(resposta);
    assert.equal(medicationOptions.length, 2);
    assert.deepEqual(medicationOptions[0], {
      medication: "Sertralina",
      initial_dose: "50 mg/dia",
      progression: "aumentar 50 mg a cada 7 dias",
      target_dose: "150 mg/dia"
    });
    assert.deepEqual(approachOptions, [{ approach: "Terapia cognitivo-comportamental", details: "1 sessao por semana" }]);
  });

  it("a abordagem nao vaza para dentro da lista de medicamentos", () => {
    const { medicationOptions } = parseTreatmentResponse(resposta);
    assert.ok(!medicationOptions.some(opcao => opcao.medication.includes("Terapia")));
  });

  it("texto fora do formato nao vira medicamento", () => {
    assert.deepEqual(parseTreatmentResponse("Não foi possível gerar o tratamento."),
      { careLevel: null, medicationOptions: [], approachOptions: [] });
  });

  it("le o nivel de cuidado, que vem antes das duas listas", () => {
    const parsed = parseTreatmentResponse([
      "NIVEL DE CUIDADO:",
      "Internação involuntária | recusa alimentar com perda de 11 kg e ideação suicida",
      "",
      "TRATAMENTO MEDICAMENTOSO:",
      "Olanzapina | Dose inicial: 5 mg | Progressao: semanal | Dose final: 15 mg"
    ].join("\n"));
    assert.deepEqual(parsed.careLevel,
      { level: "Internação involuntária", justification: "recusa alimentar com perda de 11 kg e ideação suicida" });
    assert.equal(parsed.medicationOptions.length, 1);
  });

  it("nivel sem justificativa nao entra: indicar leito sem dizer por que fica fora do prontuario", () => {
    const parsed = parseTreatmentResponse("NIVEL DE CUIDADO:\nInternação voluntária\n\nTRATAMENTO MEDICAMENTOSO:\n");
    assert.equal(parsed.careLevel, null);
  });
});
