import { describe, expect, it } from "vitest";

import { mesDaDisputa, resumirDashboard, type LinhaDoDashboard } from "./resumo";

const AGORA = new Date("2026-11-24T15:00:00Z").getTime(); // 12:00 em Brasília

let proximoId = 0;
function linha(dataDisputa: string, extras: Partial<LinhaDoDashboard> = {}): LinhaDoDashboard {
  return {
    id: `op-${++proximoId}`,
    status: "aprovada",
    dataDisputa,
    uf: "SC",
    municipio: "Florianópolis",
    orgao: "HOSPITAL DE TESTE",
    modalidade: "Pregão - Eletrônico",
    numeroCompra: "90001/2026",
    objeto: "Aquisição de materiais",
    situacaoId: 1,
    itensCompativeis: 1,
    itensAVerificar: 0,
    valor: 1000,
    ...extras,
  };
}

describe("resumo do Dashboard", () => {
  it("sem licitações aprovadas, tudo zerado", () => {
    expect(resumirDashboard([], AGORA)).toEqual({
      disputadas: 0,
      agendadas: 0,
      ganhas: 0,
      perdidas: 0,
      valorEmDisputa: 0,
      agendadasSemValor: 0,
      agendadasForaDoNormal: 0,
      porMes: [],
      porUf: [],
      proximas: [],
    });
  });

  it("disputada é a aprovada com data passada; agendada, a com data futura", () => {
    const r = resumirDashboard(
      [
        linha("2026-11-10T13:00:00+00:00"),
        linha("2026-11-24T14:59:00+00:00"), // um minuto atrás
        linha("2026-11-24T15:00:00+00:00"), // agora mesmo: ainda agendada
        linha("2026-12-03T13:00:00+00:00"),
      ],
      AGORA,
    );
    expect(r).toMatchObject({ disputadas: 2, agendadas: 2 });
  });

  it("o valor em disputa soma só as agendadas, pelo valor do lance mínimo", () => {
    const r = resumirDashboard(
      [
        linha("2026-11-10T13:00:00+00:00", { valor: 9999 }),
        linha("2026-12-03T13:00:00+00:00", { valor: 1234.56 }),
        linha("2026-12-09T13:00:00+00:00", { valor: 0.1 }),
        linha("2026-12-10T13:00:00+00:00", { valor: 0.2 }),
        linha("2026-12-11T13:00:00+00:00", { valor: 0, itensCompativeis: 0 }),
      ],
      AGORA,
    );
    expect(r.valorEmDisputa).toBe(1234.86);
    expect(r.agendadasSemValor).toBe(1);
  });

  it("ganha e perdida contam como disputadas, mesmo com a data remarcada para a frente", () => {
    const r = resumirDashboard(
      [
        linha("2026-11-10T13:00:00+00:00", { status: "ganha" }),
        linha("2026-11-11T13:00:00+00:00", { status: "perdida" }),
        linha("2026-12-20T13:00:00+00:00", { status: "perdida", valor: 500 }),
        linha("2026-11-12T13:00:00+00:00"),
      ],
      AGORA,
    );
    expect(r).toMatchObject({ disputadas: 4, agendadas: 0, ganhas: 1, perdidas: 2, valorEmDisputa: 0 });
  });

  it("avisa das agendadas suspensas, revogadas ou anuladas, que continuam na conta", () => {
    const r = resumirDashboard(
      [
        linha("2026-12-03T13:00:00+00:00", { situacaoId: 4 }),
        linha("2026-12-04T13:00:00+00:00", { situacaoId: 2 }),
        linha("2026-12-05T13:00:00+00:00"),
        linha("2026-11-05T13:00:00+00:00", { situacaoId: 3 }),
      ],
      AGORA,
    );
    expect(r).toMatchObject({ agendadas: 3, agendadasForaDoNormal: 2, valorEmDisputa: 3000 });
  });

  it("por mês: usa o horário de Brasília e preenche os meses sem disputa", () => {
    expect(mesDaDisputa("2026-12-01T02:00:00+00:00")).toBe("2026-11"); // 23h de 30/11 em Brasília
    expect(mesDaDisputa("2026-12-01T03:00:00+00:00")).toBe("2026-12");

    const r = resumirDashboard(
      [
        linha("2026-09-15T13:00:00+00:00", { valor: 100 }),
        linha("2026-11-10T13:00:00+00:00", { valor: 200 }),
        linha("2026-11-28T13:00:00+00:00", { valor: 300 }),
        linha("2027-01-08T13:00:00+00:00", { valor: 400 }),
      ],
      AGORA,
    );
    expect(r.porMes.map((m) => [m.mes, m.disputadas, m.agendadas, m.valor])).toEqual([
      ["2026-09", 1, 0, 100],
      ["2026-10", 0, 0, 0],
      ["2026-11", 1, 1, 500],
      ["2026-12", 0, 0, 0],
      ["2027-01", 0, 1, 400],
    ]);
    expect(r.porMes[2]).toMatchObject({ rotulo: "nov", ano: "2026", nome: "novembro de 2026" });
    expect(r.porMes[4]).toMatchObject({ rotulo: "jan", ano: "2027", nome: "janeiro de 2027" });
  });

  it("por estado: do que tem mais licitações para o que tem menos", () => {
    const r = resumirDashboard(
      [
        linha("2026-11-10T13:00:00+00:00", { uf: "PR" }),
        linha("2026-12-03T13:00:00+00:00", { uf: "SC" }),
        linha("2026-12-04T13:00:00+00:00", { uf: "SC", valor: 50 }),
        linha("2026-11-11T13:00:00+00:00", { uf: "SC" }),
        linha("2026-12-05T13:00:00+00:00", { uf: "RS" }),
      ],
      AGORA,
    );
    expect(r.porUf).toEqual([
      { uf: "SC", disputadas: 1, agendadas: 2, valor: 2050 },
      { uf: "PR", disputadas: 1, agendadas: 0, valor: 1000 },
      { uf: "RS", disputadas: 0, agendadas: 1, valor: 1000 },
    ]);
  });

  it("próximas disputas: só as agendadas, da mais próxima para a mais distante", () => {
    const r = resumirDashboard(
      [
        linha("2026-12-20T13:00:00+00:00", { orgao: "C" }),
        linha("2026-11-10T13:00:00+00:00", { orgao: "já foi" }),
        linha("2026-11-25T13:00:00+00:00", { orgao: "A" }),
        linha("2026-12-03T13:00:00+00:00", { orgao: "B" }),
      ],
      AGORA,
    );
    expect(r.proximas.map((p) => p.orgao)).toEqual(["A", "B", "C"]);
  });
});
