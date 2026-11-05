import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadStateFrom, saveStateTo } from "../../src/services/storageService.js";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const OLD_KEY = "regis_dermatologia_v1";

function memory(initial = {}) {
  const entries = new Map(Object.entries(initial));
  return {
    entries,
    get: async key => entries.get(key) ?? null,
    put: async (key, value) => { entries.set(key, value); },
    remove: async key => { entries.delete(key); }
  };
}

const state = name => ({
  patients: [{ id: name, nome: name, updatedAt: "2026-10-01T12:00:00Z" }],
  consultations: [], returns: []
});

describe("isolamento dos dados locais por conta", () => {
  it("uma conta não lê nem sobrescreve prontuários da outra", async () => {
    const stores = { idb: memory(), legacy: memory() };
    await saveStateTo(stores, state("Ana"), undefined, A);
    await saveStateTo(stores, state("Bia"), undefined, B);
    assert.deepEqual((await loadStateFrom(stores, A)).state.patients.map(p => p.nome), ["Ana"]);
    assert.deepEqual((await loadStateFrom(stores, B)).state.patients.map(p => p.nome), ["Bia"]);
  });

  it("dados antigos sem conta não são herdados no login", async () => {
    const stores = { idb: memory({ [OLD_KEY]: JSON.stringify(state("Antigo")) }), legacy: memory() };
    assert.deepEqual((await loadStateFrom(stores, A)).state.patients, []);
    assert.deepEqual((await loadStateFrom(stores)).state.patients.map(p => p.nome), ["Antigo"]);
  });

  it("fallback local também usa chave separada por conta", async () => {
    const stores = { idb: null, legacy: memory() };
    await saveStateTo(stores, state("Ana"), undefined, A);
    assert.deepEqual((await loadStateFrom(stores, B)).state.patients, []);
    assert.deepEqual((await loadStateFrom(stores, A)).state.patients.map(p => p.nome), ["Ana"]);
  });
});
