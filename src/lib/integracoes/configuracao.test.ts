import { describe, expect, it } from "vitest";

import { credenciaisDoGoogle, urlDoPncp } from "./configuracao";

describe("configuração da integração com o Google", () => {
  it("só vale com o ID e o segredo preenchidos", () => {
    expect(credenciaisDoGoogle({})).toBeNull();
    expect(credenciaisDoGoogle({ GOOGLE_CLIENT_ID: "id" })).toBeNull();
    expect(credenciaisDoGoogle({ GOOGLE_CLIENT_ID: "  ", GOOGLE_CLIENT_SECRET: "s" })).toBeNull();
    expect(credenciaisDoGoogle({ GOOGLE_CLIENT_ID: " id.apps.googleusercontent.com\n", GOOGLE_CLIENT_SECRET: " GOCSPX-x " })).toEqual({
      clientId: "id.apps.googleusercontent.com",
      clientSecret: "GOCSPX-x",
    });
  });

  it("só aceita baixar arquivos do PNCP, por HTTPS", () => {
    expect(urlDoPncp("https://pncp.gov.br/pncp-api/v1/orgaos/1/compras/2026/1/arquivos/1")).toBe(true);
    expect(urlDoPncp("https://treina.pncp.gov.br/x")).toBe(true);
    expect(urlDoPncp("http://pncp.gov.br/x")).toBe(false);
    expect(urlDoPncp("https://pncp.gov.br.golpe.exemplo/x")).toBe(false);
    expect(urlDoPncp("https://169.254.169.254/latest/meta-data")).toBe(false);
    expect(urlDoPncp("não é url")).toBe(false);
  });
});
