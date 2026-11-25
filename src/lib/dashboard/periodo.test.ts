import { describe, expect, it } from "vitest";

import { descreverPeriodo, enderecoDoPeriodo, lerPeriodo, limitesDoPeriodo, periodoDoAtalho } from "./periodo";

const HOJE = "2026-11-24";

describe("período do Dashboard", () => {
  it("sem nada no endereço, vale dos últimos 12 meses em diante (inclui as agendadas)", () => {
    expect(lerPeriodo({}, HOJE)).toEqual({ tipo: "12m", de: "2025-12-01", ate: null });
    expect(lerPeriodo({ periodo: "invalido" }, HOJE)).toEqual({ tipo: "12m", de: "2025-12-01", ate: null });
  });

  it("atalhos: este mês, este ano e tudo", () => {
    expect(lerPeriodo({ periodo: "mes" }, HOJE)).toEqual({ tipo: "mes", de: "2026-11-01", ate: "2026-11-30" });
    expect(lerPeriodo({ periodo: "ano" }, HOJE)).toEqual({ tipo: "ano", de: "2026-01-01", ate: "2026-12-31" });
    expect(lerPeriodo({ periodo: "tudo" }, HOJE)).toEqual({ tipo: "tudo", de: null, ate: null });
  });

  it("fim de mês e virada de ano", () => {
    expect(periodoDoAtalho("mes", "2028-02-10")).toMatchObject({ de: "2028-02-01", ate: "2028-02-29" });
    expect(periodoDoAtalho("mes", "2026-12-31")).toMatchObject({ de: "2026-12-01", ate: "2026-12-31" });
    expect(periodoDoAtalho("12m", "2027-01-05")).toMatchObject({ de: "2026-02-01", ate: null });
    expect(periodoDoAtalho("12m", "2026-12-15")).toMatchObject({ de: "2026-01-01", ate: null });
  });

  it("datas do formulário têm prioridade, aceitam só um lado e desinvertem", () => {
    expect(lerPeriodo({ periodo: "mes", de: "2026-10-01", ate: "2026-10-31" }, HOJE)).toEqual({
      tipo: "personalizado",
      de: "2026-10-01",
      ate: "2026-10-31",
    });
    expect(lerPeriodo({ de: "2026-10-01", ate: "" }, HOJE)).toEqual({ tipo: "personalizado", de: "2026-10-01", ate: null });
    expect(lerPeriodo({ de: "", ate: "2026-10-31" }, HOJE)).toEqual({ tipo: "personalizado", de: null, ate: "2026-10-31" });
    expect(lerPeriodo({ de: "2026-12-31", ate: "2026-01-01" }, HOJE)).toMatchObject({ de: "2026-01-01", ate: "2026-12-31" });
  });

  it("datas vazias ou inválidas no formulário valem como tudo", () => {
    expect(lerPeriodo({ de: "", ate: "" }, HOJE)).toEqual({ tipo: "tudo", de: null, ate: null });
    expect(lerPeriodo({ de: "2026-02-30", ate: "ontem" }, HOJE)).toEqual({ tipo: "tudo", de: null, ate: null });
  });

  it("limites da consulta no fuso de Brasília", () => {
    expect(limitesDoPeriodo({ tipo: "mes", de: "2026-11-01", ate: "2026-11-30" })).toEqual({
      de: "2026-11-01T00:00:00-03:00",
      ate: "2026-11-30T23:59:59.999-03:00",
    });
    expect(limitesDoPeriodo({ tipo: "tudo", de: null, ate: null })).toEqual({ de: null, ate: null });
  });

  it("descreve o período com as datas por extenso", () => {
    expect(descreverPeriodo(lerPeriodo({}, HOJE))).toBe("Disputas de 01/12/2025 em diante");
    expect(descreverPeriodo(lerPeriodo({ periodo: "mes" }, HOJE))).toBe("Disputas de 01/11/2026 a 30/11/2026");
    expect(descreverPeriodo(lerPeriodo({ de: "", ate: "2026-10-31" }, HOJE))).toBe("Disputas até 31/10/2026");
    expect(descreverPeriodo(lerPeriodo({ periodo: "tudo" }, HOJE))).toBe("Todas as disputas, de qualquer data");
  });

  it("endereço de cada atalho (o padrão fica sem parâmetro)", () => {
    expect(enderecoDoPeriodo("12m")).toBe("/dashboard");
    expect(enderecoDoPeriodo("ano")).toBe("/dashboard?periodo=ano");
  });
});
