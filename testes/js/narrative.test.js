// Testes da narrativa clinica -- o texto que vai para o prontuario e que outro
// medico vai ler. Aqui nao ha decisao diagnostica: ha redacao, e redacao
// errada num documento clinico e defeito como qualquer outro.
//
// Rodar a partir da raiz do projeto:
//     node --test 'testes/js/*.test.js'
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildEvolutionNarrative,
  conciseDiagnosticText,
  joinWithOutro,
  mentalStateFindings,
  normalizeEvolutionNarrative,
  outdatedEvolutionText,
  patientIdentificationText,
  psychopathologicalFindingsParagraph,
  professionalSelectedTreatmentItems,
  refinementAnswersText,
  requestedExamsText,
  returnEvolutionContainsIdentity,
  treatmentDiagnosisText
} from "../../src/clinical/narrative.js";

const MARIA = {
  nome: "Maria Silva",
  nascimento: "1984-03-10",
  sexo: "Feminino",
  estadoCivil: "Solteiro(a)",
  ocupacao: "Agricultora"
};

const abertura = texto => String(texto).split("\n")[0];

describe("abertura da evolucao", () => {
  it("identificacao e historia numa frase so, com verbo de relato", () => {
    const texto = buildEvolutionNarrative(
      { queixa: "Tristeza", hdaManual: "Ha 03 meses vem apresentando anedonia." },
      MARIA
    );
    assert.equal(abertura(texto), "Maria Silva, 42 anos, solteira, agricultora, relata que ha 03 meses vem apresentando anedonia. Em atividade.");
  });

  it("historia que ja tem verbo proprio nao ganha outro", () => {
    const texto = buildEvolutionNarrative(
      { qphda: "Tristeza persistente\nPaciente refere que ha 03 meses piorou." },
      MARIA
    );
    // "Paciente" sai: o sujeito ja foi dito, e e o nome dela.
    assert.match(abertura(texto), /agricultora, refere que ha 03 meses piorou\. Em atividade\.$/);
  });

  it("sem historia registrada, a queixa e que abre -- e nao as duas", () => {
    const texto = buildEvolutionNarrative({ queixa: "Insonia ha duas semanas" }, MARIA);
    assert.equal(abertura(texto), "Maria Silva, 42 anos, solteira, agricultora, com queixa de insonia ha duas semanas. Em atividade.");
  });

  it("registro vazio nao emenda o texto de campo nao preenchido na frase", () => {
    // "Maria Silva, 42 anos, com queixa de queixa principal nao informada" ja
    // chegou a sair assim; o mesmo cuidado que a historia tinha, a queixa nao.
    const texto = buildEvolutionNarrative({}, MARIA);
    assert.equal(abertura(texto), "Maria Silva, 42 anos, solteira, agricultora. Em atividade.");
    assert.doesNotMatch(texto, /não informad/i);
  });

  it("paciente sem nome nao vira frase quebrada", () => {
    const texto = buildEvolutionNarrative({ queixa: "Ansiedade" }, {});
    assert.match(abertura(texto), /^Nome não informado, com queixa de ansiedade\.$/);
  });
});

describe("concordancia com o sexo registrado", () => {
  it("afastamento do trabalho concorda no feminino", () => {
    const texto = buildEvolutionNarrative({ queixa: "Insonia" }, { ...MARIA, ocupacao: "Agricultora afastada" });
    assert.match(texto, /No momento, afastada do trabalho\./);
  });

  it("e no masculino", () => {
    const texto = buildEvolutionNarrative(
      { queixa: "Insonia" },
      { nome: "João Souza", sexo: "Masculino", ocupacao: "Pedreiro afastado" }
    );
    assert.match(texto, /No momento, afastado do trabalho\./);
  });

  it("quem trabalha nao aparece como afastado", () => {
    const texto = buildEvolutionNarrative({ queixa: "Insonia" }, MARIA);
    assert.match(texto, /Em atividade\./);
  });

  it("a virgula do afastamento nao fica orfa na identificacao", () => {
    // "Policial militar, afastado" virava "policial militar,, relata que...".
    const texto = buildEvolutionNarrative(
      { queixa: "Insonia" },
      { nome: "Adilson Freire", sexo: "Masculino", ocupacao: "Policial militar, afastado" }
    );
    assert.match(texto, /^Adilson Freire, policial militar, com queixa de insonia\./);
    assert.doesNotMatch(texto, /,,/);
  });

  it('"Solteiro(a)" vira solteira ou solteiro, e nunca "solteiroa"', () => {
    assert.match(patientIdentificationText(MARIA), /solteira/);
    assert.match(patientIdentificationText({ ...MARIA, sexo: "Masculino" }), /solteiro,/);
    // Sem sexo registrado a forma com parenteses fica como esta: nao ha o que
    // decidir, e inventar concordancia seria afirmar o que nao foi registrado.
    assert.match(patientIdentificationText({ ...MARIA, sexo: "" }), /solteiro\(a\)/);
  });
});

describe("nao afirmar o que o registro contradiz", () => {
  // "Em atividade" era dito para qualquer ocupacao preenchida -- e o prontuario
  // de um aposentado afirmava, com todas as letras, que ele estava trabalhando.
  const semTrabalho = ["Aposentada, ex-costureira", "Motorista de caminhao, desempregado", "Ajudante de obra, sem vinculo fixo", "Pensionista", "Do lar"];

  semTrabalho.forEach(ocupacao => {
    it(`"${ocupacao}" nao vira "Em atividade"`, () => {
      const texto = buildEvolutionNarrative({ queixa: "Insonia" }, { ...MARIA, ocupacao });
      assert.doesNotMatch(texto, /Em atividade/);
      // A ocupacao continua na identificacao: o que sai e so a afirmacao falsa.
      assert.match(texto, new RegExp(ocupacao.split(",")[0].toLowerCase()));
    });
  });

  it("ocupacao em branco nao produz frase nenhuma sobre trabalho", () => {
    const texto = buildEvolutionNarrative({ queixa: "Insonia" }, { ...MARIA, ocupacao: "" });
    assert.doesNotMatch(texto, /Em atividade|afastad/);
  });
});

describe("a hipotese viaja com o que muda a conduta", () => {
  const form = {
    diagnosticoSelecionado: ["Outro"],
    diagnosticoMedicoOutro: "Depressão maior",
    especificadorSelecionado: ["Com sintomas psicóticos"],
    comorbidadeSelecionada: ["Transtorno por uso de álcool"],
    agravanteSelecionado: ["Desemprego"]
  };

  it("especificador, comorbidade e agravante seguem colados para o tratamento", () => {
    assert.equal(treatmentDiagnosisText(form), [
      "Depressão maior",
      "Especificadores: Com sintomas psicóticos",
      "Comorbidades: Transtorno por uso de álcool",
      "Fatores agravantes: Desemprego"
    ].join("\n"));
  });

  it("no resumo, o agravante fica de fora: ele pesa na conduta, nao no diagnostico", () => {
    const texto = conciseDiagnosticText(form);
    assert.equal(texto, "Depressão maior (Com sintomas psicóticos); em comorbidade com Transtorno por uso de álcool");
    assert.doesNotMatch(texto, /Desemprego/);
  });
});

describe("o que o medico escreveu em Outro", () => {
  it("a palavra Outro nao vai para o prontuario, o texto dele vai", () => {
    assert.equal(joinWithOutro(["Tabaco", "Outro"], "Chimarrão"), "Tabaco, Chimarrão");
    assert.equal(joinWithOutro(["Outro"], "Chimarrão"), "Chimarrão");
    assert.equal(joinWithOutro(["Tabaco"], ""), "Tabaco");
  });

  it("vale tambem para os achados do exame psiquico", () => {
    assert.deepEqual(
      mentalStateFindings({ humor: ["Hipotimico", "Outro"], humorOutro: "irritavel" }),
      ["hipotimico", "irritavel"]
    );
  });
});

describe("exames solicitados", () => {
  it('"Exames laboratoriais" abre na lista de itens, sem repetir', () => {
    const texto = requestedExamsText({ examesSolicitados: ["Exames laboratoriais", "Hemograma"] });
    assert.match(texto, /Hemograma/);
    assert.match(texto, /TSH/);
    assert.equal(texto.split(", ").filter(item => item === "Hemograma").length, 1);
  });

  it("o que ele digitou entra junto", () => {
    const texto = requestedExamsText({ examesSolicitados: ["ECG"], examesSolicitadosOutro: "Polissonografia" });
    assert.equal(texto, "ECG, Polissonografia");
  });

  it("nada solicitado nao vira texto", () => {
    assert.equal(requestedExamsText({}), "");
  });
});

describe("tratamento em texto corrido", () => {
  it("a linha com barras vira frase, e nao tabela", () => {
    assert.equal(
      professionalSelectedTreatmentItems(["Sertralina | Dose inicial: 50 mg/dia | Dose final: 150 mg/dia"]),
      "Sertralina, Dose inicial: 50 mg/dia, Dose final: 150 mg/dia"
    );
  });

  it("aparece na evolucao como conduta selecionada", () => {
    const texto = buildEvolutionNarrative(
      { queixa: "Tristeza", tratamentoMedicamentosSelecionados: ["Sertralina | Dose inicial: 50 mg/dia"] },
      MARIA
    );
    assert.match(texto, /O tratamento medicamentoso selecionado inclui sertralina, Dose inicial: 50 mg\/dia\./);
  });
});

describe("limpeza do texto gerado", () => {
  it("marcacao de markdown nao entra no prontuario", () => {
    assert.equal(
      normalizeEvolutionNarrative("## Titulo\n**Negrito** texto  com   espaco .\n\n\n\nfim"),
      "texto com espaco.\n\nfim"
    );
  });

  it("reconhece a evolucao antiga, que era rotulada como auxiliada por IA", () => {
    assert.equal(outdatedEvolutionText("Evolucao medica auxiliada por IA: texto"), true);
    assert.equal(outdatedEvolutionText("Maria Silva, 42 anos, relata que..."), false);
  });

  it("sabe se a evolucao do retorno ja comeca pela identificacao", () => {
    assert.equal(returnEvolutionContainsIdentity("Maria Silva, 42 anos, solteira...", MARIA), true);
    assert.equal(returnEvolutionContainsIdentity("Paciente retornou para acompanhamento.", MARIA), false);
    assert.equal(returnEvolutionContainsIdentity("", MARIA), false);
  });
});

describe("respostas do refinamento", () => {
  const plano = {
    refinementPlan: {
      questions: [{ topic: "Sono", prompt: "Quantas horas dorme?" }, { topic: "Apetite", prompt: "Perdeu peso?" }],
      red_flags: [{ topic: "Ideação suicida" }]
    }
  };

  it("pergunta sem resposta nao entra: campo vazio e dado ausente, nunca negacao", () => {
    const texto = refinementAnswersText({ ...plano, refinementQuestion_0: "4 horas" });
    assert.equal(texto, "Sono - Quantas horas dorme?: 4 horas");
    assert.doesNotMatch(texto, /Apetite/);
  });

  it("a red flag classificada volta ao registro que o diagnostico le", () => {
    const texto = refinementAnswersText({ ...plano, refinementRedFlag_0: "Presente" });
    assert.match(texto, /^Red flag - Ideação suicida: Presente$/);
  });

  it("a observacao do medico entra por ultimo", () => {
    const texto = refinementAnswersText({ ...plano, refinementQuestion_0: "4 horas", refinementDoctorNotes: "Reavaliar em 15 dias" });
    assert.match(texto, /Observacao do medico: Reavaliar em 15 dias$/);
  });

  it("refinamento sem nenhuma resposta nao produz texto", () => {
    assert.equal(refinementAnswersText(plano), "");
  });
});

describe("achados da analise psicopatologica na historia clinica (20/09/2026)", () => {
  const base = {
    queixa: "Acha que o vigiam.",
    hdaManual: "Ha um ano desconfia dos vizinhos.",
    pensamentoConteudo: ["Delirio persecutorio"],
    analisePsicopatologicaAchados: "Delirio persecutorio\nAfrouxamento de nexos\nAlucinacao auditiva comentando os atos"
  };
  const confirmado = { ...base, diagnosticoSelecionado: ["Esquizofrenia - CID-11: 6A20 - DSM-5-TR: F20.9"] };

  it("entra em prosa, sem o nome do dominio", () => {
    const texto = buildEvolutionNarrative(confirmado, MARIA);
    assert.match(texto, /À análise psicopatológica, destacam-se .*afrouxamento de nexos/);
    assert.doesNotMatch(texto, /Pensamento \(conteúdo\):|Sensopercepção:/);
  });

  it("nao repete o que o exame psiquico ja disse", () => {
    const paragrafo = psychopathologicalFindingsParagraph(confirmado, "No exame psíquico, apresenta delírio persecutório.", "Esquizofrenia");
    assert.doesNotMatch(paragrafo, /persecut/i);
    assert.match(paragrafo, /afrouxamento de nexos/);
  });

  it("so depois de o medico assinalar hipotese", () => {
    assert.doesNotMatch(buildEvolutionNarrative(base, MARIA), /análise psicopatológica/);
  });

  it("a historia preliminar nao leva escala: e ferramenta a parte", () => {
    const comEscala = { ...confirmado, escalasAplicadas: ["phq9"], ...Object.fromEntries([2, 2, 2, 2, 2, 2, 2, 2, 2].map((valor, i) => [`escala_phq9_${i}`, String(valor)])) };
    assert.match(buildEvolutionNarrative(comEscala, MARIA), /Escalas aplicadas/);
    assert.doesNotMatch(buildEvolutionNarrative(comEscala, MARIA, null, false, { preliminar: true }), /Escalas aplicadas/);
  });

  it("a historia preliminar nao leva hipotese, tratamento nem a analise", () => {
    const texto = buildEvolutionNarrative({ ...confirmado, tratamentoMedicamentosSelecionados: ["Risperidona 2 mg"] }, MARIA, null, false, { preliminar: true });
    assert.doesNotMatch(texto, /Esquizofrenia|Risperidona|análise psicopatológica/);
  });
});
