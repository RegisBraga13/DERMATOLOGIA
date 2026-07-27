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
