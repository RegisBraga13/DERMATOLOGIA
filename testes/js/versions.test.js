// Consulta finalizada e versoes (leva 3, 11/09/2026). Reabrir e salvar
// reescrevia o registro no lugar, sem rastro. Agora o finalizado guarda a
// versao anterior da historia clinica, do diagnostico e do tratamento.
//
// Rodar a partir da raiz do projeto:
//     node --test 'testes/js/*.test.js'
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { diagnosisSuggestionFromAi } from "../../src/clinical/aiDiagnosisResult.js";
import { changedGroups, VERSION_LIMIT, withVersionHistory } from "../../src/clinical/versions.js";
import { firstPassView } from "../../src/views/decisions.js";
import { finalizationNote, finalizedNotice, recordStatusLine, versionsView } from "../../src/views/versions.js";

const FINALIZADA = "2026-09-11T10:00:00.000Z";
const depois = minutos => new Date(Date.parse(FINALIZADA) + minutos * 60000).toISOString();
const BASE = {
  id: "c1",
  type: "consultation",
  qphda: "Tristeza ha tres meses",
  evolution: "Texto finalizado.",
  diagnosticoSelecionado: ["Episódio depressivo"],
  tratamentoMedicamentosSelecionados: ["Sertralina | Dose inicial: 50 mg"],
  updatedAt: FINALIZADA,
  finalizadoEm: FINALIZADA
};
// Como o App grava: o novo registro chega com updatedAt de agora.
const salvar = (anterior, mudanca, agora) => withVersionHistory(anterior, { ...anterior, ...mudanca, updatedAt: agora }, agora);

describe("rascunho se edita sem versao", () => {
  it("registro nao finalizado nao guarda versao", () => {
    const rascunho = { ...BASE, finalizadoEm: undefined };
    const salvo = salvar(rascunho, { diagnosticoSelecionado: ["TAG"] }, depois(60));
    assert.equal(salvo.versoes, undefined);
    assert.equal(salvo.alteradoAposFinalizarEm, undefined);
  });
});

describe("finalizado guarda a versao anterior", () => {
  it("mudar o diagnostico guarda a versao de antes, com os tres grupos", () => {
    const salvo = salvar(BASE, { diagnosticoSelecionado: ["TAG"] }, depois(60));
    assert.equal(salvo.versoes.length, 1);
    assert.deepEqual(salvo.versoes[0].mudou, ["diagnostico"]);
    assert.equal(salvo.versoes[0].em, FINALIZADA);
    assert.deepEqual(salvo.versoes[0].campos.diagnosticoSelecionado, ["Episódio depressivo"]);
    assert.equal(salvo.versoes[0].campos.evolution, "Texto finalizado.");
    assert.equal(salvo.versoes[0].campos.qphda, undefined);
    assert.equal(salvo.alteradoAposFinalizarEm, depois(60));
  });

  it("mudar so a anamnese nao gera versao", () => {
    const salvo = salvar(BASE, { qphda: "Tristeza ha quatro meses" }, depois(60));
    assert.equal(salvo.versoes, undefined);
    assert.deepEqual(changedGroups(BASE, { ...BASE, qphda: "outra" }), []);
  });

  it("uma sessao de alteracao vira uma versao so, com tudo o que mudou nela", () => {
    const primeira = salvar(BASE, { diagnosticoSelecionado: ["TAG"] }, depois(60));
    const segunda = salvar(primeira, { tratamentoMedicamentosSelecionados: ["Escitalopram"] }, depois(70));
    assert.equal(segunda.versoes.length, 1);
    assert.deepEqual(segunda.versoes[0].mudou, ["diagnostico", "tratamento"]);
    assert.deepEqual(segunda.versoes[0].campos.diagnosticoSelecionado, ["Episódio depressivo"]);
  });

  it("outra sessao, outra versao", () => {
    const primeira = salvar(BASE, { diagnosticoSelecionado: ["TAG"] }, depois(60));
    const outroDia = salvar(primeira, { evolution: "Texto revisto." }, depois(60 * 24));
    assert.equal(outroDia.versoes.length, 2);
    assert.deepEqual(outroDia.versoes[1].campos.diagnosticoSelecionado, ["TAG"]);
    assert.deepEqual(outroDia.versoes[1].mudou, ["historia"]);
  });

  it("no limite, a versao finalizada original fica e saem as intermediarias", () => {
    let registro = BASE;
    for (let dia = 1; dia <= VERSION_LIMIT + 5; dia += 1) {
      registro = salvar(registro, { evolution: `Texto do dia ${dia}.` }, depois(60 * 24 * dia));
    }
    assert.equal(registro.versoes.length, VERSION_LIMIT);
    assert.equal(registro.versoes[0].campos.evolution, "Texto finalizado.");
    assert.equal(registro.versoes[VERSION_LIMIT - 1].campos.evolution, `Texto do dia ${VERSION_LIMIT + 4}.`);
  });
});

describe("o prontuario diz o estado do registro", () => {
  it("nao finalizado", () => {
    assert.equal(finalizationNote({ type: "consultation" }), "");
    assert.match(recordStatusLine({ type: "consultation" }), /Não finalizado\./);
  });

  it("finalizado, e alterado depois", () => {
    assert.match(finalizationNote(BASE), /^Consulta finalizada em /);
    assert.match(finalizationNote({ ...BASE, type: "return" }), /^Retorno finalizado em /);
    const alterado = salvar(BASE, { diagnosticoSelecionado: ["TAG"] }, depois(60));
    assert.match(finalizationNote(alterado), /Alterado depois, em .*; a versão anterior está guardada no prontuário\./);
    assert.match(finalizedNotice(alterado), /Há 1 versão anterior guardada/);
  });

  it("as versoes anteriores aparecem recolhidas, com o que mudou e o conteudo", () => {
    const html = versionsView(salvar(BASE, { diagnosticoSelecionado: ["TAG"] }, depois(60)));
    assert.match(html, /Versões anteriores \(1\)/);
    assert.match(html, /depois mudou: diagnóstico/);
    assert.match(html, /Episódio depressivo/);
    assert.equal(versionsView(BASE), "");
  });
});

describe("o refino guarda a primeira proposta", () => {
  const TARGET = { diagnosticoAiNosologico: "Transtorno A\nTranstorno B", diagnosticoSelecionado: ["Transtorno B"] };

  it("guarda as listas e o que ele tinha assinalado e a revisao tirou", () => {
    const resultado = diagnosisSuggestionFromAi({ result: {}, target: TARGET, revisao: true, mode: "rag" });
    assert.deepEqual(resultado.diagnosticoRefinoAnterior.nosologico, ["Transtorno A", "Transtorno B"]);
    assert.deepEqual(resultado.diagnosticoRefinoAnterior.retiradas, ["Transtorno B"]);
    assert.match(firstPassView(resultado.diagnosticoRefinoAnterior, [["Nosológico", "nosologico"]]), /retiradas pela revisão:<\/strong> Transtorno B/);
  });

  it("geracao nova limpa a comparacao anterior", () => {
    const resultado = diagnosisSuggestionFromAi({ result: {}, target: TARGET, mode: "rag" });
    assert.equal(resultado.diagnosticoRefinoAnterior, null);
    assert.equal(firstPassView(null), "");
  });
});
