// A resposta da IA leva dezenas de segundos e o formulario segue editavel. O
// que o medico marcou nesse intervalo tem de sobreviver a ela: os montadores
// leem o rascunho de AGORA, e nunca o de antes da espera.
//
// Rodar a partir da raiz do projeto:
//     node --test 'testes/js/*.test.js'
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { returnPlanMedicationLines, returnPlanSuggestionFromAi, treatmentSuggestionFromAi } from "../../src/clinical/aiTreatmentResult.js";

const resultadoTratamento = {
  care_level: { level: "Ambulatorial", justification: "Sem risco agudo." },
  medication_options: [{ medication: "Sertralina", initial_dose: "50 mg", progression: "100 mg em 2 semanas", target_dose: "150 mg" }],
  non_pharmacological_options: [{ approach: "TCC", details: "12 sessoes" }]
};

describe("tratamento: o que o medico marcou durante a espera continua marcado", () => {
  const agora = {
    nivelCuidado: "Ambulatorial",
    nivelCuidadoJustificativa: "Decisao dele",
    tratamentoMedicamentosSelecionados: ["Sertralina | Dose inicial: 50 mg | Progressão: 100 mg em 2 semanas | Dose final: 150 mg"],
    abordagensSelecionadas: ["TCC | 12 sessoes"],
    condutaMedica: "Retorno em 15 dias"
  };
  const sugestao = treatmentSuggestionFromAi({ result: resultadoTratamento, target: agora, sources: [], mode: "rag" });

  it("nivel de cuidado, justificativa e conduta vem do rascunho de agora", () => {
    assert.equal(sugestao.nivelCuidado, "Ambulatorial");
    assert.equal(sugestao.nivelCuidadoJustificativa, "Decisao dele");
    assert.equal(sugestao.condutaMedica, "Retorno em 15 dias");
  });

  it("as caixas assinaladas por ele sao mantidas", () => {
    assert.deepEqual(sugestao.tratamentoMedicamentosSelecionados, agora.tratamentoMedicamentosSelecionados);
    assert.deepEqual(sugestao.abordagensSelecionadas, ["TCC | 12 sessoes"]);
  });

  it("a IA propoe o nivel, mas nao o assinala", () => {
    const semEscolha = treatmentSuggestionFromAi({ result: resultadoTratamento, target: {}, sources: [], mode: "rag" });
    assert.equal(semEscolha.nivelCuidadoAi, "Ambulatorial");
    assert.equal(semEscolha.nivelCuidado, "");
    assert.deepEqual(semEscolha.tratamentoMedicamentosSelecionados, []);
  });

  it("no refino, o que a revisao tirou das caixas dele fica registrado", () => {
    const revisado = treatmentSuggestionFromAi({
      result: { ...resultadoTratamento, medication_options: [] },
      target: { ...agora, tratamentoAiMedicamentos: "Sertralina | x", tratamentoAiAbordagens: "TCC | 12 sessoes" },
      sources: [], mode: "rag", revisao: true
    });
    assert.deepEqual(revisado.tratamentoRefinoAnterior.retiradas, agora.tratamentoMedicamentosSelecionados);
    assert.match(revisado.treatmentStatus, /^Refinado pela fonte especializada/);
  });
});

describe("ajuste de conduta: as decisoes do retorno sobrevivem a nova geracao", () => {
  const result = {
    medication_actions: [{ medication: "Sertralina", action: "Manter", detail: "50 mg", rationale: "Resposta parcial" }],
    conduct_options: ["Psicoeducacao", " "]
  };

  it("mantem o que ele assinalou depois de pedir a geracao", () => {
    const sugestao = returnPlanSuggestionFromAi({
      result,
      target: { ajusteMedicacaoSelecionada: ["Sertralina — Manter | 50 mg | Resposta parcial"], ajusteCondutaSelecionada: ["Psicoeducacao"] },
      sources: [], mode: "rag"
    });
    assert.deepEqual(sugestao.ajusteMedicacaoSelecionada, ["Sertralina — Manter | 50 mg | Resposta parcial"]);
    assert.deepEqual(sugestao.ajusteCondutaSelecionada, ["Psicoeducacao"]);
    assert.equal(sugestao.ajusteAiConduta, "Psicoeducacao");
  });

  it("sem escolha dele, nada vem assinalado", () => {
    const sugestao = returnPlanSuggestionFromAi({ result, target: {}, sources: [], mode: "rag" });
    assert.deepEqual(sugestao.ajusteMedicacaoSelecionada, []);
    assert.deepEqual(sugestao.ajusteCondutaSelecionada, []);
  });

  it("uma linha por farmaco, sem repetir e sem linha incompleta", () => {
    const linhas = returnPlanMedicationLines({
      medication_actions: [
        { medication: "Sertralina", action: "Manter" },
        { medication: "Sertralina", action: "Manter" },
        { medication: "Lítio", action: "" }
      ]
    });
    assert.deepEqual(linhas, ["Sertralina — Manter"]);
  });
});

describe("o seletor de modo guarda a escolha dele, nao o que o servidor fez", () => {
  // O servidor cai do RAG para a web quando o acervo nao sustenta a resposta e
  // devolve mode "current". Gravar isso no radio mandaria toda geracao seguinte
  // para a web sem ele pedir.
  const daWeb = { result: resultadoTratamento, target: {}, sources: [], mode: "current" };

  it("o tratamento nao devolve pharmaAiMode", () => {
    assert.equal("pharmaAiMode" in treatmentSuggestionFromAi(daWeb), false);
  });

  it("o ajuste de conduta nao devolve returnPlanAiMode", () => {
    const sugestao = returnPlanSuggestionFromAi({ result: { conduct_options: ["Psicoeducacao"] }, target: {}, sources: [], mode: "current" });
    assert.equal("returnPlanAiMode" in sugestao, false);
  });

  it("refino respondido pela web diz que veio da web, nao da fonte especializada", () => {
    const pelaWeb = treatmentSuggestionFromAi({ ...daWeb, revisao: true });
    assert.match(pelaWeb.treatmentStatus, /^Refinado pela web/);
    const peloAcervo = treatmentSuggestionFromAi({ ...daWeb, mode: "rag", revisao: true });
    assert.match(peloAcervo.treatmentStatus, /^Refinado pela fonte especializada/);
  });
});
