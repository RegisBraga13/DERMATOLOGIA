import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ENSAIO_MINIMO_SEMANAS, medicationTrials, medicationTrialsText, reportedMedicationTreatmentLines } from "../../src/clinical/medicationTrial.js";
import { buildClinicalAiPrompt } from "../../src/services/clinicalAiService.js";

// Regra dele, 23/09/2026: o que falhou com ensaio adequado nao se represcreve;
// o que funcionou em outro episodio e forte indicacao de repetir. Para valer,
// o historico tem de distinguir o farmaco que FALHOU do que nunca chegou a ser
// testado -- dose baixa, tempo curto, paciente que interrompeu.
//
// O corte de tempo e de 4 semanas, decisao dele no mesmo dia. As datas dos
// casos abaixo foram escolhidas para cair claramente de um lado ou do outro
// desse corte, e nao coladas nele: teste que muda de resultado com um dia de
// diferenca nao mede regra nenhuma.

const consulta = (id, data, farmacos) => ({
  id, type: "consultation", label: "Consulta", createdAt: data,
  tratamentoMedicamentosSelecionados: farmacos
});

const retorno = (id, data, campos) => ({ id, type: "return", label: "Retorno", createdAt: data, ...campos });

const SERTRALINA_150 = "Sertralina | Dose inicial: 50 mg/dia | Progressão: 50 mg a cada 2 semanas | Dose final: 150 mg/dia";
const SERTRALINA_25 = "Sertralina | Dose inicial: 25 mg/dia | Progressão: conforme tolerância | Dose final: 25 mg/dia";
const FLUOXETINA_20 = "Fluoxetina | Dose inicial: 20 mg/dia | Progressão: após 4 semanas | Dose final: 20 mg/dia";

function umEnsaio(entries) {
  const ensaios = medicationTrials(entries, { agora: Date.parse("2026-09-01T10:00:00.000Z") });
  assert.equal(ensaios.length, 1, "esperado um unico ensaio");
  return ensaios[0];
}

describe("sem tabela de dose, ensaio longo sem resposta vira indeterminado", () => {
  const ensaio = umEnsaio([
    consulta("c1", "2026-01-05T10:00:00.000Z", [SERTRALINA_150]),
    retorno("r1", "2026-03-20T10:00:00.000Z", {
      retornoFarmaco_0: "Em uso como prescrito", retornoFarmaco_0Rotulo: SERTRALINA_150,
      evolucaoClinicaRetorno: ["Inalterado"],
      ajusteMedicacaoSelecionada: ["Sertralina — Trocar medicamento | por escitalopram 10 mg/dia | sem resposta apos dois meses na dose plena"]
    })
  ]);

  // Ate 23/09/2026 este caso fechava como FALHA_COM_ENSAIO_ADEQUADO: a tabela
  // de faixa usual confirmava que 150 mg era dose adequada. Retirada a tabela
  // (decisao dele, mesma data), tempo suficiente sem dose para comparar cai em
  // INDETERMINADO -- a dose e o tempo continuam registrados, so a afirmacao
  // "foi adequada" deixou de existir.
  it("tempo acima do minimo, sem tabela para confirmar a dose, fecha como indeterminado", () => {
    assert.equal(ensaio.veredito, "INDETERMINADO");
    assert.equal(ensaio.adequado, null);
    assert.equal(ensaio.doseMg, 150);
    assert.ok(ensaio.semanas >= ENSAIO_MINIMO_SEMANAS);
  });

  it("a evidencia carrega o motivo escrito pelo medico", () => {
    assert.match(medicationTrialsText([ensaio]), /sem resposta apos dois meses na dose plena/);
  });
});

describe("o que NAO e falha", () => {
  // Sem tabela de faixa usual, dose baixa deixou de ser detectavel: o unico
  // criterio que sobrou para "ensaio insuficiente" e o TEMPO. Dose baixa com
  // tempo longo agora fecha como indeterminado, nao mais insuficiente.
  it("dose baixa mas tempo longo, sem tabela para comparar, fecha como indeterminado", () => {
    const ensaio = umEnsaio([
      consulta("c1", "2026-01-05T10:00:00.000Z", [SERTRALINA_25]),
      retorno("r1", "2026-05-20T10:00:00.000Z", {
        retornoFarmaco_0: "Em uso como prescrito", retornoFarmaco_0Rotulo: SERTRALINA_25,
        evolucaoClinicaRetorno: ["Inalterado"],
        ajusteMedicacaoSelecionada: ["Sertralina — Retirar | suspender | sem resposta"]
      })
    ]);
    assert.equal(ensaio.veredito, "INDETERMINADO");
    assert.equal(ensaio.adequado, null);
  });

  it("tempo abaixo do minimo e ensaio insuficiente, mesmo na dose certa", () => {
    const ensaio = umEnsaio([
      consulta("c1", "2026-01-05T10:00:00.000Z", [SERTRALINA_150]),
      retorno("r1", "2026-01-19T10:00:00.000Z", {
        retornoFarmaco_0: "Em uso como prescrito", retornoFarmaco_0Rotulo: SERTRALINA_150,
        evolucaoClinicaRetorno: ["Inalterado"],
        ajusteMedicacaoSelecionada: ["Sertralina — Trocar medicamento | por venlafaxina | sem melhora"]
      })
    ]);
    assert.equal(ensaio.veredito, "ENSAIO_INSUFICIENTE");
  });

  it("quem interrompeu nao testou o farmaco, por mais tempo que tenha passado", () => {
    const ensaio = umEnsaio([
      consulta("c1", "2026-01-05T10:00:00.000Z", [SERTRALINA_150]),
      retorno("r1", "2026-06-20T10:00:00.000Z", {
        retornoFarmaco_0: "Interrompeu", retornoFarmaco_0Rotulo: SERTRALINA_150,
        evolucaoClinicaRetorno: ["Inalterado"]
      })
    ]);
    assert.equal(ensaio.veredito, "NAO_TESTADO");
    // Ele parou em algum ponto que ninguem registrou: o intervalo entre os
    // dois atendimentos nao e tempo de uso.
    assert.equal(ensaio.semanas, null);
    assert.match(medicationTrialsText([ensaio]), /tempo nao registrado/);
  });

  it("quem nunca iniciou nao acumula tempo de uso", () => {
    const ensaio = umEnsaio([
      consulta("c1", "2026-01-05T10:00:00.000Z", [SERTRALINA_150]),
      retorno("r1", "2026-06-20T10:00:00.000Z", {
        retornoFarmaco_0: "Nunca iniciou", retornoFarmaco_0Rotulo: SERTRALINA_150
      })
    ]);
    assert.equal(ensaio.veredito, "NAO_TESTADO");
    assert.equal(ensaio.semanas, 0);
  });

  // Dose que ninguem registrou nao vira ensaio insuficiente: viraria um
  // farmaco descartado por falta de anotacao.
  it("dose desconhecida devolve indeterminado, e nao insuficiente", () => {
    const ensaio = umEnsaio([
      consulta("c1", "2026-01-05T10:00:00.000Z", [SERTRALINA_150]),
      retorno("r1", "2026-05-20T10:00:00.000Z", {
        retornoFarmaco_0: "Em uso com dose alterada", retornoFarmaco_0Rotulo: SERTRALINA_150,
        evolucaoClinicaRetorno: ["Inalterado"],
        ajusteMedicacaoSelecionada: ["Sertralina — Retirar | suspender | decisao conjunta"]
      })
    ]);
    assert.equal(ensaio.adequado, null);
    assert.equal(ensaio.veredito, "INDETERMINADO");
  });
});

describe("resposta boa", () => {
  const ensaio = umEnsaio([
    consulta("c1", "2025-02-05T10:00:00.000Z", [FLUOXETINA_20]),
    retorno("r1", "2025-06-10T10:00:00.000Z", {
      retornoFarmaco_0: "Em uso como prescrito", retornoFarmaco_0Rotulo: FLUOXETINA_20,
      evolucaoClinicaRetorno: ["Melhora"],
      ajusteMedicacaoSelecionada: ["Fluoxetina — Retirar | reduzir 10 mg por semana | remissao sustentada, decisao conjunta"]
    })
  ]);

  it("melhora no periodo e suspensao depois fecham como resposta boa", () => {
    assert.equal(ensaio.veredito, "RESPOSTA_BOA");
  });

  it("'Melhora parcial' tambem conta como resposta", () => {
    const parcial = umEnsaio([
      consulta("c1", "2025-02-05T10:00:00.000Z", [FLUOXETINA_20]),
      retorno("r1", "2025-06-10T10:00:00.000Z", {
        retornoFarmaco_0: "Em uso como prescrito", retornoFarmaco_0Rotulo: FLUOXETINA_20,
        evolucaoClinicaRetorno: ["Melhora parcial"],
        ajusteMedicacaoSelecionada: ["Fluoxetina — Retirar | suspender | gestacao planejada"]
      })
    ]);
    assert.equal(parcial.veredito, "RESPOSTA_BOA");
  });
});

describe("intolerancia", () => {
  // Vem antes da eficacia: retirado por efeito colateral nao chegou a ser
  // testado contra o quadro, e o que o exclui vale para a classe.
  it("o motivo escrito decide, mesmo com melhora no periodo", () => {
    const ensaio = umEnsaio([
      consulta("c1", "2026-01-05T10:00:00.000Z", [SERTRALINA_150]),
      retorno("r1", "2026-04-20T10:00:00.000Z", {
        retornoFarmaco_0: "Em uso como prescrito", retornoFarmaco_0Rotulo: SERTRALINA_150,
        evolucaoClinicaRetorno: ["Melhora"],
        efeitos: ["Disfuncao sexual"],
        ajusteMedicacaoSelecionada: ["Sertralina — Trocar medicamento | por bupropiona | efeito colateral intoleravel"]
      })
    ]);
    assert.equal(ensaio.veredito, "INTOLERANCIA");
  });

  // Efeito colateral marcado no retorno e do PERIODO, e nao de um farmaco: com
  // tres em uso, atribui-lo a um seria inventar o que ninguem registrou.
  it("efeito marcado no retorno, sem motivo escrito, nao vira intolerancia", () => {
    const ensaio = umEnsaio([
      consulta("c1", "2026-01-05T10:00:00.000Z", [SERTRALINA_150]),
      retorno("r1", "2026-04-20T10:00:00.000Z", {
        retornoFarmaco_0: "Em uso como prescrito", retornoFarmaco_0Rotulo: SERTRALINA_150,
        evolucaoClinicaRetorno: ["Inalterado"],
        efeitos: ["Sedacao ou sonolencia"],
        ajusteMedicacaoSelecionada: ["Sertralina — Retirar | suspender | sem resposta"]
      })
    ]);
    assert.equal(ensaio.veredito, "INDETERMINADO");
    assert.match(medicationTrialsText([ensaio]), /efeitos no periodo: sedacao ou sonolencia/);
  });
});

describe("um farmaco pode ter mais de um ensaio", () => {
  const ensaios = medicationTrials([
    consulta("c1", "2025-01-06T10:00:00.000Z", [SERTRALINA_150]),
    retorno("r1", "2025-02-10T10:00:00.000Z", {
      retornoFarmaco_0: "Interrompeu", retornoFarmaco_0Rotulo: SERTRALINA_150,
      evolucaoClinicaRetorno: ["Inalterado"]
    }),
    consulta("c2", "2026-01-05T10:00:00.000Z", [SERTRALINA_150]),
    retorno("r2", "2026-04-20T10:00:00.000Z", {
      retornoFarmaco_0: "Em uso como prescrito", retornoFarmaco_0Rotulo: SERTRALINA_150,
      evolucaoClinicaRetorno: ["Inalterado"],
      ajusteMedicacaoSelecionada: ["Sertralina — Trocar medicamento | por venlafaxina | sem resposta na dose plena"]
    })
  ], { agora: Date.parse("2026-09-01T10:00:00.000Z") });

  it("a interrupcao de 2025 e o ensaio pleno de 2026 nao viram um registro so", () => {
    assert.equal(ensaios.length, 2);
    assert.deepEqual(ensaios.map(item => item.veredito), ["NAO_TESTADO", "INDETERMINADO"]);
  });
});

describe("a dose do ensaio e a maior que ele chegou a tomar", () => {
  it("o aumento registrado no ajuste conta como dose atingida", () => {
    const ensaios = medicationTrials([
      consulta("c1", "2026-01-05T10:00:00.000Z", ["Sertralina | Dose inicial: 25 mg/dia | Progressão: semanal | Dose final: 25 mg/dia"]),
      retorno("r1", "2026-02-10T10:00:00.000Z", {
        retornoFarmaco_0: "Em uso como prescrito", retornoFarmaco_0Rotulo: "Sertralina | Dose inicial: 25 mg/dia | Progressão: semanal | Dose final: 25 mg/dia",
        evolucaoClinicaRetorno: ["Inalterado"],
        ajusteMedicacaoSelecionada: ["Sertralina — Aumentar dose | 100 mg/dia | resposta ausente na dose baixa"]
      }),
      retorno("r2", "2026-05-10T10:00:00.000Z", {
        retornoFarmaco_0: "Em uso como prescrito", retornoFarmaco_0Rotulo: "Sertralina | Dose inicial: 25 mg/dia | Progressão: semanal | Dose final: 25 mg/dia",
        evolucaoClinicaRetorno: ["Inalterado"],
        ajusteMedicacaoSelecionada: ["Sertralina — Trocar medicamento | por venlafaxina | sem resposta"]
      })
    ], { agora: Date.parse("2026-09-01T10:00:00.000Z") });
    assert.equal(ensaios.length, 1);
    assert.equal(ensaios[0].doseMg, 100);
    assert.equal(ensaios[0].veredito, "INDETERMINADO");
  });
});

describe("farmaco em uso hoje", () => {
  it("nao e falha nem sucesso: e o tratamento em curso", () => {
    const ensaio = umEnsaio([consulta("c1", "2026-08-05T10:00:00.000Z", [SERTRALINA_150])]);
    assert.equal(ensaio.veredito, "EM_USO");
    assert.equal(ensaio.fim, "");
  });
});

describe("o historico chega ao prompt das etapas que prescrevem", () => {
  const historia = [
    consulta("c1", "2025-01-06T10:00:00.000Z", [FLUOXETINA_20]),
    retorno("r1", "2025-06-10T10:00:00.000Z", {
      retornoFarmaco_0: "Em uso como prescrito", retornoFarmaco_0Rotulo: FLUOXETINA_20,
      evolucaoClinicaRetorno: ["Melhora"],
      ajusteMedicacaoSelecionada: ["Fluoxetina — Retirar | suspender | remissao sustentada"]
    })
  ];
  const caso = { queixa: "Novo episodio depressivo.", diagnosticoSelecionado: ["Depressão Maior"] };

  it("o tratamento recebe a secao e a regra de conduta", () => {
    const prompt = buildClinicalAiPrompt("treatment", caso, {}, null, false, null, historia);
    assert.match(prompt, /HISTORICO FARMACOLOGICO DESTE PACIENTE/);
    assert.match(prompt, /Fluoxetina — RESPOSTA BOA em episodio anterior/);
    assert.match(prompt, /e a PRIMEIRA escolha para o episodio atual/);
    assert.match(prompt, /'INTOLERANCIA' exclui o farmaco/);
  });

  it("o refino do tratamento recebe o mesmo, porque revisa a mesma decisao", () => {
    assert.match(buildClinicalAiPrompt("treatment_review", caso, {}, null, false, null, historia),
      /HISTORICO FARMACOLOGICO DESTE PACIENTE/);
  });

  it("o ajuste de conduta recebe, porque e onde a troca acontece", () => {
    assert.match(buildClinicalAiPrompt("return_plan", caso, {}, null, true, null, historia),
      /HISTORICO FARMACOLOGICO DESTE PACIENTE/);
  });

  // Decisao dele, 23/09/2026: resposta a tratamento e evidencia diagnostica.
  it("o diagnostico recebe, com a regra de nao virar atalho", () => {
    const prompt = buildClinicalAiPrompt("diagnosis", caso, {}, null, false, null, historia);
    assert.match(prompt, /HISTORICO FARMACOLOGICO DESTE PACIENTE/);
    assert.match(prompt, /nunca como conclusao/);
    assert.match(prompt, /NAO sao falha e nao sustentam nada/);
  });

  it("a anamnese nao recebe: ela nao raciocina sobre o caso, extrai o que foi dito", () => {
    assert.doesNotMatch(buildClinicalAiPrompt("anamnesis", caso, {}, null, false, null, historia),
      /HISTORICO FARMACOLOGICO DESTE PACIENTE/);
  });

  it("paciente sem historico nenhum nao ganha secao vazia", () => {
    assert.doesNotMatch(buildClinicalAiPrompt("treatment", caso, {}, null, false, null, []),
      /HISTORICO FARMACOLOGICO DESTE PACIENTE/);
  });

  // Ausencia no historico nao e ausencia de uso: o paciente pode ter tomado
  // antes de existir registro neste programa.
  it("a secao diz ate onde ela alcanca", () => {
    assert.match(buildClinicalAiPrompt("treatment", caso, {}, null, false, null, historia),
      /nao foi avaliado como ensaio/);
  });
});

// P8 do PENDENCIAS.md, parte simples: o que o paciente RELATA de tratamento
// anterior fora deste programa. Decisao do Dr. Regis, 24/09/2026: SO
// transporte, texto livre, sem classificar Sim/Nao e sem entrar no prompt da
// IA -- o medico le no Tratamento e decide.
describe("o que o paciente relata de tratamento anterior, fora do programa", () => {
  it("uma linha por frase, exatamente como foi escrita", () => {
    const linhas = reportedMedicationTreatmentLines({
      tratamentoFarmacoPrevioRelato: "Diazepam 5mg 2x dia, durante vários anos.\nEscitalopram 5mg 4 meses e parei pois não tive melhora"
    });
    assert.deepEqual(linhas, [
      "Diazepam 5mg 2x dia, durante vários anos.",
      "Escitalopram 5mg 4 meses e parei pois não tive melhora"
    ]);
  });

  it("sem relato nenhum, lista vazia", () => {
    assert.deepEqual(reportedMedicationTreatmentLines({}), []);
  });

  it("nao entra no prompt do tratamento -- e so transporte para a tela, sem analise de IA", () => {
    const caso = {
      queixa: "Novo episodio depressivo.", diagnosticoSelecionado: ["Depressão Maior"],
      tratamentoFarmacoPrevioRelato: "Venlafaxina 150mg por 3 meses, melhorou bastante."
    };
    const prompt = buildClinicalAiPrompt("treatment", caso, {}, null, false, null, []);
    assert.doesNotMatch(prompt, /Venlafaxina/);
  });
});
