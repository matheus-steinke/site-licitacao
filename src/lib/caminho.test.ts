import { describe, expect, it } from "vitest";

import { caminhoSeguro } from "./caminho";

describe("caminhoSeguro", () => {
  it("aceita caminhos internos", () => {
    expect(caminhoSeguro("/catalogo?x=1")).toBe("/catalogo?x=1");
  });

  it("recusa endereços externos", () => {
    expect(caminhoSeguro("https://malicioso.example")).toBe("/oportunidades");
    expect(caminhoSeguro("//malicioso.example")).toBe("/oportunidades");
    expect(caminhoSeguro("/\\malicioso.example")).toBe("/oportunidades");
    expect(caminhoSeguro(null)).toBe("/oportunidades");
  });
});
