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
import { careLevelView, returnPlanModule } from "../../src/views/decisions.js";
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

// Desde 10/09/2026 as escalas de suicidio entram aqui. C-SSRS com plano e
// intencao, ou ASQ com pensamento de se matar agora, e ambulatorial marcado sem
// uma palavra: era o que o programa deixava passar.
describe("risco agudo nas escalas chega ao nivel de cuidado", () => {
  const cssrsAlto = {
    escalasAplicadas: ["cssrs"],
    escala_cssrs_0: "0", escala_cssrs_1: "1", escala_cssrs_2: "0", escala_cssrs_3: "0", escala_cssrs_4: "1", escala_cssrs_5: "0"
  };
  const asqAgudo = {
    escalasAplicadas: ["asq"],
    escala_asq_0: "0", escala_asq_1: "0", escala_asq_2: "0", escala_asq_3: "1", escala_asq_4: "1"
  };

  it("o risco aparece antes da escolha, com a escala que o apontou", () => {
    assert.match(careLevelView(cssrsAlto), /Risco agudo nas escalas desta consulta/);
    assert.match(careLevelView(cssrsAlto), /C-SSRS: risco alto/);
    assert.match(careLevelView(asqAgudo), /ASQ: triagem positiva, com risco agudo/);
  });

  it("ambulatorial sem justificativa dispara o aviso", () => {
    assert.match(careLevelView({ ...cssrsAlto, nivelCuidado: "Ambulatorial" }), /Tratamento ambulatorial com risco agudo/);
  });

  it("com a razao escrita, o aviso some", () => {
    const html = careLevelView({ ...cssrsAlto, nivelCuidado: "Ambulatorial", nivelCuidadoJustificativa: "plano de segurança com a família e retorno em 48 horas" });
    assert.doesNotMatch(html, /care-warning/);
  });

  it("item 9 da PHQ-9 sozinho nao muda o nivel de cuidado: alerta na propria escala", () => {
    const html = careLevelView({ escalasAplicadas: ["phq9"], escala_phq9_8: "1", nivelCuidado: "Ambulatorial" });
    assert.doesNotMatch(html, /Risco agudo/);
    assert.doesNotMatch(html, /care-warning/);
  });

  it("no retorno, o Ajuste de conduta mostra o mesmo risco", () => {
    assert.match(returnPlanModule(cssrsAlto), /Risco agudo nas escalas deste retorno/);
    assert.doesNotMatch(returnPlanModule({}), /Risco agudo/);
  });
});
