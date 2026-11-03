import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { syncRecordRows } from "../../src/services/recordSyncService.js";
import { mergeStates } from "../../src/services/storageService.js";

const OWNER = "11111111-1111-4111-8111-111111111111";
const timestamp = "2026-10-01T12:00:00Z";
const patient = id => ({ id, nome: id, updatedAt: timestamp });
const blank = () => ({ patients: [], consultations: [], returns: [] });
const ok = value => ({ ok: true, json: async () => value });

function fakeDatabase(legacy = blank(), { collision = false } = {}) {
  const rows = new Map();
  const calls = [];
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
  return { rows, calls, authorized };
}

describe("sincronização por registro (v2)", () => {
  it("copia a versão antiga, acrescenta o local e escreve marcador por último", async () => {
    const db = fakeDatabase({ ...blank(), patients: [patient("antigo")] });
    const local = { ...blank(), consultations: [{ id: "consulta", patientId: "antigo", updatedAt: timestamp }] };
    const result = await syncRecordRows(local, mergeStates, db.authorized, OWNER);
    assert.equal(result.patients[0].id, "antigo");
    assert.equal(db.rows.get("consultation:consulta").patient_id, "antigo");
    assert.deepEqual(db.rows.get("patient:antigo").payload, patient("antigo"));
    assert.equal(db.rows.get("meta:_migration_v1").owner_id, OWNER);
    assert.equal(db.calls.at(-1)[1], "POST");
  });

  it("não consulta a cópia antiga após a migração", async () => {
    const db = fakeDatabase({ ...blank(), patients: [patient("antigo")] });
    await syncRecordRows(blank(), mergeStates, db.authorized, OWNER);
    db.calls.length = 0;
    const result = await syncRecordRows({ ...blank(), patients: [patient("novo")] }, mergeStates, db.authorized, OWNER);
    assert.deepEqual(result.patients.map(row => row.id).sort(), ["antigo", "novo"]);
    assert.equal(db.calls.some(([path]) => path.startsWith("/rest/v1/prontuarios?")), false);
  });

  it("repete a leitura após uma disputa de versão da mesma linha", async () => {
    const db = fakeDatabase(blank());
    await syncRecordRows({ ...blank(), patients: [patient("p")] }, mergeStates, db.authorized, OWNER);
    const changed = { ...patient("p"), nome: "editado", updatedAt: "2026-10-02T12:00:00Z" };
    const replay = fakeDatabase(blank(), { collision: true });
    replay.rows.clear();
    for (const [key, row] of db.rows) replay.rows.set(key, structuredClone(row));
    await syncRecordRows({ ...blank(), patients: [changed] }, mergeStates, replay.authorized, OWNER);
    assert.equal(replay.rows.get("patient:p").payload.nome, "editado");
    assert.equal(replay.rows.get("patient:p").version, 3);
  });

  it("não grava após mudança de sessão durante a leitura", async () => {
    const db = fakeDatabase(blank());
    const result = await syncRecordRows(blank(), mergeStates, async () => null, OWNER);
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
    const result = await syncRecordRows(blank(), mergeStates, db.authorized, OWNER);
    assert.equal(result.patients.length, 505);
    assert.equal(db.rows.get("meta:_migration_v1")?.owner_id, OWNER);
    assert.equal(db.calls.some(([path]) => path.includes("offset=")), false);
    assert.equal(db.calls.some(([path]) => path.includes("record_id=gt.p0499")), true);
  });
});
