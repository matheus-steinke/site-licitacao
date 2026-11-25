import { describe, expect, it } from "vitest";

import { ErroDeAcesso, ESCOPO_AGENDA, ESCOPO_DRIVE, renovarAcesso, revogar, trocarCodigo, urlDeAutorizacao } from "./oauth";
import { criarServicoGoogle, ErroDoGoogle, naoExiste } from "./servico";

type Chamada = { url: string; metodo: string; cabecalhos: Record<string, string>; corpo: string };
type Resposta = { status?: number; json?: unknown; cabecalhos?: Record<string, string> } | Error;

function googleFalso(respostas: Resposta[]) {
  const chamadas: Chamada[] = [];
  const buscar = (async (url: string, opcoes: RequestInit = {}) => {
    const corpo = opcoes.body;
    chamadas.push({
      url: String(url),
      metodo: opcoes.method ?? "GET",
      cabecalhos: Object.fromEntries(new Headers(opcoes.headers)),
      corpo: corpo instanceof URLSearchParams ? corpo.toString() : typeof corpo === "string" ? corpo : corpo ? `<${(corpo as Uint8Array).byteLength} bytes>` : "",
    });
    const r = respostas.shift();
    if (!r) throw new Error("sem resposta programada");
    if (r instanceof Error) throw r;
    const status = r.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(r.json ?? {}), { status, headers: r.cabecalhos });
  }) as typeof fetch;
  return { buscar, chamadas };
}

const APP = { clientId: "id-do-app.apps.googleusercontent.com", clientSecret: "GOCSPX-segredo" };
const idToken = (email: string) => `x.${Buffer.from(JSON.stringify({ email })).toString("base64url")}.y`;

describe("OAuth do Google", () => {
  it("pede só eventos da agenda e arquivos do app, com acesso offline e consentimento", () => {
    const url = new URL(urlDeAutorizacao(APP.clientId, "https://app.exemplo/integracoes/google/retorno", "estado-123"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: APP.clientId,
      redirect_uri: "https://app.exemplo/integracoes/google/retorno",
      response_type: "code",
      scope: `openid email ${ESCOPO_AGENDA} ${ESCOPO_DRIVE}`,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "false",
      state: "estado-123",
    });
  });

  it("troca o código pelo token de atualização, com a conta e os escopos concedidos", async () => {
    const { buscar, chamadas } = googleFalso([
      { json: { access_token: "a", refresh_token: "1//token", scope: `openid ${ESCOPO_AGENDA}`, id_token: idToken("dono@empresa.com") } },
    ]);
    await expect(trocarCodigo(APP, "codigo", "https://app.exemplo/retorno", buscar)).resolves.toEqual({
      refreshToken: "1//token",
      escopos: ["openid", ESCOPO_AGENDA],
      email: "dono@empresa.com",
    });
    expect(chamadas[0]).toMatchObject({ url: "https://oauth2.googleapis.com/token", metodo: "POST" });
    expect(Object.fromEntries(new URLSearchParams(chamadas[0].corpo))).toEqual({
      code: "codigo",
      client_id: APP.clientId,
      client_secret: APP.clientSecret,
      redirect_uri: "https://app.exemplo/retorno",
      grant_type: "authorization_code",
    });
  });

  it("falha com mensagem clara se o Google recusa o código ou não devolve o token de atualização", async () => {
    const recusado = googleFalso([{ status: 400, json: { error: "invalid_grant", error_description: "Bad Request" } }]);
    await expect(trocarCodigo(APP, "velho", "https://x", recusado.buscar)).rejects.toThrow("recusou o código: Bad Request");
    const semToken = googleFalso([{ json: { access_token: "a" } }]);
    await expect(trocarCodigo(APP, "c", "https://x", semToken.buscar)).rejects.toThrow("token de atualização");
  });

  it("renova o acesso; acesso revogado vira ErroDeAcesso", async () => {
    const ok = googleFalso([{ json: { access_token: "ya29.novo" } }]);
    await expect(renovarAcesso(APP, "1//token", ok.buscar)).resolves.toBe("ya29.novo");
    expect(Object.fromEntries(new URLSearchParams(ok.chamadas[0].corpo))).toMatchObject({ grant_type: "refresh_token", refresh_token: "1//token" });

    const revogado = googleFalso([{ status: 400, json: { error: "invalid_grant" } }]);
    await expect(renovarAcesso(APP, "1//token", revogado.buscar)).rejects.toBeInstanceOf(ErroDeAcesso);
    const foraDoAr = googleFalso([{ status: 503, json: {} }]);
    await expect(renovarAcesso(APP, "1//token", foraDoAr.buscar)).rejects.toThrow("HTTP 503");
  });

  it("revogar nunca lança erro", async () => {
    await expect(revogar("1//token", googleFalso([{ json: {} }]).buscar)).resolves.toBe(true);
    await expect(revogar("1//token", googleFalso([new Error("rede")]).buscar)).resolves.toBe(false);
  });
});

const EVENTO = {
  summary: "PE 780/2026 - ÓRGÃO",
  description: "itens",
  start: { dateTime: "2026-12-03T16:15:00.000Z", timeZone: "America/Sao_Paulo" },
  end: { dateTime: "2026-12-03T17:15:00.000Z", timeZone: "America/Sao_Paulo" },
};

describe("Agenda", () => {
  it("cria o evento na agenda escolhida", async () => {
    const { buscar, chamadas } = googleFalso([{ json: { id: "ev1", htmlLink: "https://agenda/ev1" } }]);
    const google = criarServicoGoogle("ya29.token", buscar);
    await expect(google.criarEvento("comercial@group.calendar.google.com", EVENTO)).resolves.toEqual({ id: "ev1", link: "https://agenda/ev1" });
    expect(chamadas[0]).toMatchObject({
      url: "https://www.googleapis.com/calendar/v3/calendars/comercial%40group.calendar.google.com/events",
      metodo: "POST",
    });
    expect(chamadas[0].cabecalhos.authorization).toBe("Bearer ya29.token");
    expect(JSON.parse(chamadas[0].corpo)).toEqual(EVENTO);
  });

  it("atualiza o evento e o traz de volta se tinha sido apagado", async () => {
    const { buscar, chamadas } = googleFalso([{ json: { id: "ev1" } }]);
    await criarServicoGoogle("t", buscar).atualizarEvento("primary", "ev1", EVENTO);
    expect(chamadas[0]).toMatchObject({ url: "https://www.googleapis.com/calendar/v3/calendars/primary/events/ev1", metodo: "PATCH" });
    expect(JSON.parse(chamadas[0].corpo)).toMatchObject({ status: "confirmed", summary: EVENTO.summary });
  });

  it("remover evento que já não existe não é erro; outros erros sobem", async () => {
    const sumiu = googleFalso([{ status: 410, json: { error: { message: "Resource has been deleted" } } }]);
    await expect(criarServicoGoogle("t", sumiu.buscar).removerEvento("primary", "ev1")).resolves.toBeUndefined();
    const proibido = googleFalso([{ status: 403, json: { error: { message: "Forbidden", errors: [{ reason: "forbidden" }] } } }]);
    await expect(criarServicoGoogle("t", proibido.buscar).removerEvento("primary", "ev1")).rejects.toMatchObject({ status: 403, motivo: "forbidden" });
  });

  it("distingue acesso revogado (401) de recurso inexistente (404)", async () => {
    const semAcesso = googleFalso([{ status: 401, json: { error: { message: "Invalid Credentials" } } }]);
    await expect(criarServicoGoogle("t", semAcesso.buscar).criarEvento("primary", EVENTO)).rejects.toBeInstanceOf(ErroDeAcesso);
    const semAgenda = googleFalso([{ status: 404, json: { error: { message: "Not Found" } } }]);
    const erro = await criarServicoGoogle("t", semAgenda.buscar).criarEvento("nao-existe", EVENTO).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroDoGoogle);
    expect(naoExiste(erro)).toBe(true);
  });
});

describe("Drive", () => {
  it("cria pasta na raiz ou dentro de outra", async () => {
    const { buscar, chamadas } = googleFalso([{ json: { id: "p1", webViewLink: "https://drive/p1" } }, { json: { id: "p2" } }]);
    const google = criarServicoGoogle("t", buscar);
    await expect(google.criarPasta("Licitações", null)).resolves.toEqual({ id: "p1", link: "https://drive/p1" });
    await google.criarPasta("Dezembro 2026", "p1");
    expect(JSON.parse(chamadas[0].corpo)).toEqual({ name: "Licitações", mimeType: "application/vnd.google-apps.folder" });
    expect(JSON.parse(chamadas[1].corpo)).toEqual({ name: "Dezembro 2026", mimeType: "application/vnd.google-apps.folder", parents: ["p1"] });
  });

  it("procura pasta pelo nome dentro da pasta-mãe, com escape de aspas", async () => {
    const { buscar, chamadas } = googleFalso([{ json: { files: [{ id: "m1" }] } }, { json: { files: [] } }]);
    const google = criarServicoGoogle("t", buscar);
    await expect(google.buscarPasta("Pasta d'Água", "raiz")).resolves.toEqual({ id: "m1", link: null });
    await expect(google.buscarPasta("Outra", "raiz")).resolves.toBeNull();
    expect(new URL(chamadas[0].url).searchParams.get("q")).toBe(
      "name = 'Pasta d\\'Água' and 'raiz' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
    );
  });

  it("pasta apagada ou na lixeira conta como inexistente", async () => {
    const google = (r: Resposta) => criarServicoGoogle("t", googleFalso([r]).buscar);
    await expect(google({ json: { id: "p", trashed: false } }).pastaExiste("p")).resolves.toBe(true);
    await expect(google({ json: { id: "p", trashed: true } }).pastaExiste("p")).resolves.toBe(false);
    await expect(google({ status: 404, json: { error: { message: "File not found" } } }).pastaExiste("p")).resolves.toBe(false);
  });

  it("envia arquivo em duas etapas: abre a sessão e manda o conteúdo", async () => {
    const { buscar, chamadas } = googleFalso([
      { json: {}, cabecalhos: { location: "https://www.googleapis.com/upload/sessao-1" } },
      { json: { id: "f1", name: "Edital.pdf" } },
    ]);
    const conteudo = new Uint8Array([1, 2, 3, 4]);
    await expect(criarServicoGoogle("t", buscar).enviarArquivo("Edital.pdf", "application/pdf", conteudo, "sub1")).resolves.toEqual({
      id: "f1",
      nome: "Edital.pdf",
    });
    expect(chamadas[0].url).toContain("uploadType=resumable");
    expect(chamadas[0].cabecalhos).toMatchObject({ "x-upload-content-type": "application/pdf", "x-upload-content-length": "4" });
    expect(JSON.parse(chamadas[0].corpo)).toEqual({ name: "Edital.pdf", parents: ["sub1"] });
    expect(chamadas[1]).toMatchObject({ url: "https://www.googleapis.com/upload/sessao-1", metodo: "PUT", corpo: "<4 bytes>" });
  });

  it("falha do envio vira erro com o nome do arquivo", async () => {
    const semSessao = googleFalso([{ status: 403, json: {} }]);
    await expect(criarServicoGoogle("t", semSessao.buscar).enviarArquivo("a.pdf", "application/pdf", new Uint8Array(1), "p")).rejects.toThrow('iniciar o envio de "a.pdf"');
    const cortado = googleFalso([{ json: {}, cabecalhos: { location: "https://x/sessao" } }, { status: 500, json: {} }]);
    await expect(criarServicoGoogle("t", cortado.buscar).enviarArquivo("a.pdf", "application/pdf", new Uint8Array(1), "p")).rejects.toThrow('O envio de "a.pdf" falhou');
  });
});
