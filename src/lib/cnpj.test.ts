import { describe, expect, it } from "vitest";

import { cnpjValido, mascararCnpj, normalizarCnpj } from "./cnpj";

describe("cnpj", () => {
  it("aceita CNPJ numérico válido, com ou sem pontuação", () => {
    expect(cnpjValido("11222333000181")).toBe(true);
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("11.444.777/0001-61")).toBe(true);
  });

  it("aceita o CNPJ alfanumérico", () => {
    // Exemplo oficial da Receita Federal.
    expect(cnpjValido("12.ABC.345/01DE-35")).toBe(true);
    expect(cnpjValido("12.abc.345/01de-35")).toBe(true);
  });

  it("recusa dígito verificador errado, tamanho errado e sequências repetidas", () => {
    expect(cnpjValido("11222333000182")).toBe(false);
    expect(cnpjValido("12ABC34501DE36")).toBe(false);
    expect(cnpjValido("1122233300018")).toBe(false);
    expect(cnpjValido("00000000000000")).toBe(false);
    expect(cnpjValido("")).toBe(false);
    // Letras não são aceitas nos dois dígitos verificadores.
    expect(cnpjValido("12ABC34501DE3A")).toBe(false);
  });

  it("normaliza e mascara", () => {
    expect(normalizarCnpj(" 12.abc.345/01de-35 ")).toBe("12ABC34501DE35");
    expect(mascararCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(mascararCnpj("112223")).toBe("11.222.3");
    expect(mascararCnpj("11222333000181999")).toBe("11.222.333/0001-81");
  });
});
