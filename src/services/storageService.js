const KEY = "regis_psiquiatr_ia_v1";

export function loadState() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || { patients: [], consultations: [], returns: [] };
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
