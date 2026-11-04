// Formato v2: uma linha por paciente/atendimento. A versão 1 continua ativa
// até a tabela existir, o acervo remoto ser copiado e o operador mudar a flag.
const PAGE_SIZE = 500;
const COLLECTIONS = [
  ["patients", "patient"],
  ["consultations", "consultation"],
  ["returns", "return"]
];
const MANIFEST_PREFIX = "psires_sync_manifest_v2:";

// O JSONB pode devolver chaves em outra ordem. O resumo de cada versão precisa
// ser estável e não duplica conteúdo clínico no localStorage.
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(item => canonical(item ?? null)).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort()
    .filter(key => value[key] !== undefined)
    .map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

async function digest(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(value)));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}

function manifestFor(store, ownerId) {
  if (!store) throw new Error("Armazenamento local indisponível para controlar conflitos de sincronização.");
  try {
    const value = store.getItem(`${MANIFEST_PREFIX}${ownerId}`);
    const parsed = value ? JSON.parse(value) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw new Error("Não foi possível ler o controle local de versões. Sincronização interrompida.");
  }
}

function recordKey(row) { return `${row.kind}:${row.record_id}`; }

function replaceRecord(state, row) {
  if (row.kind === "meta") {
    Object.assign(state, row.payload);
    return;
  }
  const collection = COLLECTIONS.find(([, kind]) => kind === row.kind)?.[0];
  if (!collection) return;
  state[collection] = state[collection].map(entry => entry.id === row.record_id ? row.payload : entry);
}

export function resolveRecordConflict(conflict, choice, ownerId, store = globalThis.localStorage) {
  if (!conflict || !["local", "remote"].includes(choice) || conflict.ownerId !== ownerId)
    throw new Error("Conflito ou conta inválida.");
  const manifest = manifestFor(store, ownerId);
  // A próxima leitura valida de novo a versão: um terceiro aparelho pode ter
  // editado o registro enquanto o médico comparava as duas cópias.
  manifest[`${conflict.kind}:${conflict.recordId}`] = { hash: conflict.remoteHash, version: conflict.remoteVersion };
  store.setItem(`${MANIFEST_PREFIX}${ownerId}`, JSON.stringify(manifest));
  return choice === "remote" ? conflict.remote : conflict.local;
}

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

export async function syncRecordRows(local, merge, authorized, ownerId, attempts = 3, store = globalThis.localStorage) {
  const manifest = manifestFor(store, ownerId);
  for (let attempt = 0; attempt < attempts; attempt++) {
    const remoteRows = await readRows(authorized, ownerId);
    if (!remoteRows) return null;
    const migrated = remoteRows.some(row => row.kind === "meta" && row.record_id === "_migration_v1");
    const legacy = migrated ? null : await readLegacyState(authorized, ownerId);
    if (!migrated && !legacy) return null; // a sessão mudou durante a leitura
    const remote = stateFromRows(remoteRows);
    const combined = merge(merge(local, legacy || {}), remote);
    const known = new Map(remoteRows.map(row => [recordKey(row), row]));
    const localRows = new Map(rowsFromState(local, ownerId).map(row => [recordKey(row), row]));
    for (const remoteRow of remoteRows) {
      const key = recordKey(remoteRow);
      const localRow = localRows.get(key);
      const base = manifest[key];
      if (!base || !localRow || remoteRow.record_id === "_migration_v1") continue;
      const [localHash, remoteHash] = await Promise.all([digest(localRow.payload), digest(remoteRow.payload)]);
      const localChanged = localHash !== base.hash;
      const remoteChanged = remoteHash !== base.hash;
      if (localChanged && remoteChanged && localHash !== remoteHash) {
        const error = new Error("Duas edições diferentes do mesmo registro precisam ser revisadas antes de sincronizar.");
        error.conflict = { ownerId, kind: remoteRow.kind, recordId: remoteRow.record_id,
          local: localRow.payload, remote: remoteRow.payload, remoteHash, remoteVersion: remoteRow.version };
        throw error;
      }
      if (localChanged !== remoteChanged) replaceRecord(combined, localChanged ? localRow : remoteRow);
    }
    const nextManifest = { ...manifest };
    let conflict = false;
    for (const row of rowsFromState(combined, ownerId)) {
      const previous = known.get(recordKey(row));
      const rowHash = await digest(row.payload);
      if (!previous || await digest(previous.payload) !== rowHash) {
        const written = await writeRow(authorized, row, previous, ownerId);
        if (written === null) return null;
        if (!written) { conflict = true; break; }
      }
      nextManifest[recordKey(row)] = { hash: rowHash,
        version: previous ? Number(previous.version) + (await digest(previous.payload) === rowHash ? 0 : 1) : 1 };
    }
    if (conflict) continue;
    // Falha de quota não pode deixar um marcador remoto de migração concluída
    // sem o controle local necessário para detectar conflitos posteriores.
    store.setItem(`${MANIFEST_PREFIX}${ownerId}`, JSON.stringify(nextManifest));
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
