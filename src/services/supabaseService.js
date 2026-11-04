import { syncRecordRows } from "./recordSyncService.js";
const SESSION_KEY = "psires_supabase_session";
let configPromise;

async function config() {
  configPromise ||= fetch("/api/supabase-config")
    .then(response => {
      if (!response.ok) throw new Error("Não foi possível verificar a configuração do servidor.");
      return response.json();
    })
    .catch(error => {
      configPromise = null; // permite tentar novamente após uma falha de rede
      throw error;
    });
  return configPromise;
}

export async function currentSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"); } catch { return null; }
}

export async function verifiedSession() {
  const session = await currentSession();
  if (!session?.user?.id) return null;
  const response = await authorized("/auth/v1/user", {}, true, session.user.id);
  if (!response?.ok) {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
  const user = await response.json();
  if (user?.id !== session.user.id) {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
  return currentSession(); // pode ter sido renovada durante a validação
}

// O servidor so exige isto quando tem Supabase configurado (server.py,
// verify_supabase_user); sem sessao aqui, a chamada de IA volta 401 la e nao
// silenciosamente. Sem Supabase configurado no servidor, o header viaja vazio
// e o servidor nem confere -- comportamento local de sempre.
export async function authHeaders() {
  let session = await currentSession();
  if (session?.expires_at && Date.now() / 1000 >= session.expires_at - 60) {
    session = await refreshSession();
  }
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

// Sem URL/chave no .env do servidor, nao ha onde logar -- e sem isto a tela de
// entrada travava para sempre quem nunca tinha uma sessao salva no navegador,
// mesmo em modo local. O App.js le isto para pular o login e gravar so no
// aparelho, exatamente como o SUPABASE.md promete.
export async function isConfigured() {
  const settings = await config();
  return Boolean(settings?.url && settings?.key);
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

// Encerra a sessao dos dois lados. O Supabase e avisado para invalidar o
// refresh_token; se nao responder -- rede fora, token ja vencido --, a sessao
// local sai assim mesmo: quem clicou em Sair nao pode continuar entrado.
//
// A sessao local sai ANTES do primeiro await, ainda na chamada: quem chama nao
// precisa esperar a rede para mostrar a tela de entrada, e uma resposta lenta do
// Supabase nao deixa o medico parado na pagina Sair achando que nada aconteceu.
export async function signOut() {
  let session = null;
  try { session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"); } catch { session = null; }
  sessionStorage.removeItem(SESSION_KEY);
  const settings = await config();
  if (!session?.access_token || !settings?.url) return;
  try {
    await fetch(`${settings.url}/auth/v1/logout`, {
      method: "POST",
      headers: { apikey: settings.key, Authorization: `Bearer ${session.access_token}` }
    });
  } catch {
    // A sessao local ja saiu; o token remoto vence sozinho em cerca de uma hora.
  }
}

// O access_token do Supabase dura cerca de uma hora. Sem renovacao, uma
// consulta iniciada de manha e salva depois do almoco ia para o localStorage e
// nunca subia: cada tentativa voltava 401 e o erro morria numa variavel que so
// a tela de login le. O refresh_token vem junto no login e serve exatamente
// para isso.
let refreshInFlight = null;
async function refreshSession() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = doRefreshSession().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

async function doRefreshSession() {
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
  // Uma resposta atrasada não pode restaurar a sessão depois de Sair ou
  // substituir a sessão que outra pessoa iniciou no mesmo navegador.
  const stillCurrent = await currentSession();
  if (stillCurrent?.refresh_token !== session.refresh_token) return null;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(result));
  return result;
}

// Uma repeticao so: se o 401 persistir depois de renovar, a sessao acabou de
// verdade e quem chamou precisa saber.
async function authorized(path, options = {}, allowRetry = true, expectedOwnerId = "") {
  const session = await currentSession();
  const settings = await config();
  if (!session?.access_token || !settings?.url || (expectedOwnerId && session.user?.id !== expectedOwnerId)) return null;
  const response = await fetch(`${settings.url}${path}`, {
    ...options,
    headers: {
      apikey: settings.key,
      Authorization: `Bearer ${session.access_token}`,
      ...(options.headers || {})
    }
  });
  if (response.status === 401 && allowRetry && await refreshSession()) {
    return authorized(path, options, false, expectedOwnerId);
  }
  return response;
}

// SINCRONIZA JUNTANDO, E NAO SOBRESCREVENDO, desde 11/09/2026.
//
// Antes cada gravacao subia o estado inteiro deste aparelho por cima da copia
// da conta, e a copia so era lida no login. Com dois aparelhos abertos, o
// ultimo a gravar apagava da conta o que o outro tinha criado -- ficava so no
// aparelho dele, ate o proximo login.
//
// Agora le a copia, junta com `merge` e grava com uma condicao: o PATCH so vale
// se updated_at ainda for o que foi lido. Se outro aparelho gravou no meio,
// nenhuma linha muda, e a volta recomeca com a copia nova. Devolve o estado
// juntado, que e o que a conta passou a guardar; null sem sessao.
export async function syncState(local, merge, tentativas = 3, expectedOwnerId = "") {
  const session = await currentSession();
  if (!session?.user?.id || (expectedOwnerId && session.user.id !== expectedOwnerId)) return null;
  const ownerId = session.user.id;
  // A interface pode editar o objeto enquanto a rede responde. Congele a
  // versão enviada, e deixe o App unir as alterações posteriores no retorno.
  const snapshot = structuredClone(local);
  const settings = await config();
  if (settings.storage_version === 2) {
    return syncRecordRows(snapshot, merge, authorized, ownerId, tentativas);
  }
  for (let vez = 0; vez < tentativas; vez += 1) {
    const leitura = await authorized(`/rest/v1/prontuarios?select=id,payload,updated_at&owner_id=eq.${encodeURIComponent(ownerId)}&limit=1`, {}, true, ownerId);
    if (!leitura) return null;
    if (!leitura.ok) throw new Error("Não foi possível ler os prontuários do Supabase.");
    const [linha] = await leitura.json();
    const juntos = linha?.payload ? merge(snapshot, linha.payload) : snapshot;
    const corpo = JSON.stringify({ owner_id: ownerId, payload: juntos, updated_at: new Date().toISOString() });
    if (!linha) {
      const criada = await authorized("/rest/v1/prontuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
        body: corpo
      }, true, ownerId);
      // O índice único de owner_id faz o segundo aparelho perder a corrida
      // de INSERT; releia e una a linha que venceu, em vez de criar outra.
      if (criada?.status === 409) continue;
      if (!criada?.ok) throw new Error("Não foi possível salvar no Supabase.");
      return juntos;
    }
    const lida = linha.updated_at ? `eq.${encodeURIComponent(linha.updated_at)}` : "is.null";
    const escrita = await authorized(`/rest/v1/prontuarios?id=eq.${encodeURIComponent(linha.id)}&updated_at=${lida}&select=id`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: corpo
    }, true, ownerId);
    if (!escrita?.ok) throw new Error("Não foi possível salvar no Supabase.");
    const alteradas = await escrita.json();
    if (Array.isArray(alteradas) && alteradas.length) return juntos;
  }
  throw new Error("Outro aparelho gravou ao mesmo tempo; a cópia da conta será atualizada na próxima gravação.");
}

export async function archiveSyncConflict(conflict, choice, expectedOwnerId) {
  if (!conflict || conflict.ownerId !== expectedOwnerId || !["local", "remote"].includes(choice))
    throw new Error("Conflito ou conta inválida.");
  const response = await authorized("/rest/v1/prontuario_conflitos", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ owner_id: expectedOwnerId, kind: conflict.kind,
      record_id: conflict.recordId, local_payload: conflict.local,
      remote_payload: conflict.remote, selected: choice,
      remote_version: conflict.remoteVersion })
  }, true, expectedOwnerId);
  if (!response?.ok) throw new Error("Não foi possível guardar as duas versões; nenhuma escolha foi aplicada.");
}
