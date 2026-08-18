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

export function saveState(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
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
    if (!atual || entryStamp(entry) >= entryStamp(atual)) byId.set(entry.id, entry);
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
// A uniao e por id, ficando a versao mais recente de cada registro. O preco e
// que exclusao feita num aparelho nao se propaga para o outro: o registro
// reaparece na proxima uniao. E o lado certo para errar — registro repetido o
// medico apaga de novo, registro perdido nao volta.
export function mergeStates(local = {}, remote = {}) {
  const merged = { ...remote, ...local };
  ["patients", "consultations", "returns"].forEach(key => {
    merged[key] = mergeById(local[key], remote[key]);
  });
  return merged;
}
