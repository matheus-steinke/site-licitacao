import { describe, expect, it } from "vitest";

import { ArquivoGrandeDemais, baixarArquivo, identificarArquivo } from "./arquivos";

const PDF = new Uint8Array(Buffer.from("%PDF-1.7 conteúdo"));
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);

const responder = (corpo: Uint8Array | null, status = 200, cabecalhos: Record<string, string> = {}) =>
  (async () => new Response(corpo as BodyInit | null, { status, headers: cabecalhos })) as unknown as typeof fetch;

describe("nome e tipo do arquivo do edital", () => {
  it("usa o título do PNCP quando ele tem extensão conhecida", () => {
    expect(identificarArquivo("Edital 0780 2026 e TR assinado.pdf", PDF, 1)).toEqual({
      nome: "Edital 0780 2026 e TR assinado.pdf",
      tipo: "application/pdf",
    });
    expect(identificarArquivo("Planilha.XLSX", ZIP, 2).tipo).toContain("spreadsheetml");
  });

  it("sem extensão, descobre pelo conteúdo", () => {
    expect(identificarArquivo("Termo de Referência", PDF, 2)).toEqual({ nome: "Termo de Referência.pdf", tipo: "application/pdf" });
    expect(identificarArquivo("anexos", ZIP, 3)).toEqual({ nome: "anexos.zip", tipo: "application/zip" });
    expect(identificarArquivo("coisa", new Uint8Array([1, 2, 3]), 4)).toEqual({ nome: "coisa", tipo: "application/octet-stream" });
  });

  it("sem título, numera; e tira caracteres que atrapalham em nomes de arquivo", () => {
    expect(identificarArquivo(null, PDF, 7).nome).toBe("Arquivo 7.pdf");
    expect(identificarArquivo('  "TR": lote 1/2.pdf ', PDF, 1).nome).toBe("-TR- lote 1-2.pdf");
  });
});

describe("baixar arquivo do PNCP", () => {
  it("baixa o conteúdo inteiro e identifica o arquivo", async () => {
    const arquivo = await baixarArquivo("https://pncp.gov.br/x/arquivos/1", "TR", 1, 1000, responder(PDF));
    expect(arquivo.nome).toBe("TR.pdf");
    expect(arquivo.tipo).toBe("application/pdf");
    expect(Buffer.from(arquivo.conteudo).toString()).toBe("%PDF-1.7 conteúdo");
  });

  it("desiste de arquivo maior que o limite, com ou sem tamanho anunciado", async () => {
    const grande = new Uint8Array(5000);
    await expect(baixarArquivo("https://x", "a.pdf", 1, 1000, responder(grande))).rejects.toBeInstanceOf(ArquivoGrandeDemais);
    await expect(
      baixarArquivo("https://x", "a.pdf", 1, 1000, responder(PDF, 200, { "content-length": "999999" })),
    ).rejects.toBeInstanceOf(ArquivoGrandeDemais);
  });

  it("erro do PNCP e arquivo vazio viram falha", async () => {
    await expect(baixarArquivo("https://x", "a.pdf", 1, 1000, responder(null, 404))).rejects.toThrow("HTTP 404");
    await expect(baixarArquivo("https://x", "a.pdf", 1, 1000, responder(new Uint8Array(0)))).rejects.toThrow("vazio");
  });
});
