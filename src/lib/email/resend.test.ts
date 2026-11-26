import { describe, expect, it } from "vitest";

import { configuracaoDeEmail, enviarEmail, ErroDeEmail, REMETENTE_DE_TESTE } from "./resend";

const CONFIG = { apiKey: "re_teste", remetente: "Licita <avisos@exemplo.com.br>" };
const EMAIL = { para: "ana@exemplo.com.br", assunto: "Olá", html: "<p>Olá</p>", texto: "Olá" };

function falso(status: number, corpo: unknown) {
  const chamadas: { url: string; init: RequestInit }[] = [];
  const buscar = (async (url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { buscar, chamadas };
}

describe("configuracaoDeEmail", () => {
  it("sem chave, o envio não está configurado", () => {
    expect(configuracaoDeEmail({})).toBeNull();
    expect(configuracaoDeEmail({ RESEND_API_KEY: "  " })).toBeNull();
  });

  it("sem remetente, usa o de teste do Resend", () => {
    expect(configuracaoDeEmail({ RESEND_API_KEY: "re_1" })).toEqual({ apiKey: "re_1", remetente: REMETENTE_DE_TESTE });
    expect(configuracaoDeEmail({ RESEND_API_KEY: " re_1 ", EMAIL_REMETENTE: " A <a@b.com> " })).toEqual({ apiKey: "re_1", remetente: "A <a@b.com>" });
  });
});

describe("enviarEmail", () => {
  it("manda o pedido no formato do Resend, com a chave de idempotência", async () => {
    const { buscar, chamadas } = falso(200, { id: "abc" });
    const r = await enviarEmail(CONFIG, { ...EMAIL, idempotencia: "diario/org/2026-11-26/u1" }, buscar);
    expect(r).toEqual({ id: "abc" });
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].url).toBe("https://api.resend.com/emails");
    const cabecalhos = chamadas[0].init.headers as Record<string, string>;
    expect(cabecalhos.Authorization).toBe("Bearer re_teste");
    expect(cabecalhos["Idempotency-Key"]).toBe("diario/org/2026-11-26/u1");
    expect(JSON.parse(String(chamadas[0].init.body))).toEqual({
      from: CONFIG.remetente, to: ["ana@exemplo.com.br"], subject: "Olá", html: "<p>Olá</p>", text: "Olá",
    });
  });

  it("explica em português a falta de domínio verificado", async () => {
    const { buscar } = falso(403, { name: "validation_error", message: "You can only send testing emails to your own email address (x@y.com). To send emails to other recipients, please verify a domain." });
    await expect(enviarEmail(CONFIG, EMAIL, buscar)).rejects.toThrow(/domínio verificado/);
  });

  it("explica chave inválida e limite de envios", async () => {
    await expect(enviarEmail(CONFIG, EMAIL, falso(401, { message: "API key is invalid" }).buscar)).rejects.toThrow("A chave do Resend é inválida.");
    await expect(enviarEmail(CONFIG, EMAIL, falso(429, { message: "Too many requests" }).buscar)).rejects.toThrow(/Limite de envios/);
  });

  it("falha de rede vira ErroDeEmail, sem a chave na mensagem", async () => {
    const buscar = (async () => {
      throw new Error("fetch failed");
    }) as unknown as typeof fetch;
    const erro = await enviarEmail(CONFIG, EMAIL, buscar).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroDeEmail);
    expect(String(erro.message)).toContain("Não foi possível falar com o Resend");
    expect(String(erro.message)).not.toContain("re_teste");
  });
});
