import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import type { Database } from "../supabase/tipos";
import { triarLote, triarOrganizacao, type MemoriaDaTriagem } from "./executar";

type Chamada = { funcao: string; argumentos: Record<string, unknown> };

/** Imita só o que a triagem usa do cliente do Supabase: rpc() e leituras simples com filtros. */
function bancoFalso(opcoes: {
  lotes: unknown[];
  gravacoes?: unknown[];
  produtos?: unknown[];
  exclusoes?: string[];
}) {
  const chamadas: Chamada[] = [];
  const leituras: string[] = [];
  const lotes = [...opcoes.lotes];
  const gravacoes = [...(opcoes.gravacoes ?? [])];
  const tabelas: Record<string, unknown> = {
    organizacoes: { porte: "demais", score_compativel: 60, score_verificar: 40 },
    organizacao_segmentos: [{ segmento_id: "seg-uro" }],
    organizacao_exclusoes: (opcoes.exclusoes ?? []).map((termo) => ({ termo })),
    produtos: opcoes.produtos ?? [
      { id: "p1", codigo: "1", nome: "CATETER URETERAL DUPLO J 6FR X 26CM", palavras_chave: [], medidas: null, marca: null, fabricante: null, lance_minimo: 100 },
    ],
  };
  const consulta = (tabela: string) => {
    const resposta = { data: tabelas[tabela], error: null };
    const cadeia: Record<string, unknown> = {
      then: (resolver: (r: typeof resposta) => unknown) => Promise.resolve(resposta).then(resolver),
    };
    for (const metodo of ["select", "eq", "order", "range", "single"]) cadeia[metodo] = () => cadeia;
    return cadeia;
  };
  const supabase = {
    rpc: async (funcao: string, argumentos: Record<string, unknown>) => {
      chamadas.push({ funcao, argumentos });
      if (funcao === "triagem_lote") {
        return { data: lotes.shift() ?? { config_em: "c1", marca_ate: null, restantes: 0, compras: [] }, error: null };
      }
      if (funcao === "triagem_gravar") return { data: gravacoes.shift() ?? { ok: true }, error: null };
      return { data: null, error: { message: `função inesperada: ${funcao}` } };
    },
    from: (tabela: string) => {
      leituras.push(tabela);
      return consulta(tabela);
    },
  } as unknown as SupabaseClient<Database>;
  return { supabase, chamadas, leituras };
}

const item = (numero: number, descricao: string, segmentos: string[] = []) => ({
  id: `i${numero}`,
  numero,
  descricao,
  quantidade: 10,
  valor: 200,
  me_epp: false,
  segmentos,
});

const LOTE = {
  config_em: "2026-11-24T12:00:00.123456+00:00",
  marca_ate: "2026-11-24T11:00:00.654321+00:00",
  restantes: 0,
  compras: [
    { id: "c1", objeto: "Aquisição de cateteres", itens: [item(1, "CATETER DUPLO J 6FR 26CM"), item(2, "SERINGA 10 ML")] },
    { id: "c2", objeto: "Sondas", itens: [item(1, "SONDA URETRAL Nº 12", ["seg-uro"])] },
    { id: "c3", objeto: "Material de limpeza", itens: [] },
  ],
};

describe("execução da triagem em lotes", () => {
  it("compara as compras do lote com o catálogo e grava o resultado", async () => {
    const { supabase, chamadas } = bancoFalso({ lotes: [LOTE] });
    const r = await triarLote(supabase, "org-1");
    expect(r).toEqual({ feitas: 3, oportunidades: 2, restantes: 0, refazer: false });

    const gravacao = chamadas.find((c) => c.funcao === "triagem_gravar")!.argumentos;
    // As marcas de tempo voltam para o banco exatamente como vieram.
    expect(gravacao).toMatchObject({ p_org: "org-1", p_config_em: LOTE.config_em, p_marca_ate: LOTE.marca_ate });
    const resultados = gravacao.p_resultados as { compra_id: string; prioridade: number; itens: unknown[] }[];
    expect(resultados.map((x) => [x.compra_id, x.prioridade])).toEqual([["c1", 3], ["c2", 1], ["c3", 0]]);
    expect(resultados[0]).toMatchObject({
      itens_compativeis: 1,
      valor_estimado: 2000,
      itens: [{ item_id: "i1", produto_id: "p1", nivel: "compativel", lote: null }],
    });
  });

  it("sem nada pendente, não carrega o catálogo nem grava", async () => {
    const { supabase, chamadas, leituras } = bancoFalso({ lotes: [] });
    expect(await triarLote(supabase, "org-1")).toEqual({ feitas: 0, oportunidades: 0, restantes: 0, refazer: false });
    expect(chamadas.map((c) => c.funcao)).toEqual(["triagem_lote"]);
    expect(leituras).toEqual([]);
  });

  it("se a configuração mudou durante o lote, pede para refazer e recarrega o catálogo", async () => {
    const { supabase, leituras } = bancoFalso({
      lotes: [LOTE, { ...LOTE, config_em: "c2" }],
      gravacoes: [{ ok: false, motivo: "config_mudou" }, { ok: true }],
    });
    const memoria: MemoriaDaTriagem = {};
    expect(await triarLote(supabase, "org-1", {}, memoria)).toMatchObject({ feitas: 0, refazer: true });
    expect(await triarLote(supabase, "org-1", {}, memoria)).toMatchObject({ feitas: 3, refazer: false });
    expect(leituras.filter((t) => t === "produtos")).toHaveLength(2);
  });

  it("organização inteira: vários lotes com o catálogo carregado uma vez só", async () => {
    const { supabase, chamadas, leituras } = bancoFalso({ lotes: [{ ...LOTE, restantes: 5 }, { ...LOTE, restantes: 0 }] });
    const r = await triarOrganizacao(supabase, "org-1");
    expect(r).toEqual({ feitas: 6, oportunidades: 4, restantes: 0, lotes: 2 });
    expect(chamadas.filter((c) => c.funcao === "triagem_gravar")).toHaveLength(2);
    expect(leituras.filter((t) => t === "produtos")).toHaveLength(1);
  });

  it("para quando o tempo acaba e informa o que ficou pendente", async () => {
    let relogio = 0;
    const { supabase } = bancoFalso({ lotes: [{ ...LOTE, restantes: 50 }, { ...LOTE, restantes: 40 }] });
    const r = await triarOrganizacao(supabase, "org-1", { tempoMaximoMs: 1000, agora: () => (relogio += 600) });
    expect(r).toMatchObject({ lotes: 1, restantes: 50 });
  });

  it("aplica as exclusões da empresa", async () => {
    const { supabase, chamadas } = bancoFalso({ lotes: [LOTE], exclusoes: ["sonda uretral", "duplo j"] });
    await triarLote(supabase, "org-1");
    const resultados = chamadas.find((c) => c.funcao === "triagem_gravar")!.argumentos.p_resultados as { prioridade: number }[];
    expect(resultados.map((x) => x.prioridade)).toEqual([0, 0, 0]);
  });
});
