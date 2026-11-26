import { describe, expect, it } from "vitest";

import { combinarAlertas, descreverAlerta, lerAlertas } from "./alertas";
import type { Alerta } from "./motor";

const textos = (alertas: Alerta[]) => alertas.map((a) => descreverAlerta(a).texto);

describe("alertas de amostra, comodato e visita técnica", () => {
  it("exigência clara chama a atenção; citação pede conferência", () => {
    expect(descreverAlerta({ tipo: "amostra", nivel: "exige" })).toEqual({ texto: "Exige amostra", tom: "atencao" });
    expect(descreverAlerta({ tipo: "amostra" })).toEqual({ texto: "Cita amostra, conferir", tom: "informacao" });
    expect(descreverAlerta({ tipo: "comodato", nivel: "exige" })).toEqual({ texto: "Prevê comodato", tom: "atencao" });
    expect(descreverAlerta({ tipo: "comodato" })).toEqual({ texto: "Cita comodato, conferir", tom: "informacao" });
    expect(descreverAlerta({ tipo: "visita_tecnica" }).texto).toBe("Cita visita técnica, conferir");
  });

  it("nenhum texto afirma que o edital não exige", () => {
    const todos: Alerta[] = [
      { tipo: "amostra" }, { tipo: "amostra", nivel: "exige" }, { tipo: "comodato" }, { tipo: "comodato", nivel: "exige" },
      { tipo: "visita_tecnica" }, { tipo: "visita_tecnica", nivel: "exige" },
    ];
    for (const texto of textos(todos)) expect(texto.toLowerCase()).not.toMatch(/n[ãa]o exige|sem exig|dispensa/);
  });
});

describe("combinarAlertas", () => {
  const daTriagem: Alerta[] = [{ tipo: "me_epp_repassar", itens: [1] }, { tipo: "amostra" }, { tipo: "lote_completo", lote: "2" }];

  it("sem leitura do edital, ficam os alertas da triagem", () => {
    expect(combinarAlertas(daTriagem, [])).toBe(daTriagem);
  });

  it("o edital substitui o alerta do mesmo tipo e a exigência vai para a frente", () => {
    const juntos = combinarAlertas(daTriagem, [
      { tipo: "amostra", nivel: "exige" },
      { tipo: "visita_tecnica", nivel: "cita" },
    ]);
    expect(textos(juntos)).toEqual([
      "Exige amostra",
      "Exclusivo ME/EPP – repassar a parceiro (item 1)",
      "Lote 2 completo",
      "Cita visita técnica, conferir",
    ]);
  });

  it("o que só o objeto cita continua aparecendo quando o edital não cita", () => {
    const juntos = combinarAlertas([{ tipo: "amostra" }, { tipo: "comodato" }], [{ tipo: "comodato", nivel: "exige" }]);
    expect(textos(juntos)).toEqual(["Prevê comodato", "Cita amostra, conferir"]);
  });

  it("o resultado passa pela leitura do banco sem perder o nível", () => {
    const juntos = combinarAlertas([], [{ tipo: "amostra", nivel: "exige" }]);
    expect(lerAlertas(JSON.parse(JSON.stringify(juntos)))).toEqual([{ tipo: "amostra", nivel: "exige" }]);
  });
});
