const KEY = "regis_dermatologia_v1";
const DB_NAME = "prontuario_dermatologico";
const DB_STORE = "estado";
// Dados criados antes da separação por conta continuam nas chaves antigas.
// Jamais são associados a um usuário por inferência: a importação exige ação
// explícita do médico autenticado.
function scopedKey(key, ownerId = "") {
  if (!ownerId) return key;
  if (!/^[0-9a-f-]{36}$/i.test(ownerId)) throw new Error("Identidade da conta inválida.");
  return `${KEY}:owner:${ownerId}:${key.slice(KEY.length + 1) || "state"}`;
}

function scopedCollectionKeys(ownerId = "") {
  return Object.fromEntries(Object.entries(COLLECTION_KEYS).map(([name, key]) => [name, scopedKey(key, ownerId)]));
}

// O ESTADO DO APARELHO MORA NO INDEXEDDB desde 14/09/2026.
//
// O localStorage tem teto de uns 5 MB. Medido no mesmo dia: 20 consultas davam
// 100 KB, a maior 27 KB -- o teto chegava entre 190 e 700 atendimentos, e ali a
// consulta deixava de ser salva neste aparelho. O IndexedDB guarda centenas de
// MB. O localStorage continua como reserva: navegador sem IndexedDB (janela
// privada em alguns Safari) segue gravando como antes.
//
// O texto gravado e o mesmo JSON de sempre, serializado NA HORA de salvar: a
// gravacao e assincrona, e o estado pode mudar enquanto ela espera a vez.
function emptyState() {
  return { patients: [], consultations: [], returns: [] };
}

function parseState(texto) {
  const state = JSON.parse(texto) || emptyState();
  (state.returns || []).forEach(entry => {
    if (/^Retorno\s+\d+$/i.test(entry.label || "")) entry.label = "Retorno";
  });
  return state;
}

// Uma chave por colecao (patients, consultations, returns) mais uma para o
// que nao e prontuario (theme, doctor), desde 22/09/2026. Antes tudo isto era
// UM blob so sob a chave KEY: qualquer gravacao -- inclusive trocar o tema --
// serializava e regravava o prontuario inteiro. Agora so a colecao que mudou
// e regravada. KEY continua existindo, mas so como fonte de migracao: nunca
// mais e escrita.
const COLLECTION_KEYS = {
  patients: `${KEY}:patients`,
  consultations: `${KEY}:consultations`,
  returns: `${KEY}:returns`,
  meta: `${KEY}:meta`
};

function collectionValue(state, campo) {
  return campo === "meta" ? { theme: state.theme, doctor: state.doctor } : (state[campo] || []);
}

// Fingerprint por registro (id + timestamp), e nao o registro inteiro: o que
// decide se uma colecao precisa ser regravada e comparado por aqui, e nao por
// igualdade de referencia. upsert() (App.js) muta o array de state no lugar
// -- o mesmo array, com um item trocado -- entao comparar por `===` nunca
// veria a mudanca.
function collectionSignature(entries = []) {
  return (entries || []).map(entry => `${entry?.id}:${entry?.updatedAt || entry?.createdAt || ""}`).join(",");
}

function stateSignatures(state = {}) {
  const assinaturas = {};
  Object.keys(COLLECTION_KEYS).forEach(campo => {
    assinaturas[campo] = campo === "meta" ? JSON.stringify(collectionValue(state, campo)) : collectionSignature(state[campo]);
  });
  return assinaturas;
}

function storageMessage(error) {
  // Todo navegador usa um nome diferente para o mesmo estouro. O codigo 22 e
  // o do padrao antigo, ainda emitido pelo Safari.
  const cheio = error?.name === "QuotaExceededError"
    || error?.name === "NS_ERROR_DOM_QUOTA_REACHED"
    || error?.code === 22;
  return cheio
    ? "O armazenamento deste navegador está cheio. A consulta NÃO foi salva neste aparelho. Exporte ou apague consultas antigas antes de continuar."
    : `Não foi possível salvar neste aparelho: ${error?.message || "erro desconhecido"}.`;
}

// Os dois lugares, com a mesma cara: get, put e remove de um texto por chave.
function indexedDbBackend(factory = globalThis.indexedDB) {
  if (!factory) return null;
  let aberto;
  const banco = () => (aberto ||= new Promise((resolve, reject) => {
    const pedido = factory.open(DB_NAME, 1);
    pedido.onupgradeneeded = () => pedido.result.createObjectStore(DB_STORE);
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(pedido.error);
    pedido.onblocked = () => reject(new Error("IndexedDB bloqueado por outra aba."));
  }));
  const transacao = (modo, operacao) => banco().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, modo);
    const pedido = operacao(tx.objectStore(DB_STORE));
    // So vale quando a transacao fecha: put "com sucesso" numa transacao que
    // aborta depois (cota estourada) nao gravou nada.
    tx.oncomplete = () => resolve(pedido.result);
    tx.onerror = () => reject(tx.error || pedido.error);
    tx.onabort = () => reject(tx.error || new Error("Gravacao interrompida."));
  }));
  return {
    get: key => transacao("readonly", store => store.get(key)),
    put: (key, value) => transacao("readwrite", store => store.put(value, key)),
    remove: key => transacao("readwrite", store => store.delete(key))
  };
}

function localStorageBackend(storage = globalThis.localStorage) {
  if (!storage) return null;
  return {
    get: async key => storage.getItem(key),
    put: async (key, value) => storage.setItem(key, value),
    remove: async key => storage.removeItem(key)
  };
}

// Le as 4 chaves por colecao. Nenhuma delas existindo ainda, tenta o blob
// unico antigo (KEY) — aparelho que nunca abriu depois de 22/09/2026. O blob
// antigo nunca e apagado por aqui, so deixa de ser escrito: uma migracao que
// falhe no meio nao perde nada, a proxima abertura tenta de novo a partir do
// mesmo blob intacto.
async function readIdbState(idb, ownerId = "") {
  const keys = scopedCollectionKeys(ownerId);
  const entradas = await Promise.all(
    Object.entries(keys).map(async ([campo, chave]) => [campo, await idb.get(chave)])
  );
  if (entradas.every(([, texto]) => texto == null)) {
    const antigo = await idb.get(scopedKey(KEY, ownerId));
    return antigo ? parseState(antigo) : null;
  }
  const estado = emptyState();
  entradas.forEach(([campo, texto]) => {
    if (texto == null) return;
    if (campo === "meta") Object.assign(estado, JSON.parse(texto));
    else estado[campo] = JSON.parse(texto);
  });
  return estado;
}

async function writeIdbState(idb, state, colecoes = Object.keys(COLLECTION_KEYS), ownerId = "") {
  const keys = scopedCollectionKeys(ownerId);
  await Promise.all(colecoes.map(campo => idb.put(keys[campo], JSON.stringify(collectionValue(state, campo)))));
}

// Le o estado e, na primeira vez, traz para o IndexedDB o que estava no
// localStorage. A copia antiga so sai depois de relida e conferida no
// IndexedDB -- gravacao que nao confere deixa as duas onde estao.
//
// Se as duas existirem (migracao interrompida, ou o IndexedDB falhou numa sessao
// e a gravacao caiu no localStorage), junta por registro, pela mesma regra da
// conta: fica a versao mais recente de cada um, e nada se perde.
export async function loadStateFrom({ idb, legacy }, ownerId = "") {
  let estadoIdb = null;
  let idbOk = Boolean(idb);
  if (idb) {
    try { estadoIdb = await readIdbState(idb, ownerId); } catch { idbOk = false; }
  }
  let legadoTexto = null;
  try { legadoTexto = legacy ? await legacy.get(scopedKey(KEY, ownerId)) : null; } catch { legadoTexto = null; }

  try {
    if (!idbOk) {
      return { state: legadoTexto ? parseState(legadoTexto) : emptyState(), backend: "localstorage", aviso: "" };
    }
    if (!legadoTexto) {
      return { state: estadoIdb || emptyState(), backend: "indexeddb", aviso: "" };
    }
    const legado = parseState(legadoTexto);
    const state = estadoIdb ? mergeStates(estadoIdb, legado) : legado;
    try {
      await writeIdbState(idb, state, Object.keys(COLLECTION_KEYS), ownerId);
      const confirmado = await readIdbState(idb, ownerId);
      if (confirmado && stateSignature(confirmado) === stateSignature(state)) await legacy.remove(scopedKey(KEY, ownerId));
    } catch {
      // Nao conferiu: o localStorage fica, e a proxima abertura tenta de novo.
    }
    return { state, backend: "indexeddb", aviso: "" };
  } catch {
    return { state: emptyState(), backend: idbOk ? "indexeddb" : "localstorage", aviso: "" };
  }
}

// Grava so as colecoes de `colecoes` no IndexedDB (por omissao, todas -- quem
// quer o ganho de so regravar o que mudou passa a lista explicita, ver
// saveState). Se o IndexedDB falhar por outro motivo que nao a cota, tenta o
// localStorage antes de avisar: ali ainda e o blob inteiro, de proposito --
// e so a via de emergencia, sem o mesmo volume de gravacoes que o IndexedDB.
export async function saveStateTo({ idb, legacy }, state, colecoes = Object.keys(COLLECTION_KEYS), ownerId = "") {
  if (idb) {
    try {
      await writeIdbState(idb, state, colecoes, ownerId);
      return "";
    } catch (error) {
      if (error?.name === "QuotaExceededError" || !legacy) return storageMessage(error);
    }
  }
  if (!legacy) return "Não foi possível salvar neste aparelho: o navegador não oferece armazenamento.";
  try {
    await legacy.put(scopedKey(KEY, ownerId), JSON.stringify(state));
    return "";
  } catch (error) {
    return storageMessage(error);
  }
}

let backends;
let filaDeGravacao = Promise.resolve("");
// A ultima assinatura de cada colecao efetivamente gravada. E o que decide o
// que saveState precisa regravar: colecao cuja assinatura nao mudou desde a
// ultima gravacao confirmada fica de fora da vez. So avanca quando a gravacao
// realmente confirma (sem erro) -- numa falha, a proxima chamada tenta de
// novo a mesma colecao, porque a assinatura registrada ainda e a antiga.
const assinaturasGravadas = new Map();

function defaultBackends() {
  return (backends ||= { idb: indexedDbBackend(), legacy: localStorageBackend() });
}

export async function loadState(ownerId = "") {
  const lido = await loadStateFrom(defaultBackends(), ownerId);
  if (lido.backend === "localstorage") backends = { idb: null, legacy: backends.legacy };
  // Zerado, e nao preenchido com a assinatura do que acabou de ler: garante
  // que a primeira gravacao da sessao sempre grava tudo, mesmo se a leitura
  // veio do blob antigo (formato que as chaves por colecao ainda nao tem).
  assinaturasGravadas.delete(ownerId);
  return lido;
}

export async function unassignedLocalState() {
  const { state } = await loadStateFrom(defaultBackends());
  return state;
}

// Aqui a falha vira valor de retorno: string vazia quando gravou, mensagem
// quando nao gravou. Quem chama decide o que fazer com ela — e o App poe na
// barra de status, junto do aviso de sincronizacao. As gravacoes entram numa
// fila: a de agora nunca termina depois da seguinte e sobrescreve a mais nova.
export function saveState(state, ownerId = "") {
  // Captura a versão e a conta no clique; a fila pode executar depois de Sair.
  const snapshot = structuredClone(state);
  const assinaturasAtuais = stateSignatures(snapshot);
  filaDeGravacao = filaDeGravacao.then(async () => {
    const gravadas = assinaturasGravadas.get(ownerId) || {};
    const mudou = Object.keys(COLLECTION_KEYS).filter(campo => assinaturasAtuais[campo] !== gravadas[campo]);
    const erro = await saveStateTo(defaultBackends(), snapshot, mudou, ownerId);
    if (!erro) assinaturasGravadas.set(ownerId, assinaturasAtuais);
    return erro;
  });
  return filaDeGravacao;
}

export function waitForLocalSave() {
  return filaDeGravacao;
}

export function uid(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function entryStamp(entry) {
  return Date.parse(entry?.updatedAt || entry?.createdAt || "") || 0;
}

function mergeById(local = [], remote = []) {
  const byId = new Map();
  const semId = [];
  // Remoto primeiro, local depois: em empate de horario o aparelho do medico
  // ganha, porque foi onde a consulta acabou de ser escrita.
  [...(remote || []), ...(local || [])].forEach(entry => {
    if (!entry) return;
    if (!entry.id) { semId.push(entry); return; }
    const atual = byId.get(entry.id);
    if (!atual) { byId.set(entry.id, entry); return; }
    // Exclusao definitiva nao volta, nem diante de uma edicao mais recente
    // feita em outro aparelho antes de ele saber da exclusao.
    if (atual.excluidoEm && !entry.excluidoEm) return;
    if (entry.excluidoEm && !atual.excluidoEm) { byId.set(entry.id, entry); return; }
    if (entryStamp(entry) >= entryStamp(atual)) byId.set(entry.id, entry);
  });
  return [...byId.values(), ...semId];
}

// Une as duas copias em vez de deixar a remota sobrescrever a local.
//
// Antes o arranque fazia `state = remoteState`. Bastava a sincronizacao falhar
// por um tempo — token vencido, rede fora — para o proximo carregamento
// apagar tudo o que tinha sido escrito nesse intervalo, sem aviso nenhum. Uma
// consulta inteira sumia.
//
// A uniao e por id, ficando a versao mais recente de cada registro. Ate
// 11/09/2026 a exclusao nao se propagava: o registro apagado num aparelho
// voltava pela copia do outro. Agora nada sai do estado -- arquivar e
// excluir sao marcas (arquivadoEm, excluidoEm) com updatedAt novo, e a marca
// viaja como qualquer outra edicao.
export function mergeStates(local = {}, remote = {}) {
  const merged = { ...remote, ...local };
  ["patients", "consultations", "returns"].forEach(key => {
    merged[key] = mergeById(local[key], remote[key]);
  });
  return merged;
}

// Aplica ao resultado do servidor apenas as edições feitas nesta aba enquanto
// a chamada de rede estava em andamento. Não reintroduz uma cópia antiga com
// relógio adiantado sobre a versão remota escolhida pelo sincronizador.
export function rebasePendingChanges(before = {}, current = {}, synced = {}) {
  const result = { ...synced };
  for (const key of ["patients", "consultations", "returns"]) {
    const old = new Map((before[key] || []).filter(entry => entry?.id).map(entry => [entry.id, entry]));
    const now = new Map((current[key] || []).filter(entry => entry?.id).map(entry => [entry.id, entry]));
    const next = new Map((synced[key] || []).filter(entry => entry?.id).map(entry => [entry.id, entry]));
    for (const [id, entry] of now) {
      if (!old.has(id) || JSON.stringify(entry) !== JSON.stringify(old.get(id))) next.set(id, entry);
    }
    for (const id of old.keys()) if (!now.has(id)) next.delete(id);
    result[key] = [...next.values()];
  }
  for (const key of ["theme", "doctor"]) {
    if (JSON.stringify(before[key]) !== JSON.stringify(current[key])) result[key] = current[key];
  }
  return result;
}

// ARQUIVAR, E NAO APAGAR, desde 11/09/2026.
//
// "Excluir paciente" apagava o cadastro e todos os registros, sem volta -- e a
// Lei 13.787/2018 manda guardar o prontuario por 20 anos a partir do ultimo
// registro. Arquivado, o paciente sai das listas e continua guardado, aqui e
// na conta; restaurar o devolve inteiro.
//
// A exclusao definitiva continua existindo, a partir do arquivo: o conteudo
// sai, e fica so a marca (id, excluidoEm, updatedAt), que e o que impede a
// copia de outro aparelho de devolver o registro na proxima uniao.
export function isActive(entry) {
  return Boolean(entry) && !entry.arquivadoEm && !entry.excluidoEm;
}

export function isArchived(entry) {
  return Boolean(entry?.arquivadoEm) && !entry.excluidoEm;
}

function mapPatient(state, patientId, change) {
  return { ...state, patients: (state.patients || []).map(item => (item.id === patientId ? change(item) : item)) };
}

// Os registros do paciente arquivado ficam como estao: saem das telas porque o
// paciente saiu, e voltam junto com ele.
export function archivePatient(state = {}, patientId, agora = new Date().toISOString()) {
  return mapPatient(state, patientId, item => ({ ...item, arquivadoEm: agora, updatedAt: agora }));
}

export function restorePatient(state = {}, patientId, agora = new Date().toISOString()) {
  return mapPatient(state, patientId, ({ arquivadoEm, ...item }) => ({ ...item, updatedAt: agora }));
}

function tombstone(entry, agora) {
  return {
    id: entry.id,
    ...(entry.patientId ? { patientId: entry.patientId } : {}),
    ...(entry.type ? { type: entry.type } : {}),
    excluidoEm: agora,
    updatedAt: agora
  };
}

export function purgePatient(state = {}, patientId, agora = new Date().toISOString()) {
  const doPaciente = entry => (entry?.patientId === patientId ? tombstone(entry, agora) : entry);
  return {
    ...mapPatient(state, patientId, item => tombstone(item, agora)),
    consultations: (state.consultations || []).map(doPaciente),
    returns: (state.returns || []).map(doPaciente)
  };
}

export function archiveEntry(state = {}, collection, id, agora = new Date().toISOString()) {
  return {
    ...state,
    [collection]: (state[collection] || []).map(item => (item.id === id ? { ...item, arquivadoEm: agora, updatedAt: agora } : item))
  };
}

// Assinatura barata do estado: muda quando entra, sai ou muda um registro. E o
// que diz se a copia da conta trouxe algo novo e a tela precisa ser redesenhada.
export function stateSignature(state = {}) {
  return ["patients", "consultations", "returns"].map(key => collectionSignature(state[key])).join("|");
}
