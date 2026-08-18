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

// O access_token do Supabase dura cerca de uma hora. Sem renovacao, uma
// consulta iniciada de manha e salva depois do almoco ia para o localStorage e
// nunca subia: cada tentativa voltava 401 e o erro morria numa variavel que so
// a tela de login le. O refresh_token vem junto no login e serve exatamente
// para isso.
async function refreshSession() {
  const session = await currentSession();
  const settings = await config();
  if (!session?.refresh_token || !settings?.url) return null;
  const response = await fetch(`${settings.url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: settings.key, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refresh_token })
  });
  if (!response.ok) return null;
  const result = await response.json();
  if (!result?.access_token) return null;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(result));
  return result;
}

// Uma repeticao so: se o 401 persistir depois de renovar, a sessao acabou de
// verdade e quem chamou precisa saber.
async function authorized(path, options = {}, allowRetry = true) {
  const session = await currentSession();
  const settings = await config();
  if (!session?.access_token || !settings?.url) return null;
  const response = await fetch(`${settings.url}${path}`, {
    ...options,
    headers: {
      apikey: settings.key,
      Authorization: `Bearer ${session.access_token}`,
      ...(options.headers || {})
    }
  });
  if (response.status === 401 && allowRetry && await refreshSession()) {
    return authorized(path, options, false);
  }
  return response;
}

export async function pullState() {
  const session = await currentSession();
  if (!session?.user?.id) return null;
  const response = await authorized(`/rest/v1/prontuarios?select=id,payload&owner_id=eq.${encodeURIComponent(session.user.id)}&limit=1`);
  if (!response) return null;
  if (!response.ok) throw new Error("Não foi possível carregar os prontuários do Supabase.");
  const rows = await response.json();
  return rows[0]?.payload || null;
}

export async function pushState(payload) {
  const session = await currentSession();
  if (!session?.user?.id) return false;
  const ownerId = session.user.id;
  const lookup = await authorized(`/rest/v1/prontuarios?select=id&owner_id=eq.${encodeURIComponent(ownerId)}&limit=1`);
  if (!lookup) return false;
  if (!lookup.ok) throw new Error("Não foi possível salvar no Supabase.");
  const rows = await lookup.json();
  const path = rows[0]?.id ? `/rest/v1/prontuarios?id=eq.${rows[0].id}` : "/rest/v1/prontuarios";
  const response = await authorized(path, {
    method: rows[0]?.id ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ owner_id: ownerId, payload, updated_at: new Date().toISOString() })
  });
  if (!response?.ok) throw new Error("Não foi possível salvar no Supabase.");
  return true;
}
