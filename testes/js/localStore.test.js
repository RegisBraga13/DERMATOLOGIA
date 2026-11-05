// O estado do aparelho no IndexedDB, com o localStorage de reserva (14/09/2026).
// O localStorage chegava ao teto de ~5 MB entre 190 e 700 atendimentos.
//
// O Node nao tem IndexedDB nem localStorage: os dois entram aqui como memoria,
// com a mesma cara (get, put, remove) que o servico usa no navegador.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadStateFrom, saveStateTo } from "../../src/services/storageService.js";

const KEY = "regis_dermatologia_v1";

function memoria(inicial = {}, { falhaAoLer = false, falhaAoGravar = null, devolveOutraCoisa = false } = {}) {
  const dados = new Map(Object.entries(inicial));
  return {
    dados,
    get: async key => {
      if (falhaAoLer) throw new Error("indisponivel");
      return devolveOutraCoisa && dados.has(key) ? "{}" : (dados.get(key) ?? null);
    },
    put: async (key, value) => {
      if (falhaAoGravar) throw falhaAoGravar;
      dados.set(key, value);
    },
    remove: async key => { dados.delete(key); }
  };
}

const estadoObjeto = (...consultas) => ({ patients: [{ id: "p1", nome: "Maria" }], consultations: consultas, returns: [] });
const estado = (...consultas) => JSON.stringify(estadoObjeto(...consultas));

describe("leitura do aparelho", () => {
  it("primeira abertura: traz o localStorage para o IndexedDB e so entao apaga a copia antiga", async () => {
    const idb = memoria();
    const legacy = memoria({ [KEY]: estado({ id: "c1", createdAt: "2026-09-01" }) });
    const lido = await loadStateFrom({ idb, legacy });
    assert.equal(lido.backend, "indexeddb");
    assert.equal(lido.state.consultations.length, 1);
    assert.ok(idb.dados.has(`${KEY}:consultations`));
    assert.ok(!idb.dados.has(KEY));
    assert.ok(!legacy.dados.has(KEY));
  });

  it("se o IndexedDB nao devolve o que gravou, o localStorage fica", async () => {
    const idb = memoria({}, { devolveOutraCoisa: true });
    const legacy = memoria({ [KEY]: estado({ id: "c1" }) });
    const lido = await loadStateFrom({ idb, legacy });
    assert.equal(lido.state.consultations.length, 1);
    assert.ok(legacy.dados.has(KEY));
  });

  it("com as duas copias, junta por registro e fica a versao mais recente de cada um", async () => {
    const idb = memoria({ [KEY]: estado({ id: "c1", qphda: "antiga", updatedAt: "2026-09-01" }) });
    const legacy = memoria({ [KEY]: estado({ id: "c1", qphda: "nova", updatedAt: "2026-09-10" }, { id: "c2", updatedAt: "2026-09-10" }) });
    const lido = await loadStateFrom({ idb, legacy });
    assert.equal(lido.state.consultations.length, 2);
    assert.equal(lido.state.consultations.find(c => c.id === "c1").qphda, "nova");
    assert.ok(!legacy.dados.has(KEY));
  });

  it("sem IndexedDB, segue no localStorage como antes", async () => {
    const legacy = memoria({ [KEY]: estado({ id: "c1" }) });
    const lido = await loadStateFrom({ idb: memoria({}, { falhaAoLer: true }), legacy });
    assert.equal(lido.backend, "localstorage");
    assert.equal(lido.state.consultations.length, 1);
    assert.ok(legacy.dados.has(KEY));
  });

  it("aparelho novo abre vazio, sem erro", async () => {
    const lido = await loadStateFrom({ idb: memoria(), legacy: memoria() });
    assert.deepEqual(lido.state, { patients: [], consultations: [], returns: [] });
  });
});

describe("gravacao no aparelho", () => {
  it("grava no IndexedDB, uma chave por colecao, e nao toca no localStorage", async () => {
    const idb = memoria();
    const legacy = memoria();
    assert.equal(await saveStateTo({ idb, legacy }, estadoObjeto()), "");
    assert.ok(idb.dados.has(`${KEY}:patients`));
    assert.ok(idb.dados.has(`${KEY}:consultations`));
    assert.ok(!idb.dados.has(KEY));
    assert.ok(!legacy.dados.has(KEY));
  });

  it("so regrava a colecao cuja assinatura mudou", async () => {
    const idb = memoria();
    await saveStateTo({ idb, legacy: memoria() }, estadoObjeto({ id: "c1", updatedAt: "2026-09-01" }), ["patients", "consultations"]);
    await saveStateTo({ idb, legacy: memoria() }, estadoObjeto({ id: "c1", updatedAt: "2026-09-01" }), []);
    assert.ok(idb.dados.has(`${KEY}:consultations`));
    assert.ok(!idb.dados.has(`${KEY}:returns`));
  });

  it("IndexedDB falhando por outro motivo: grava no localStorage e nao avisa", async () => {
    const legacy = memoria();
    const erro = await saveStateTo({ idb: memoria({}, { falhaAoGravar: new Error("transacao abortada") }), legacy }, estadoObjeto());
    assert.equal(erro, "");
    assert.ok(legacy.dados.has(KEY));
  });

  it("cota estourada no IndexedDB avisa que a consulta NAO foi salva", async () => {
    const cheio = Object.assign(new Error("cheio"), { name: "QuotaExceededError" });
    const erro = await saveStateTo({ idb: memoria({}, { falhaAoGravar: cheio }), legacy: memoria() }, estadoObjeto());
    assert.match(erro, /NÃO foi salva/);
  });
});
