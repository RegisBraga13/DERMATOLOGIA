import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { archiveSyncConflict, authHeaders, verifiedSession } from "../../src/services/supabaseService.js";

const USER = "11111111-1111-4111-8111-111111111111";
let session;
let remoteUser;
let refreshes;

beforeEach(() => {
  session = { access_token: "old", refresh_token: "refresh-old",
    expires_at: Math.floor(Date.now() / 1000) - 10, user: { id: USER } };
  remoteUser = USER;
  refreshes = 0;
  globalThis.sessionStorage = {
    getItem: () => session ? JSON.stringify(session) : null,
    setItem: (_, value) => { session = JSON.parse(value); },
    removeItem: () => { session = null; }
  };
  globalThis.fetch = async url => {
    if (url === "/api/supabase-config")
      return { ok: true, json: async () => ({ url: "https://auth.example", key: "public" }) };
    if (url.includes("refresh_token")) {
      refreshes++;
      return { ok: true, json: async () => ({
        access_token: "new", refresh_token: "refresh-new",
        expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: USER }
      }) };
    }
    return { ok: Boolean(remoteUser), status: remoteUser ? 200 : 401,
      json: async () => ({ id: remoteUser }) };
  };
});

describe("sessão antes de abrir o prontuário local", () => {
  it("renova o token expirado antes de chamar a IA", async () => {
    assert.deepEqual(await authHeaders(), { Authorization: "Bearer new" });
    assert.equal(refreshes, 1);
  });
  it("não confia somente no usuário guardado no navegador", async () => {
    remoteUser = "22222222-2222-4222-8222-222222222222";
    assert.equal(await verifiedSession(), null);
    assert.equal(session, null);
  });
  it("aceita somente a conta confirmada pelo servidor", async () => {
    assert.equal((await verifiedSession()).user.id, USER);
  });
  it("arquiva ambas as versões somente na conta autenticada antes da escolha", async () => {
    let request;
    globalThis.fetch = async (url, options) => {
      if (url === "/api/supabase-config")
        return { ok: true, json: async () => ({ url: "https://auth.example", key: "public" }) };
      request = { url, options };
      return { ok: true, status: 201 };
    };
    const conflict = { ownerId: USER, kind: "patient", recordId: "p1",
      local: { id: "p1", nome: "local" }, remote: { id: "p1", nome: "remota" }, remoteVersion: 2 };
    await archiveSyncConflict(conflict, "local", USER);
    assert.equal(request.options.method, "POST");
    assert.equal(request.url, "https://auth.example/rest/v1/prontuario_conflitos");
    assert.deepEqual(JSON.parse(request.options.body).remote_payload, conflict.remote);
    await assert.rejects(archiveSyncConflict(conflict, "remote", "outra-conta"));
  });
});
