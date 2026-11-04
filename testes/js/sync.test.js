// Sincronizacao com a conta, desde 11/09/2026: le a copia, junta e grava so se
// ninguem gravou no meio. Antes cada gravacao subia o estado deste aparelho por
// cima da copia da conta, e o que outro aparelho tinha criado sumia dela.
//
// A conta aqui e falsa: um objeto que responde como o PostgREST do Supabase.
//
// Rodar a partir da raiz do projeto:
//     node --test 'testes/js/*.test.js'
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { mergeStates } from "../../src/services/storageService.js";
import { syncState } from "../../src/services/supabaseService.js";

let conta;

function contaFalsa(linha = null) {
  const falsa = { linha, versao: 1, antesDoPatch: null, antesDoPost: null, patches: 0 };
  const resposta = dados => ({ ok: true, status: 200, json: async () => dados });
  globalThis.sessionStorage = {
    getItem: () => JSON.stringify({ access_token: "t", user: { id: "u1" } }),
    setItem() {},
    removeItem() {}
  };
  globalThis.fetch = async (url, options = {}) => {
    if (url === "/api/supabase-config") return resposta({ url: "https://conta.falsa", key: "k" });
    const metodo = options.method || "GET";
    if (metodo === "GET") return resposta(falsa.linha ? [structuredClone(falsa.linha)] : []);
    const corpo = JSON.parse(options.body);
    if (metodo === "POST") {
      if (falsa.antesDoPost) {
        const outro = falsa.antesDoPost;
        falsa.antesDoPost = null;
        outro(falsa);
        return { ok: false, status: 409 };
      }
      falsa.linha = { id: "row1", payload: corpo.payload, updated_at: "v1" };
      return resposta(null);
    }
    // PATCH: o outro aparelho pode gravar entre a leitura e esta escrita.
    falsa.patches += 1;
    if (falsa.antesDoPatch) { const outro = falsa.antesDoPatch; falsa.antesDoPatch = null; outro(falsa); }
    const lida = new URL(url).searchParams.get("updated_at");
    if (lida !== `eq.${falsa.linha.updated_at}`) return resposta([]);
    falsa.versao += 1;
    falsa.linha = { ...falsa.linha, payload: corpo.payload, updated_at: `v${falsa.versao}` };
    return resposta([{ id: falsa.linha.id }]);
  };
  return falsa;
}

const paciente = (id, nome) => ({ id, nome, createdAt: "2026-09-11T10:00:00.000Z" });
const estadoCom = (...pacientes) => ({ patients: pacientes, consultations: [], returns: [] });
const ids = state => state.patients.map(item => item.id).sort();

describe("sincronizacao com a conta", () => {
  beforeEach(() => { conta = null; });

  it("junta a copia da conta com a deste aparelho, e a conta fica com as duas", async () => {
    conta = contaFalsa({ id: "row1", payload: estadoCom(paciente("p2", "Joao")), updated_at: "v1" });
    const juntos = await syncState(estadoCom(paciente("p1", "Maria")), mergeStates);
    assert.deepEqual(ids(juntos), ["p1", "p2"]);
    assert.deepEqual(ids(conta.linha.payload), ["p1", "p2"]);
  });

  it("sem copia na conta, cria a primeira", async () => {
    conta = contaFalsa(null);
    const juntos = await syncState(estadoCom(paciente("p1", "Maria")), mergeStates);
    assert.deepEqual(ids(juntos), ["p1"]);
    assert.deepEqual(ids(conta.linha.payload), ["p1"]);
  });

  it("outro aparelho grava no meio: a volta recomeca e nada se perde", async () => {
    conta = contaFalsa({ id: "row1", payload: estadoCom(paciente("p2", "Joao")), updated_at: "v1" });
    conta.antesDoPatch = falsa => {
      falsa.linha = { ...falsa.linha, payload: estadoCom(paciente("p2", "Joao"), paciente("p3", "Ana")), updated_at: "outro" };
    };
    const juntos = await syncState(estadoCom(paciente("p1", "Maria")), mergeStates);
    assert.equal(conta.patches, 2);
    assert.deepEqual(ids(juntos), ["p1", "p2", "p3"]);
    assert.deepEqual(ids(conta.linha.payload), ["p1", "p2", "p3"]);
  });

  it("dois primeiros acessos disputam o insert: relê a linha única", async () => {
    conta = contaFalsa(null);
    conta.antesDoPost = falsa => {
      falsa.linha = { id: "row1", payload: estadoCom(paciente("p2", "Joao")), updated_at: "v1" };
    };
    const juntos = await syncState(estadoCom(paciente("p1", "Maria")), mergeStates);
    assert.deepEqual(ids(juntos), ["p1", "p2"]);
    assert.deepEqual(ids(conta.linha.payload), ["p1", "p2"]);
    assert.equal(conta.patches, 1);
  });

  it("sem sessao nao sincroniza", async () => {
    conta = contaFalsa(null);
    globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
    assert.equal(await syncState(estadoCom(paciente("p1", "Maria")), mergeStates), null);
    assert.equal(conta.linha, null);
  });
});
