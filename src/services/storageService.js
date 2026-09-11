const KEY = "regis_psiquiatr_ia_v1";

export function loadState() {
  try {
    const state = JSON.parse(localStorage.getItem(KEY)) || { patients: [], consultations: [], returns: [] };
    let changed = false;
    (state.returns || []).forEach(entry => {
      if (/^Retorno\s+\d+$/i.test(entry.label || "")) {
        entry.label = "Retorno";
        changed = true;
      }
    });
    if (changed) localStorage.setItem(KEY, JSON.stringify(state));
    return state;
  } catch {
    return { patients: [], consultations: [], returns: [] };
  }
}

// O localStorage tem teto — algo em torno de 5 MB — e quando ele enche o
// navegador recusa a gravacao lancando QuotaExceededError. Antes a chamada era
// nua: a excecao subia por uma pilha que ninguem tratava, o registro nao era
// gravado e a tela continuava igual. O medico terminava a consulta convencido
// de que tinha salvado.
//
// Aqui a falha vira valor de retorno: string vazia quando gravou, mensagem
// quando nao gravou. Quem chama decide o que fazer com ela — e persist() poe na
// barra de status, junto do aviso de sincronizacao.
export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return "";
  } catch (error) {
    // Todo navegador usa um nome diferente para o mesmo estouro. O codigo 22 e
    // o do padrao antigo, ainda emitido pelo Safari.
    const cheio = error?.name === "QuotaExceededError"
      || error?.name === "NS_ERROR_DOM_QUOTA_REACHED"
      || error?.code === 22;
    return cheio
      ? "O armazenamento deste navegador está cheio. A consulta NÃO foi salva neste aparelho. Exporte ou apague consultas antigas antes de continuar."
      : `Não foi possível salvar neste aparelho: ${error?.message || "erro desconhecido"}.`;
  }
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
  return ["patients", "consultations", "returns"]
    .map(key => (state[key] || []).map(entry => `${entry?.id}:${entry?.updatedAt || entry?.createdAt || ""}`).join(","))
    .join("|");
}
