// Formato v2: uma linha por paciente/atendimento. A versão 1 continua ativa
// até a tabela existir, o acervo remoto ser copiado e o operador mudar a flag.
const PAGE_SIZE = 500;
const COLLECTIONS = [
  ["patients", "patient"],
  ["consultations", "consultation"],
  ["returns", "return"]
];

function rowsFromState(state, ownerId) {
  const rows = COLLECTIONS.flatMap(([collection, kind]) =>
    (state[collection] || []).filter(entry => entry?.id).map(entry => ({
      owner_id: ownerId, kind, record_id: entry.id,
      patient_id: kind === "patient" ? entry.id : entry.patientId || null,
      payload: entry
    })));
  rows.push({ owner_id: ownerId, kind: "meta", record_id: "app", patient_id: null,
    payload: { theme: state.theme, doctor: state.doctor } });
  return rows;
}

function stateFromRows(rows) {
  const state = { patients: [], consultations: [], returns: [] };
  for (const row of rows) {
    if (row.kind === "meta" && row.record_id === "app") {
      Object.assign(state, row.payload || {});
      continue;
    }
    const collection = COLLECTIONS.find(([, kind]) => kind === row.kind)?.[0];
    if (collection && row.payload?.id === row.record_id) state[collection].push(row.payload);
  }
  return state;
}

async function readRows(authorized, ownerId) {
  const rows = [];
  // Cursor por tipo/id: inserts anteriores ao cursor nao deslocam a pagina.
  for (const kind of ["consultation", "meta", "patient", "return"]) {
    let lastId = "";
    for (;;) {
      const cursor = lastId ? `&record_id=gt.${encodeURIComponent(lastId)}` : "";
      const response = await authorized(
        `/rest/v1/prontuario_registros?select=kind,record_id,payload,version&owner_id=eq.${encodeURIComponent(ownerId)}&kind=eq.${kind}${cursor}&order=record_id.asc&limit=${PAGE_SIZE}`,
        {}, true, ownerId);
      if (!response) return null;
      if (!response.ok) throw new Error("Não foi possível ler os registros separados. Confira a migração do banco.");
      const page = await response.json();
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
      lastId = page.at(-1).record_id;
    }
  }
  return rows;
}

async function readLegacyState(authorized, ownerId) {
  const response = await authorized(
    `/rest/v1/prontuarios?select=payload&owner_id=eq.${encodeURIComponent(ownerId)}&limit=1`,
    {}, true, ownerId);
  if (!response) return null;
  if (!response.ok) throw new Error("Não foi possível ler a cópia antiga do prontuário.");
  const [row] = await response.json();
  return row?.payload || { patients: [], consultations: [], returns: [] };
}

async function writeRow(authorized, row, previous, ownerId) {
  const common = { "Content-Type": "application/json", Prefer: "return=representation" };
  let response;
  if (previous) {
    response = await authorized(
      `/rest/v1/prontuario_registros?owner_id=eq.${encodeURIComponent(ownerId)}&kind=eq.${row.kind}&record_id=eq.${encodeURIComponent(row.record_id)}&version=eq.${previous.version}&select=record_id`,
      { method: "PATCH", headers: common,
        body: JSON.stringify({ payload: row.payload, patient_id: row.patient_id,
          version: Number(previous.version) + 1, updated_at: new Date().toISOString() }) },
      true, ownerId);
  } else {
    response = await authorized(
      "/rest/v1/prontuario_registros?on_conflict=owner_id,kind,record_id&select=record_id",
      { method: "POST",
        headers: { ...common, Prefer: "resolution=ignore-duplicates,return=representation" },
        body: JSON.stringify(row) }, true, ownerId);
  }
  if (!response) return null;
  if (!response.ok) throw new Error("Não foi possível sincronizar um registro separado.");
  return (await response.json()).length > 0;
}

export async function syncRecordRows(local, merge, authorized, ownerId, attempts = 3) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const remoteRows = await readRows(authorized, ownerId);
    if (!remoteRows) return null;
    const migrated = remoteRows.some(row => row.kind === "meta" && row.record_id === "_migration_v1");
    const legacy = migrated ? null : await readLegacyState(authorized, ownerId);
    if (!migrated && !legacy) return null; // a sessão mudou durante a leitura
    const remote = stateFromRows(remoteRows);
    const combined = merge(merge(local, legacy || {}), remote);
    const known = new Map(remoteRows.map(row => [`${row.kind}:${row.record_id}`, row]));
    let conflict = false;
    for (const row of rowsFromState(combined, ownerId)) {
      const previous = known.get(`${row.kind}:${row.record_id}`);
      if (previous && JSON.stringify(previous.payload) === JSON.stringify(row.payload)) continue;
      const written = await writeRow(authorized, row, previous, ownerId);
      if (written === null) return null;
      if (!written) { conflict = true; break; }
    }
    if (conflict) continue;
    if (!migrated) {
      const marker = await writeRow(authorized,
        { owner_id: ownerId, kind: "meta", record_id: "_migration_v1",
          patient_id: null, payload: { completed_at: new Date().toISOString() } }, null, ownerId);
      if (marker === null) return null;
      if (!marker) continue;
    }
    return combined;
  }
  throw new Error("Outro aparelho alterou registros durante a sincronização. Tente novamente.");
}
