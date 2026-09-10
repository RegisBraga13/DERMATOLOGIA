import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDocumentText, documentDraftFields, documentsNarrativeText, documentSummary, formatDiagnosisForDocument,
  issuedDocument, numberInWords, withoutDocumentDraftFields
} from "../../src/clinical/documents.js";
import { buildEvolutionNarrative } from "../../src/clinical/narrative.js";
import { documentsBody } from "../../src/views/documents.js";

// Documentos do atendimento, desde 10/09/2026. O que estes testes fixam: o
// diagnostico so sai com a autorizacao marcada, a declaracao de comparecimento
// nunca o traz, o texto sai do que esta registrado, e os campos de tela nao
// vao para o prontuario.

const paciente = { nome: "Paciente Ficticio", nascimento: "1980-05-10" };
const medico = { nome: "Dra. Teste", crm: "12345", uf: "sp", rqe: "678", cidade: "São Paulo" };
const agora = new Date(2026, 8, 10, 14, 0);
const consulta = {
  createdAt: "2026-09-10T14:00:00.000Z",
  diagnosticoSelecionado: ["Depressão Maior - CID-11: 6A70 - DSM-5-TR: F32.9"],
  tratamentoMedicamentosSelecionados: ["Sertralina | 50 mg/dia"]
};
const gerar = (tipo, extra = {}, opcoes = {}) => buildDocumentText(tipo, { form: { ...consulta, ...extra }, patient: paciente, doctor: medico, agora, ...opcoes });

describe("atestado", () => {
  it("afastamento por extenso, a partir da data escolhida", () => {
    const texto = gerar("atestado", { documento_dias: "3", documento_inicio: "2026-09-11" });
    assert.match(texto, /Paciente Ficticio, com data de nascimento em 10\/05\/1980, passou por consulta psiquiátrica nesta data/);
    assert.match(texto, /por 3 \(três\) dias, a partir de 11\/09\/2026\./);
  });

  it("sem autorizacao, o CID nao entra, e o atestado nao anuncia a omissao", () => {
    const texto = gerar("atestado", { documento_dias: "2" });
    assert.doesNotMatch(texto, /F32|6A70|Diagnóstico/);
  });

  it("com autorizacao, o diagnostico entra com os codigos", () => {
    const texto = gerar("atestado", { documento_dias: "2", documento_autorizaCid: "sim" });
    assert.match(texto, /autorização expressa do\(a\) paciente: Depressão Maior \(CID-11 6A70; DSM-5-TR F32\.9\)\./);
  });

  it("assinatura com cidade, data por extenso, CRM com UF e RQE", () => {
    const texto = gerar("atestado", {});
    assert.match(texto, /São Paulo, 10 de setembro de 2026\./);
    assert.match(texto, /Dra\. Teste\nCRM-SP 12345 · RQE 678$/);
  });

  it("sem dados do medico, a assinatura avisa o que falta", () => {
    const texto = buildDocumentText("atestado", { form: consulta, patient: paciente, agora });
    assert.match(texto, /\[nome\]\n\[CRM\]$/);
  });
});

describe("declaracao de comparecimento", () => {
  it("traz data e horario, e nunca o diagnostico, mesmo com a caixa marcada", () => {
    const texto = gerar("comparecimento", { documento_inicio: "2026-09-10", documento_horaInicio: "14:00", documento_horaFim: "15:00", documento_autorizaCid: "sim" });
    assert.match(texto, /compareceu à consulta médica em 10\/09\/2026, das 14:00 às 15:00\./);
    assert.doesNotMatch(texto, /F32|Depressão/);
  });
});

describe("relatorio, relatorio escolar e encaminhamento", () => {
  it("relatorio sem autorizacao diz por que o diagnostico nao aparece", () => {
    const texto = gerar("relatorio", { documento_destinatario: "Ao médico do trabalho" });
    assert.match(texto, /Destinatário: Ao médico do trabalho\./);
    assert.match(texto, /Diagnóstico não informado neste documento/);
    assert.match(texto, /Tratamento em uso: Sertralina, 50 mg\/dia\./);
  });

  it("relatorio escolar lista as recomendacoes marcadas", () => {
    const texto = gerar("escolar", { documento_recomendacoes: ["Tempo adicional para provas e atividades avaliativas", "Pausas programadas durante a prova"] });
    assert.match(texto, /inclusive ENEM e vestibulares:\n- Tempo adicional para provas e atividades avaliativas\.\n- Pausas programadas durante a prova\./);
  });

  it("encaminhamento traz destino, motivo, medicamentos e o pedido", () => {
    const texto = gerar("encaminhamento", { documento_destino: "Avaliação neuropsicológica", documento_motivo: "queixa de memória", documento_pergunta: "avaliar funções executivas" });
    assert.match(texto, /Encaminhamento para: Avaliação neuropsicológica\./);
    assert.match(texto, /para avaliação neuropsicológica\./);
    assert.match(texto, /Motivo: queixa de memória\./);
    assert.match(texto, /Medicamentos em uso: Sertralina, 50 mg\/dia\./);
    assert.match(texto, /Solicito: avaliar funções executivas\./);
  });

  it("no retorno, o diagnostico vem da consulta e o medicamento, do ajuste de hoje", () => {
    const texto = buildDocumentText("relatorio", {
      form: { ajusteMedicacaoSelecionada: ["Sertralina 100 mg/dia: aumentar"], documento_autorizaCid: "sim" },
      previous: consulta, isReturn: true, patient: paciente, doctor: medico, agora
    });
    assert.match(texto, /Depressão Maior \(CID-11 6A70; DSM-5-TR F32\.9\)/);
    assert.match(texto, /Tratamento em uso: Sertralina 100 mg\/dia: aumentar\./);
  });
});

describe("o que fica no prontuario", () => {
  it("campos de tela saem do registro; a lista de emitidos fica", () => {
    const entrada = { id: "c1", documento_texto: "x", documento_dias: "3", medico_crm: "1", documentosEmitidos: [{ resumo: "atestado" }] };
    assert.deepEqual(withoutDocumentDraftFields(entrada), { id: "c1", documentosEmitidos: [{ resumo: "atestado" }] });
    assert.deepEqual(Object.keys(documentDraftFields(entrada)), ["documento_texto", "documento_dias", "medico_crm"]);
  });

  it("o resumo do emitido entra na historia clinica", () => {
    const emitido = issuedDocument("atestado", { documento_dias: "3" }, "texto", agora);
    assert.equal(emitido.resumo, "atestado de afastamento por 3 dias");
    assert.equal(documentSummary("encaminhamento", { documento_destino: "Psicoterapia" }), "encaminhamento para psicoterapia");
    const narrativa = buildEvolutionNarrative({ documentosEmitidos: [emitido] }, paciente);
    assert.match(narrativa, /Documentos emitidos: atestado de afastamento por 3 dias\./);
    assert.equal(documentsNarrativeText({}), "");
  });
});

describe("apoios", () => {
  it("numero por extenso", () => {
    assert.equal(numberInWords(1), "um");
    assert.equal(numberInWords(15), "quinze");
    assert.equal(numberInWords(21), "vinte e um");
    assert.equal(numberInWords(30), "trinta");
  });

  it("diagnostico sem codigo fica so com o nome", () => {
    assert.equal(formatDiagnosisForDocument("Transtorno de adaptação"), "Transtorno de adaptação");
  });

  it("a tela so oferece a autorizacao onde ha diagnostico a autorizar", () => {
    assert.match(documentsBody({ documento_tipo: "atestado" }), /documento_autorizaCid/);
    assert.doesNotMatch(documentsBody({ documento_tipo: "comparecimento" }), /documento_autorizaCid/);
    assert.match(documentsBody({ documento_tipo: "encaminhamento" }), /documento_destino/);
  });
});
