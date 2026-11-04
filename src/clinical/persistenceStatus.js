// Um retorno de rede antigo não pode declarar sincronizada uma edição nova.
// O ticket prende cada resultado à conta e à revisão que iniciou a operação.
export function createPersistenceStatus() {
  let ownerId = "";
  let revision = 0;
  let phase = "idle";
  const current = ticket => ticket?.ownerId === ownerId && ticket?.revision === revision;
  const ticket = () => ({ ownerId, revision });

  return {
    reset(nextOwnerId = "") { ownerId = nextOwnerId; revision++; phase = "idle"; },
    beginSave(nextOwnerId = "") {
      if (nextOwnerId !== ownerId) this.reset(nextOwnerId);
      revision++;
      phase = "saving";
      return ticket();
    },
    beginSync(nextOwnerId) {
      if (nextOwnerId !== ownerId) this.reset(nextOwnerId);
      revision++;
      phase = "syncing";
      return ticket();
    },
    localSaved(op) { if (current(op)) phase = "local"; },
    syncing(op) { if (current(op)) phase = "syncing"; },
    synced(op) { if (current(op)) phase = "synced"; },
    failed(op) { if (current(op)) phase = "failed"; },
    isCurrent: current,
    get phase() { return phase; }
  };
}
