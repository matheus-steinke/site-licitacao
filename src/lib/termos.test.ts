import { describe, expect, it } from "vitest";

import { gerarSlug, lerTermos } from "./termos";

describe("termos", () => {
  it("lê um termo por linha, limpa e remove repetidos", () => {
    expect(lerTermos("Cateter  Duplo J\n\n cateter duplo j \nStent ureteral")).toEqual([
      "cateter duplo j",
      "stent ureteral",
    ]);
  });

  it("aceita ponto e vírgula, mas não quebra na vírgula das medidas", () => {
    expect(lerTermos("fio guia 0,035; fio guia 0,014")).toEqual([
      "fio guia 0,035",
      "fio guia 0,014",
    ]);
    expect(lerTermos("   \n ; ")).toEqual([]);
  });

  it("gera slug sem acento nem símbolos", () => {
    expect(gerarSlug("Urologia/Endourologia")).toBe("urologia-endourologia");
    expect(gerarSlug("  UTI / Terapia Intensiva ")).toBe("uti-terapia-intensiva");
    expect(gerarSlug("Laboratório/Diagnóstico")).toBe("laboratorio-diagnostico");
  });
});
