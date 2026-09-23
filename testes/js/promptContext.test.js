import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildClinicalAiPrompt } from "../../src/services/clinicalAiService.js";
import { promptAnamnesisText } from "../../src/clinical/narrative.js";

// A transcricao e entrada da extracao, e so dela. Depois de extraida, o que
// representa o caso nas etapas seguintes e o QP/HDA que o medico revisou.
const TRANSCRICAO = [
  "Falante A: entao me conta, como e que voce tem passado?",
  "Falante B: ah doutor, com dinheiro, sabe, as coisas ficaram dificeis, ai eu",
  "Falante B: comecei a nao dormir direito, faz uns dois meses mais ou menos",
  "Falante A: e o apetite, mudou alguma coisa?",
  "Falante B: comer eu como, mas perdi a vontade de quase tudo"
].join("\n");

const DEPOIS_DA_EXTRACAO = {
  qphda: TRANSCRICAO,
  anamnesisProcessedTranscript: TRANSCRICAO,
  queixa: "Insonia e anedonia ha dois meses.",
  hdaManual: "Quadro iniciado apos dificuldades financeiras, com insonia e perda de interesse."
};

describe("a transcricao nao viaja para as etapas seguintes", () => {
  it("o diagnostico recebe o QP/HDA revisado, e nao a conversa", () => {
    const prompt = buildClinicalAiPrompt("diagnosis", DEPOIS_DA_EXTRACAO, {});
    assert.doesNotMatch(prompt, /Falante A:/);
    assert.match(prompt, /Insonia e anedonia ha dois meses/);
  });

  it("o tratamento tambem", () => {
    assert.doesNotMatch(buildClinicalAiPrompt("treatment", DEPOIS_DA_EXTRACAO, {}), /Falante B:/);
  });

  // A etapa da anamnese LE o dialogo: a tarefa dela e separar quem falou o que.
  // Tirar a transcricao daqui seria tirar a entrada da extracao.
  it("a anamnese continua recebendo o dialogo bruto", () => {
    assert.match(buildClinicalAiPrompt("anamnesis", DEPOIS_DA_EXTRACAO, {}), /Falante A:/);
  });

  it("o registro anterior tambem entra pelo texto revisado", () => {
    const prompt = buildClinicalAiPrompt("treatment", { queixa: "Retorno." }, {}, DEPOIS_DA_EXTRACAO, true);
    assert.doesNotMatch(prompt, /Falante A:/);
  });
});

describe("promptAnamnesisText so troca o que tem certeza de ser transcricao", () => {
  it("troca quando o marcador confere com o campo", () => {
    assert.equal(promptAnamnesisText(DEPOIS_DA_EXTRACAO),
      "QP: Insonia e anedonia ha dois meses.\nHDA: Quadro iniciado apos dificuldades financeiras, com insonia e perda de interesse.");
  });

  // Modo manual: `qphda` e a "Anotacao clinica livre", escrita pelo medico, e
  // nao ha marcador. Ela e dado clinico e segue inteira.
  it("anotacao livre do modo manual nao e transcricao e nao some", () => {
    const manual = { qphda: "Paciente tras receita antiga de outro servico.", queixa: "Ansiedade." };
    assert.match(promptAnamnesisText(manual), /receita antiga de outro servico/);
  });

  it("transcricao gravada e ainda nao extraida segue inteira", () => {
    assert.equal(promptAnamnesisText({ qphda: TRANSCRICAO }), TRANSCRICAO);
  });

  it("marcador de uma transcricao antiga nao derruba a nova", () => {
    const regravado = { ...DEPOIS_DA_EXTRACAO, qphda: "Falante A: outra conversa, gravada depois." };
    assert.match(promptAnamnesisText(regravado), /outra conversa/);
  });

  it("extracao que nao devolveu QP nem HDA devolve a transcricao, e nao vazio", () => {
    assert.equal(promptAnamnesisText({ qphda: TRANSCRICAO, anamnesisProcessedTranscript: TRANSCRICAO }), TRANSCRICAO);
  });
});
