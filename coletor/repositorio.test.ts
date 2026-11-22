import { describe, expect, it } from "vitest";

import { falhaPassageira, resumirErro, tentarNoBanco } from "./repositorio";

const PAGINA_522 =
  '<!DOCTYPE html>\n<html class="no-js" lang="en-US">\n<head>\n\n<title>supabase.co | 522: Connection timed out</title>\n<meta charset="UTF-8" />' +
  "<body>".padEnd(5000, "x");

describe("erros do banco", () => {
  it("resume uma página HTML de erro ao título dela", () => {
    expect(resumirErro(PAGINA_522)).toBe("resposta HTML: supabase.co | 522: Connection timed out");
    expect(resumirErro("  duplicate key\n value ")).toBe("duplicate key value");
    expect(resumirErro("x".repeat(1000))).toHaveLength(300);
  });

  it("distingue falha passageira de erro de verdade", () => {
    expect(falhaPassageira({ error: { message: PAGINA_522 }, status: 522 })).toBe(true);
    expect(falhaPassageira({ error: { message: "TypeError: fetch failed" }, status: 0 })).toBe(true);
    expect(falhaPassageira({ error: { message: PAGINA_522 }, status: 200 })).toBe(true);
    expect(falhaPassageira({ error: { message: "new row violates row-level security policy" }, status: 403 })).toBe(false);
    expect(falhaPassageira({ error: { message: "duplicate key value" }, status: 409 })).toBe(false);
    expect(falhaPassageira({ error: null, status: 200 })).toBe(false);
  });

  it("repete falhas passageiras com espera crescente e para no sucesso", async () => {
    const esperas: number[] = [];
    const respostas = [
      { data: null, error: { message: PAGINA_522 }, status: 522 },
      { data: null, error: { message: "fetch failed" }, status: 0 },
      { data: { ok: true }, error: null, status: 200 },
    ];
    const resultado = await tentarNoBanco(
      async () => respostas.shift()!,
      async (ms) => void esperas.push(ms),
    );
    expect(resultado.data).toEqual({ ok: true });
    expect(esperas).toEqual([1000, 2000]);
  });

  it("não repete erro de verdade e desiste depois de 4 tentativas", async () => {
    let chamadas = 0;
    const permanente = await tentarNoBanco(async () => {
      chamadas++;
      return { data: null, error: { message: "permission denied for table compras" }, status: 403 };
    });
    expect(chamadas).toBe(1);
    expect(permanente.error?.message).toContain("permission denied");

    chamadas = 0;
    const insistente = await tentarNoBanco(
      async () => {
        chamadas++;
        throw new Error("socket hang up");
      },
      async () => {},
    );
    expect(chamadas).toBe(4);
    expect(insistente.error?.message).toBe("socket hang up");
  });
});
