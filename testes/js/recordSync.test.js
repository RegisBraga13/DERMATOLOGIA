import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveRecordConflict, syncRecordRows } from "../../src/services/recordSyncService.js";
import { mergeStates, rebasePendingChanges } from "../../src/services/storageService.js";

const OWNER = "11111111-1111-4111-8111-111111111111";
const timestamp = "2026-10-01T12:00:00Z";
const patient = id => ({ id, nome: id, updatedAt: timestamp });
const blank = () => ({ patients: [], consultations: [], returns: [] });
const ok = value => ({ ok: true, json: async () => value });

function fakeDatabase(legacy = blank(), { collision = false } = {}) {
  const rows = new Map();
  const calls = [];
  const values = new Map();
  const storage = { getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value) };
  let collide = collision;
  const authorized = async (path, request = {}, retry, owner) => {
    assert.equal(owner, OWNER);
    calls.push([path, request.method || "GET"]);
    if (path.startsWith("/rest/v1/prontuarios?")) return ok([{ payload: legacy }]);
    const url = new URL(`https://example.test${path}`);
    assert.equal(url.searchParams.get("owner_id")?.replace("eq.", "") ?? OWNER, OWNER);
    if (request.method === "POST") {
      const row = JSON.parse(request.body);
      assert.equal(row.owner_id, OWNER);
      const key = `${row.kind}:${row.record_id}`;
      if (rows.has(key)) return ok([]);
      rows.set(key, { ...row, version: 1 });
      return ok([{ record_id: row.record_id }]);
    }
    if (request.method === "PATCH") {
      const key = `${url.searchParams.get("kind").slice(3)}:${url.searchParams.get("record_id").slice(3)}`;
      const previous = rows.get(key);
      const wanted = Number(url.searchParams.get("version").slice(3));
      if (collide) { collide = false; previous.version += 1; return ok([]); }
      if (previous.version !== wanted) return ok([]);
      rows.set(key, { ...previous, ...JSON.parse(request.body) });
      return ok([{ record_id: previous.record_id }]);
    }
    assert.equal(url.searchParams.get("order"), "record_id.asc");
    const kind = url.searchParams.get("kind").slice(3);
    const after = url.searchParams.get("record_id")?.slice(3) || "";
    const limit = Number(url.searchParams.get("limit"));
    return ok([...rows.values()].filter(row => row.kind === kind && row.record_id > after)
      .sort((a, b) => a.record_id < b.record_id ? -1 : a.record_id > b.record_id ? 1 : 0)
      .slice(0, limit));
  };
  return { rows, calls, authorized, storage, values };
}

const sync = (db, local) => syncRecordRows(local, mergeStates, db.authorized, OWNER, 3, db.storage);

describe("sincronização por registro (v2)", () => {
  it("copia a versão antiga, acrescenta o local e escreve marcador por último", async () => {
    const db = fakeDatabase({ ...blank(), patients: [patient("antigo")] });
    const local = { ...blank(), consultations: [{ id: "consulta", patientId: "antigo", updatedAt: timestamp }] };
    const result = await sync(db, local);
    assert.equal(result.patients[0].id, "antigo");
    assert.equal(db.rows.get("consultation:consulta").patient_id, "antigo");
    assert.deepEqual(db.rows.get("patient:antigo").payload, patient("antigo"));
    assert.equal(db.rows.get("meta:_migration_v1").owner_id, OWNER);
    assert.equal(db.calls.at(-1)[1], "POST");
  });

  it("não consulta a cópia antiga após a migração", async () => {
    const db = fakeDatabase({ ...blank(), patients: [patient("antigo")] });
    await sync(db, blank());
    db.calls.length = 0;
    const result = await sync(db, { ...blank(), patients: [patient("novo")] });
    assert.deepEqual(result.patients.map(row => row.id).sort(), ["antigo", "novo"]);
    assert.equal(db.calls.some(([path]) => path.startsWith("/rest/v1/prontuarios?")), false);
  });

  it("repete a leitura após uma disputa de versão da mesma linha", async () => {
    const db = fakeDatabase(blank());
    await sync(db, { ...blank(), patients: [patient("p")] });
    const changed = { ...patient("p"), nome: "editado", updatedAt: "2026-10-02T12:00:00Z" };
    const replay = fakeDatabase(blank(), { collision: true });
    replay.rows.clear();
    for (const [key, row] of db.rows) replay.rows.set(key, structuredClone(row));
    for (const [key, value] of db.values) replay.storage.setItem(key, value);
    await sync(replay, { ...blank(), patients: [changed] });
    assert.equal(replay.rows.get("patient:p").payload.nome, "editado");
    assert.equal(replay.rows.get("patient:p").version, 3);
  });

  it("não grava após mudança de sessão durante a leitura", async () => {
    const db = fakeDatabase(blank());
    const result = await syncRecordRows(blank(), mergeStates, async () => null, OWNER, 3, db.storage);
    assert.equal(result, null);
    assert.equal(db.rows.size, 0);
  });

  it("pagina mais de 500 registros sem depender de offsets", async () => {
    const db = fakeDatabase(blank());
    for (let index = 0; index < 505; index++) {
      const id = `p${String(index).padStart(4, "0")}`;
      db.rows.set(`patient:${id}`, { kind: "patient", record_id: id,
        payload: patient(id), version: 1 });
    }
    const result = await sync(db, blank());
    assert.equal(result.patients.length, 505);
    assert.equal(db.rows.get("meta:_migration_v1")?.owner_id, OWNER);
    assert.equal(db.calls.some(([path]) => path.includes("offset=")), false);
    assert.equal(db.calls.some(([path]) => path.includes("record_id=gt.p0499")), true);
  });

  it("bloqueia duas edições independentes e preserva ambas para revisão", async () => {
    const db = fakeDatabase(blank());
    await sync(db, { ...blank(), patients: [patient("p")] });
    const local = { ...patient("p"), nome: "versão local", updatedAt: "2026-10-03T12:00:00Z" };
    const remote = { ...patient("p"), nome: "versão remota", updatedAt: "2026-10-02T12:00:00Z" };
    db.rows.get("patient:p").payload = remote;
    db.rows.get("patient:p").version = 2;
    const before = db.calls.length;
    let conflict;
    try { await sync(db, { ...blank(), patients: [local] }); }
    catch (error) { conflict = error.conflict; }
    assert.deepEqual(conflict.local, local);
    assert.deepEqual(conflict.remote, remote);
    assert.equal(db.calls.slice(before).some(([, method]) => method !== "GET"), false);
    assert.deepEqual(db.rows.get("patient:p").payload, remote);
    assert.deepEqual(resolveRecordConflict(conflict, "remote", OWNER, db.storage), remote);
    await sync(db, { ...blank(), patients: [remote] });
    assert.deepEqual(db.rows.get("patient:p").payload, remote);
  });

  it("a escolha explícita da cópia local grava com a versão remota atual", async () => {
    const db = fakeDatabase(blank());
    await sync(db, { ...blank(), patients: [patient("p")] });
    const local = { ...patient("p"), nome: "local", updatedAt: "2026-10-03T12:00:00Z" };
    db.rows.get("patient:p").payload = { ...patient("p"), nome: "remota", updatedAt: "2026-10-02T12:00:00Z" };
    db.rows.get("patient:p").version = 2;
    let conflict;
    try { await sync(db, { ...blank(), patients: [local] }); }
    catch (error) { conflict = error.conflict; }
    assert.deepEqual(resolveRecordConflict(conflict, "local", OWNER, db.storage), local);
    await sync(db, { ...blank(), patients: [local] });
    assert.deepEqual(db.rows.get("patient:p").payload, local);
    assert.equal(db.rows.get("patient:p").version, 3);
  });

  it("uma mudança somente no servidor vence mesmo com relógio local adiantado", async () => {
    const db = fakeDatabase(blank());
    const baseline = { ...patient("p"), updatedAt: "2030-01-01T12:00:00Z" };
    await sync(db, { ...blank(), patients: [baseline] });
    const remote = { ...patient("p"), nome: "remota", updatedAt: "2026-10-02T12:00:00Z" };
    db.rows.get("patient:p").payload = remote;
    db.rows.get("patient:p").version = 2;
    const result = await sync(db, { ...blank(), patients: [baseline] });
    assert.deepEqual(result.patients[0], remote);
  });

  it("não marca a migração como concluída se o controle local falhar", async () => {
    const db = fakeDatabase(blank());
    const unavailable = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
    await assert.rejects(syncRecordRows({ ...blank(), patients: [patient("p")] },
      mergeStates, db.authorized, OWNER, 3, unavailable), /quota/);
    assert.equal(db.rows.has("meta:_migration_v1"), false);
  });

  it("a interface aceita a cópia remota escolhida e preserva edição iniciada durante a rede", () => {
    const before = { ...blank(), patients: [{ ...patient("p"), updatedAt: "2030-01-01T00:00:00Z" }] };
    const synced = { ...blank(), patients: [{ ...patient("p"), nome: "remota", updatedAt: timestamp }] };
    assert.equal(rebasePendingChanges(before, structuredClone(before), synced).patients[0].nome, "remota");
    const during = { ...before, consultations: [{ id: "nova", patientId: "p" }] };
    const result = rebasePendingChanges(before, during, synced);
    assert.equal(result.patients[0].nome, "remota");
    assert.equal(result.consultations[0].id, "nova");
  });
});
