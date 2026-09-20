import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildClinicalAiPrompt } from "../../src/services/clinicalAiService.js";

// Pedido dele, 14/09/2026, para valer SEMPRE: criterio do DSM-5-TR e referencia,
// e nao veredito; a mente e espectro; criterio se repete entre transtornos;
// gravidade pelo sofrimento e pela funcionalidade; diagnostico no tempo. Se uma
// destas regras sair do prompt, a IA volta a contar criterios.
const caso = {
  queixa: "Tristeza ha dois meses.",
  hdaManual: "Parou de trabalhar, nao sai de casa, dorme mal.",
  humor: ["Deprimido"]
};

describe("o diagnostico nao e contagem de criterios", () => {
  const geracao = buildClinicalAiPrompt("diagnosis", caso, {});
  const refino = buildClinicalAiPrompt("diagnosis_review", caso, {});

  it("quadro abaixo do limiar com sofrimento nao some", () => {
    assert.match(geracao, /referencia, e nao veredito/);
    assert.match(geracao, /abaixo do limiar de uma entidade NAO some/);
    assert.match(geracao, /outro transtorno especificado/);
  });

  it("criterio compartilhado nao decide o diferencial", () => {
    assert.match(geracao, /NAO separam uma hipotese da outra/);
  });

  it("a gravidade sai do sofrimento e da funcionalidade", () => {
    assert.match(geracao, /dominio 'Funcionalidade'/);
    assert.match(geracao, /e nao do numero de criterios preenchidos/);
  });

  it("o que pode mudar o diagnostico vira o que vigiar no seguimento", () => {
    assert.match(geracao, /O diagnostico e longitudinal/);
  });

  // Lista dele, 14/09/2026.
  it("toda hipotese depressiva confere os sete sinais de alerta para bipolaridade no criterio de mania", () => {
    assert.match(geracao, /sete sinais de alerta para bipolaridade/);
    for (const sinal of [/antes dos 20 anos/, /tres ou mais episodios/, /falta de resposta ao antidepressivo/,
      /esgotado por fora/, /pai, mae ou irmao com transtorno bipolar/, /hipersonia/, /inicio ou termino abrupto/]) {
      assert.match(geracao, sinal);
    }
  });

  // Dele, 14/09/2026: "qualquer episodio de mania documentado caracteriza
  // bipolaridade. Invariavelmente".
  it("mania documentada caracteriza bipolaridade, sem peso nem excecao", () => {
    assert.match(geracao, /Qualquer episodio MANIACO documentado/);
    assert.match(geracao, /caracteriza bipolaridade, INVARIAVELMENTE/);
    assert.match(geracao, /nunca vira depressao unipolar/);
    assert.match(geracao, /Nao proponha transtorno depressivo maior, episodio depressivo ou distimia/);
    assert.match(refino, /caracteriza bipolaridade, INVARIAVELMENTE/);
  });

  // Medido em 14/09/2026: o oposto do sinal saia marcado como alerta.
  it("os sinais pesam em conjunto no criterio de mania, e o oposto do sinal nao conta", () => {
    assert.match(geracao, /criterio de exclusao de mania ou hipomania/);
    // Dele: "Desses criterios nao sao rigidos, como tudo em psiquiatria".
    assert.match(geracao, /Os sinais nao sao rigidos, como nada em psiquiatria/);
    assert.match(geracao, /pese-os em conjunto/);
    assert.match(geracao, /mostrar o CONTRARIO do sinal/);
    // Medido em 14/09/2026: "ausencia de sinais de bipolaridade" com a historia
    // familiar e a resposta ao antidepressivo sem registro.
    assert.match(geracao, /nao registrado nao e ausente/);
    assert.doesNotMatch(geracao, /shift_signs/);
  });

  it("funcionalidade pede o fato, e nao o rotulo do formulario", () => {
    assert.match(geracao, /o que a pessoa deixou de fazer, e desde quando/);
  });

  it("o Refinar herda as regras e nao conta criterios do DSM anexado", () => {
    assert.match(refino, /Conferir nao e contar/);
    assert.match(refino, /referencia, e nao veredito/);
    assert.match(refino, /O diagnostico e longitudinal/);
  });

  it("o prompt nao manda escrever em justificativa que o esquema nao tem", () => {
    assert.doesNotMatch(geracao, /diga isso na justificativa/);
  });
});

// Dele, 20/09/2026: a primeira historia clinica volta ao raciocinio do
// Diagnostico e do Tratamento -- "isso aqui e ouro".
describe("a sintese do caso volta ao diagnostico e ao tratamento", () => {
  const CABECALHO = /SINTESE DO CASO \(primeira historia clinica/;
  const paciente = { nome: "Ismael Ferrari", nascimento: "2002-09-08", sexo: "Masculino" };
  const registro = {
    queixa: "Eles instalaram alguma coisa em mim.",
    hdaManual: "Ha um ano ouve duas vozes que comentam seus atos.",
    sensopercepcao: ["Alucinacoes auditivas"],
    diagnosticoSelecionado: ["Esquizofrenia - CID-11: 6A20 - DSM-5-TR: F20.9"],
    tratamentoMedicamentosSelecionados: ["Risperidona 2 mg"],
    analisePsicopatologica: "Sensopercepcao: alucinacoes auditivas comentando os atos (ouve duas vozes)"
  };

  it("o diagnostico recebe a sintese, sem hipotese nem tratamento", () => {
    const prompt = buildClinicalAiPrompt("diagnosis", registro, paciente);
    assert.match(prompt, CABECALHO);
    const sintese = prompt.split("SINTESE DO CASO (")[1].split("FORMATO DA RESPOSTA")[0];
    assert.match(sintese, /Ismael Ferrari/);
    assert.doesNotMatch(sintese, /Esquizofrenia|Risperidona|Consideram-se as hip/);
  });

  it("a evidencia continua sendo o fato bruto, e nao a sintese", () => {
    assert.match(buildClinicalAiPrompt("diagnosis", registro, paciente), /EVIDENCIA continua sendo o fato bruto do registro/);
  });

  it("o tratamento recebe a sintese e a analise psicopatologica", () => {
    const prompt = buildClinicalAiPrompt("treatment", registro, paciente);
    assert.match(prompt, CABECALHO);
    assert.match(prompt, /ANALISE PSICOPATOLOGICA \(achado e, entre parenteses, a evidencia/);
  });

  it("a revisao segue a mesma regra da geracao", () => {
    assert.match(buildClinicalAiPrompt("diagnosis_review", registro, paciente), CABECALHO);
  });

  it("outras etapas e o retorno nao recebem a sintese", () => {
    assert.doesNotMatch(buildClinicalAiPrompt("mental_exam", registro, paciente), CABECALHO);
    assert.doesNotMatch(buildClinicalAiPrompt("diagnosis", registro, paciente, null, true), CABECALHO);
  });
});
