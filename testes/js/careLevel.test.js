// Nivel de cuidado: onde o paciente vai ser tratado.
//
// Existe porque nao existia. Num caso de depressao psicotica com sindrome de
// Cotard, recusa alimentar, perda de 11 kg e ideacao suicida, o programa propos
// antidepressivo e psicoeducacao sem em nenhum momento dizer que aquilo era
// indicacao de leito -- nao havia onde escrever. O que estes testes fixam e o
// que separa este bloco de mais um campo de formulario: a escolha e exclusiva,
// a IA nao assinala por ninguem, e leito sem justificativa nao passa calado.
//
// Rodar a partir da raiz do projeto:
//     node --test 'testes/js/*.test.js'
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CARE_LEVELS_REQUIRING_JUSTIFICATION, careLevelNotes, careLevelOptions } from "../../src/data/careLevels.js";
import { careLevelView } from "../../src/views/decisions.js";
import { professionalTreatmentText } from "../../src/clinical/narrative.js";

describe("a lista e fechada e cada modalidade se explica", () => {
  it("sao as 5 modalidades combinadas, sem sobra nem falta", () => {
    assert.equal(careLevelOptions.length, 5);
    assert.equal(new Set(careLevelOptions).size, 5);
  });

  it("so as internacoes trazem nota, porque so nelas a diferenca e legal", () => {
    const comNota = careLevelOptions.filter(nivel => String(careLevelNotes[nivel] || "").trim());
    assert.deepEqual(comNota, careLevelOptions.filter(nivel => nivel.startsWith("Internação")));
  });

  it("as tres internacoes citam a lei que as define", () => {
    const internacoes = careLevelOptions.filter(nivel => nivel.startsWith("Internação"));
    assert.equal(internacoes.length, 3);
    for (const nivel of internacoes) {
      assert.match(careLevelNotes[nivel], /10\.216\/2001/, nivel);
    }
  });

  it("o que implica leito ou emergencia exige justificativa", () => {
    assert.equal(CARE_LEVELS_REQUIRING_JUSTIFICATION.size, 4);
    assert.ok(!CARE_LEVELS_REQUIRING_JUSTIFICATION.has("Ambulatorial"));
    assert.ok(CARE_LEVELS_REQUIRING_JUSTIFICATION.has("Internação involuntária"));
    assert.ok(CARE_LEVELS_REQUIRING_JUSTIFICATION.has("Encaminhamento imediato a emergência"));
  });
});

describe("a IA propoe, o medico assinala", () => {
  const proposta = { nivelCuidadoAi: "Internação involuntária", nivelCuidadoAiJustificativa: "risco atual de suicídio" };

  it("a modalidade sugerida aparece marcada como sugestao, e nao selecionada", () => {
    const html = careLevelView(proposta);
    assert.match(html, /care-suggested/);
    // Privar alguem de liberdade nao e decisao que se aceita por omissao.
    assert.doesNotMatch(html, /checked/);
  });

  it("a escolha e exclusiva: radio, e nao caixa de selecao", () => {
    const html = careLevelView(proposta);
    assert.equal((html.match(/type="radio"/g) || []).length, 5);
    assert.doesNotMatch(html, /type="checkbox"/);
  });

  it("a justificativa da literatura fica visivel ao lado da proposta", () => {
    assert.match(careLevelView(proposta), /risco atual de suicídio/);
  });

  it("sem geracao, a tela diz que a escolha continua sendo dele", () => {
    const html = careLevelView({});
    assert.doesNotMatch(html, /care-suggested/);
    assert.match(html, /A escolha é sempre sua/);
  });
});

describe("leito sem justificativa nao passa calado", () => {
  it("escolher internacao sem escrever por que dispara o aviso", () => {
    assert.match(careLevelView({ nivelCuidado: "Internação involuntária" }), /care-warning/);
  });

  it("com a justificativa escrita, o aviso some", () => {
    const html = careLevelView({ nivelCuidado: "Internação involuntária", nivelCuidadoJustificativa: "recusa alimentar com perda de 11 kg" });
    assert.doesNotMatch(html, /care-warning/);
  });

  it("ambulatorial nao exige justificativa: e o nivel que nao priva de nada", () => {
    assert.doesNotMatch(careLevelView({ nivelCuidado: "Ambulatorial" }), /care-warning/);
  });

  // Aviso, e nao bloqueio: um programa que se recusa a salvar no meio de uma
  // urgencia atrapalha em vez de ajudar. Quem decide e o medico.
  it("o aviso nao impede a escolha de aparecer marcada", () => {
    assert.match(careLevelView({ nivelCuidado: "Internação compulsória" }), /value="Internação compulsória" checked/);
  });
});

describe("o nivel chega ao prontuario", () => {
  it("abre a conduta, antes do medicamento", () => {
    const texto = professionalTreatmentText({
      nivelCuidado: "Internação involuntária",
      nivelCuidadoJustificativa: "por recusa alimentar e risco de suicídio",
      tratamentoMedicamentosSelecionados: ["Olanzapina 5 mg/dia"]
    });
    assert.match(texto, /^O nível de cuidado definido é internação involuntária, por recusa alimentar e risco de suicídio\./);
    // "olanzapina" em minuscula: lowerFirst emenda o item na frase.
    assert.ok(texto.indexOf("nível de cuidado") < texto.indexOf("olanzapina"));
  });

  it("sem nivel escolhido, a conduta nao inventa frase", () => {
    const texto = professionalTreatmentText({ tratamentoMedicamentosSelecionados: ["Sertralina 50 mg/dia"] });
    assert.doesNotMatch(texto, /nível de cuidado/);
  });
});
