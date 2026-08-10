const SESSION_KEY = "psires_supabase_session";
let configPromise;

async function config() {
  configPromise ||= fetch("/api/supabase-config").then(response => response.ok ? response.json() : null).catch(() => null);
  return configPromise;
}

export async function currentSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"); } catch { return null; }
}

export async function signIn(email, password) {
  const settings = await config();
  if (!settings?.url || !settings?.key) throw new Error("Supabase não configurado no servidor.");
  const response = await fetch(`${settings.url}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: settings.key, "Content-Type": "application/json" }, body: JSON.stringify({ email, password })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error_description || result.msg || "E-mail ou senha inválidos.");
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(result));
  return result;
}

export function signOut() { sessionStorage.removeItem(SESSION_KEY); }

export async function pullState() {
  const session = await currentSession();
  if (!session?.access_token || !session.user?.id) return null;
  const settings = await config();
  const response = await fetch(`${settings.url}/rest/v1/prontuarios?select=id,payload&owner_id=eq.${encodeURIComponent(session.user.id)}&limit=1`, {
    headers: { apikey: settings.key, Authorization: `Bearer ${session.access_token}` }
  });
  if (!response.ok) throw new Error("Não foi possível carregar os prontuários do Supabase.");
  const rows = await response.json();
  return rows[0]?.payload || null;
}

export async function pushState(payload) {
  const session = await currentSession();
  if (!session?.access_token || !session.user?.id) return false;
  const settings = await config();
  const baseHeaders = { apikey: settings.key, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" };
  const lookup = await fetch(`${settings.url}/rest/v1/prontuarios?select=id&owner_id=eq.${encodeURIComponent(session.user.id)}&limit=1`, { headers: baseHeaders });
  const rows = await lookup.json();
  const url = rows[0]?.id ? `${settings.url}/rest/v1/prontuarios?id=eq.${rows[0].id}` : `${settings.url}/rest/v1/prontuarios`;
  const response = await fetch(url, { method: rows[0]?.id ? "PATCH" : "POST", headers: { ...baseHeaders, Prefer: "return=minimal" }, body: JSON.stringify({ owner_id: session.user.id, payload, updated_at: new Date().toISOString() }) });
  if (!response.ok) throw new Error("Não foi possível salvar no Supabase.");
  return true;
}
