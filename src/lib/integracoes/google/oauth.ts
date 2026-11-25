// OAuth do Google para a integração (separado do "Entrar com Google", que é do Supabase).
// Pede o menor escopo possível: eventos da agenda e arquivos criados pelo próprio app.

export const ESCOPO_AGENDA = "https://www.googleapis.com/auth/calendar.events";
export const ESCOPO_DRIVE = "https://www.googleapis.com/auth/drive.file";
/** "openid email" só serve para mostrar qual conta foi conectada. */
export const ESCOPOS_PEDIDOS = ["openid", "email", ESCOPO_AGENDA, ESCOPO_DRIVE];

const URL_DE_AUTORIZACAO = "https://accounts.google.com/o/oauth2/v2/auth";
const URL_DE_TOKEN = "https://oauth2.googleapis.com/token";
const URL_DE_REVOGACAO = "https://oauth2.googleapis.com/revoke";

export type CredenciaisDoApp = { clientId: string; clientSecret: string };

/** O acesso à conta não vale mais (revogado, expirado, app em modo de teste há mais de 7 dias). */
export class ErroDeAcesso extends Error {}

/** Endereço da tela de consentimento. "offline" + "consent" garantem o token de atualização. */
export function urlDeAutorizacao(clientId: string, redirectUri: string, estado: string): string {
  const parametros = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: ESCOPOS_PEDIDOS.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state: estado,
  });
  return `${URL_DE_AUTORIZACAO}?${parametros}`;
}

type RespostaDeToken = {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

async function pedirToken(corpo: Record<string, string>, buscar: typeof fetch): Promise<RespostaDeToken> {
  const resposta = await buscar(URL_DE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(corpo),
    signal: AbortSignal.timeout(20_000),
  });
  const dados = (await resposta.json().catch(() => ({}))) as RespostaDeToken;
  if (!resposta.ok && !dados.error) dados.error = `HTTP ${resposta.status}`;
  return dados;
}

/** O e-mail vem no id_token, que chegou direto do Google por HTTPS: basta ler o conteúdo. */
function emailDoIdToken(idToken: string | undefined): string | null {
  try {
    const conteudo = JSON.parse(Buffer.from((idToken ?? "").split(".")[1] ?? "", "base64url").toString("utf8"));
    return typeof conteudo.email === "string" ? conteudo.email : null;
  } catch {
    return null;
  }
}

export type ContaConectada = { refreshToken: string; escopos: string[]; email: string | null };

/** Troca o código que voltou do Google pelo token de atualização. */
export async function trocarCodigo(
  app: CredenciaisDoApp,
  codigo: string,
  redirectUri: string,
  buscar: typeof fetch = fetch,
): Promise<ContaConectada> {
  const dados = await pedirToken(
    { code: codigo, client_id: app.clientId, client_secret: app.clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" },
    buscar,
  );
  if (dados.error) throw new Error(`O Google recusou o código: ${dados.error_description ?? dados.error}`);
  if (!dados.refresh_token) throw new Error("O Google não devolveu o token de atualização.");
  return {
    refreshToken: dados.refresh_token,
    escopos: (dados.scope ?? "").split(" ").filter(Boolean),
    email: emailDoIdToken(dados.id_token),
  };
}

/** Token de acesso de curta duração, a partir do token de atualização guardado. */
export async function renovarAcesso(app: CredenciaisDoApp, refreshToken: string, buscar: typeof fetch = fetch): Promise<string> {
  const dados = await pedirToken(
    { refresh_token: refreshToken, client_id: app.clientId, client_secret: app.clientSecret, grant_type: "refresh_token" },
    buscar,
  );
  if (dados.error === "invalid_grant") throw new ErroDeAcesso("O acesso ao Google expirou ou foi revogado.");
  if (dados.error || !dados.access_token) {
    throw new Error(`Não foi possível renovar o acesso ao Google: ${dados.error_description ?? dados.error ?? "sem token"}`);
  }
  return dados.access_token;
}

/** Ao desconectar: pede ao Google para invalidar o token. Falhar aqui não impede a desconexão. */
export async function revogar(refreshToken: string, buscar: typeof fetch = fetch): Promise<boolean> {
  try {
    const resposta = await buscar(URL_DE_REVOGACAO, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken }),
      signal: AbortSignal.timeout(15_000),
    });
    return resposta.ok;
  } catch {
    return false;
  }
}
