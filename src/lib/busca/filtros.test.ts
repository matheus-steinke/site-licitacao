import { describe, expect, it } from "vitest";

import {
  enderecoDaBusca,
  lerFiltros,
  lerSalvos,
  paraSalvar,
  parametrosDosFiltros,
  periodoDaBusca,
  temFiltroAlterado,
  type Parametros,
} from "./filtros";

const PADRAO = { ufs: ["SC", "PR"], hoje: "2026-11-24" };
const SEG = "9a144601-7540-4fda-875f-8d370f7f1415";
const ler = (params: Parametros) => lerFiltros(params, PADRAO);

describe("filtros da busca", () => {
  it("sem parâmetros: estados da empresa e disputas de hoje em diante", () => {
    expect(ler({})).toEqual({
      q: "",
      ufs: ["PR", "SC"],
      segmentos: [],
      de: "hoje",
      ate: null,
      modalidades: [],
      situacoes: [],
      soCatalogo: false,
      pagina: 1,
    });
    expect(temFiltroAlterado(ler({}), PADRAO)).toBe(false);
  });

  it("formulário enviado sem estado marcado nem data: todos os estados, qualquer data", () => {
    const f = ler({ f: "1", q: "  cateter   duplo j ", de: "" });
    expect(f).toMatchObject({ q: "cateter duplo j", ufs: null, de: null });
    expect(temFiltroAlterado(f, PADRAO)).toBe(true);
  });

  it("lê listas repetidas ou separadas por vírgula e descarta o que não é válido", () => {
    const f = ler({
      f: "1",
      ufs: ["sc", "XX", "RS,pr"],
      segmentos: [SEG.toUpperCase(), "não-é-id"],
      modalidades: ["8", "6", "99", "8"],
      situacoes: "4,1,abc",
      catalogo: "1",
      pagina: "3",
    });
    expect(f).toMatchObject({
      ufs: ["PR", "RS", "SC"],
      segmentos: [SEG],
      modalidades: [6, 8],
      situacoes: [1, 4],
      soCatalogo: true,
      pagina: 3,
    });
  });

  it("todos os 27 estados marcados é o mesmo que todos", () => {
    const todos = "AC,AL,AP,AM,BA,CE,DF,ES,GO,MA,MT,MS,MG,PA,PB,PR,PE,PI,RJ,RN,RS,RO,RR,SC,SP,SE,TO";
    expect(ler({ f: "1", ufs: todos }).ufs).toBeNull();
    expect(ler({ ufs: "todos" }).ufs).toBeNull();
  });

  it("datas: hoje acompanha o dia; data inválida é ignorada", () => {
    expect(ler({ f: "1", de: "2026-11-24" }).de).toBe("hoje");
    expect(ler({ f: "1", de: "hoje" }).de).toBe("hoje");
    expect(ler({ f: "1", de: "2026-12-01", ate: "2026-12-31" })).toMatchObject({ de: "2026-12-01", ate: "2026-12-31" });
    expect(ler({ f: "1", de: "2026-02-30", ate: "31/12/2026" })).toMatchObject({ de: null, ate: null });
  });

  it("página inválida vira 1", () => {
    expect(ler({ pagina: "0" }).pagina).toBe(1);
    expect(ler({ pagina: "abc" }).pagina).toBe(1);
    expect(ler({ pagina: "-2" }).pagina).toBe(1);
  });

  it("o endereço canônico volta para os mesmos filtros", () => {
    const original = ler({
      f: "1",
      q: "fio guia 0,035",
      ufs: ["SC", "SP"],
      segmentos: SEG,
      de: "2026-12-01",
      ate: "2026-12-31",
      modalidades: "6",
      situacoes: ["1", "4"],
      catalogo: "1",
    });
    const params = parametrosDosFiltros(original, 2);
    const deVolta = ler(Object.fromEntries([...new Set(params.keys())].map((k) => [k, params.getAll(k)])));
    expect(deVolta).toEqual({ ...original, pagina: 2 });
    expect(enderecoDaBusca(ler({}))).toBe("/busca?f=1&ufs=PR&ufs=SC&de=hoje");
    expect(enderecoDaBusca(ler({ f: "1" }))).toBe("/busca?f=1&ufs=todos");
  });

  it("busca salva: guarda sem a página e lê de volta, mesmo com campos faltando", () => {
    const original = ler({ f: "1", q: "duplo j", ufs: "SC", de: "hoje", situacoes: "1", pagina: "4" });
    const salvo = JSON.parse(JSON.stringify(paraSalvar(original)));
    expect(salvo).not.toHaveProperty("pagina");
    expect(lerSalvos(salvo, "2026-12-10")).toEqual({ ...original, pagina: 1 });
    // "hoje" continua sendo hoje no dia em que a busca salva é aberta.
    expect(periodoDaBusca(lerSalvos(salvo, "2026-12-10"), "2026-12-10").de).toBe("2026-12-10T00:00:00-03:00");
    expect(lerSalvos({ ufs: null }, "2026-12-10")).toMatchObject({ q: "", ufs: null, de: null, segmentos: [] });
    expect(lerSalvos("lixo", "2026-12-10")).toMatchObject({ q: "", ufs: null });
  });

  it("período em instantes de Brasília", () => {
    expect(periodoDaBusca(ler({}), "2026-11-24")).toEqual({ de: "2026-11-24T00:00:00-03:00", ate: null });
    expect(periodoDaBusca(ler({ f: "1", de: "", ate: "2026-12-31" }), "2026-11-24")).toEqual({
      de: null,
      ate: "2026-12-31T23:59:59.999-03:00",
    });
  });
});
