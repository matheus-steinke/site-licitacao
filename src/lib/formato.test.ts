import { describe, expect, it } from "vitest";

import {
  formatarCnpj,
  formatarData,
  formatarDataHora,
  formatarMoeda,
  formatarNumero,
} from "./formato";

describe("formato", () => {
  it("formata moeda como R$ 1.234,56", () => {
    expect(formatarMoeda(1234.56)).toBe("R$ 1.234,56");
    expect(formatarMoeda(0)).toBe("R$ 0,00");
    expect(formatarMoeda(null)).toBe("—");
  });

  it("formata números com separador brasileiro", () => {
    expect(formatarNumero(50000)).toBe("50.000");
    expect(formatarNumero(4.8)).toBe("4,8");
  });

  it("mostra data e hora no fuso de São Paulo", () => {
    // 12:00 UTC = 09:00 em São Paulo
    expect(formatarDataHora("2026-11-25T12:00:00Z")).toBe("25/11/2026 09:00");
    // 01:30 UTC do dia 26 ainda é dia 25 em São Paulo
    expect(formatarData("2026-11-26T01:30:00Z")).toBe("25/11/2026");
    expect(formatarDataHora(null)).toBe("—");
  });

  it("formata CNPJ", () => {
    expect(formatarCnpj("12345678000195")).toBe("12.345.678/0001-95");
    expect(formatarCnpj("12ABC34501DE35")).toBe("12.ABC.345/01DE-35");
  });
});
