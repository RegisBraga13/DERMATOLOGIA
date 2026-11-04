import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPersistenceStatus } from "../../src/clinical/persistenceStatus.js";

describe("estado de gravação e sincronização", () => {
  it("distingue gravação local de confirmação remota", () => {
    const status = createPersistenceStatus();
    const save = status.beginSave("conta-a");
    assert.equal(status.phase, "saving");
    status.localSaved(save);
    assert.equal(status.phase, "local");
    status.syncing(save);
    assert.equal(status.phase, "syncing");
    status.synced(save);
    assert.equal(status.phase, "synced");
  });

  it("uma resposta atrasada não confirma a edição posterior", () => {
    const status = createPersistenceStatus();
    const first = status.beginSave("conta-a");
    status.localSaved(first);
    status.syncing(first);
    const second = status.beginSave("conta-a");
    assert.equal(status.isCurrent(first), false);
    assert.equal(status.isCurrent(second), true);
    status.synced(first);
    assert.equal(status.phase, "saving");
    status.localSaved(second);
    status.failed(first);
    assert.equal(status.phase, "local");
    status.syncing(second);
    status.synced(second);
    assert.equal(status.phase, "synced");
  });

  it("logout e troca de conta invalidam operações pendentes", () => {
    const status = createPersistenceStatus();
    const old = status.beginSave("conta-a");
    status.reset();
    const next = status.beginSync("conta-b");
    assert.equal(status.isCurrent(old), false);
    status.synced(old);
    assert.equal(status.phase, "syncing");
    status.failed(next);
    assert.equal(status.phase, "failed");
  });
});
