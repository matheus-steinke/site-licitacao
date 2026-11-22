import { describe, expect, it } from "vitest";

import { criarClientePncp, ErroPncp } from "./pncp";

type Resposta = { status: number; corpo?: string } | Error;

function clienteFalso(respostas: Resposta[], opcoes: { pausaMs?: number } = {}) {
  const urls: string[] = [];
  const esperas: number[] = [];
  const falhas: { tentativa: number; definitiva: boolean; status?: number; mensagem: string }[] = [];
  const cliente = criarClientePncp({
    pausaMs: opcoes.pausaMs ?? 0,
    esperaInicialMs: 1000,
    tentativas: 4,
    dormir: async (ms) => {
      esperas.push(ms);
    },
    aoFalhar: (f) => falhas.push(f),
    fetch: (async (url: string) => {
      urls.push(url);
      const resposta = respostas.shift();
      if (!resposta) throw new Error("sem resposta programada");
      if (resposta instanceof Error) throw resposta;
      return new Response(resposta.status === 204 ? null : (resposta.corpo ?? ""), { status: resposta.status });
    }) as typeof fetch,
  });
  return { cliente, urls, esperas, falhas };
}

describe("cliente do PNCP", () => {
  it("tenta de novo em 503, erro de rede e resposta que não é JSON, com espera crescente", async () => {
    const { cliente, esperas, falhas } = clienteFalso([
      { status: 503, corpo: "<html>503 Service Unavailable</html>" },
      new Error("socket hang up"),
      { status: 200, corpo: "<html>manutenção</html>" },
      { status: 200, corpo: '{"ok":true}' },
    ]);
    await expect(cliente.obterJson("/x")).resolves.toEqual({ ok: true });
    expect(esperas).toEqual([1000, 2000, 4000]);
    expect(falhas.map((f) => f.definitiva)).toEqual([false, false, false]);
    expect(cliente.chamadas).toBe(4);
  });

  it("desiste depois de 4 tentativas e informa a falha definitiva", async () => {
    const { cliente, falhas } = clienteFalso(Array.from({ length: 4 }, () => ({ status: 503 })));
    await expect(cliente.obterJson("/x")).rejects.toMatchObject({ status: 503, message: "HTTP 503" });
    expect(falhas).toHaveLength(4);
    expect(falhas[3]).toMatchObject({ tentativa: 4, definitiva: true, status: 503 });
  });

  it("não insiste em erro do pedido (400, 404)", async () => {
    const { cliente, urls } = clienteFalso([{ status: 404, corpo: "não achei" }]);
    await expect(cliente.obterJson("/x")).rejects.toBeInstanceOf(ErroPncp);
    expect(urls).toHaveLength(1);
  });

  it("trata 204 e corpo vazio como 'sem resultados'", async () => {
    const { cliente } = clienteFalso([{ status: 204 }, { status: 200, corpo: "  " }]);
    await expect(cliente.obterJson("/x")).resolves.toBeUndefined();
    await expect(cliente.obterJson("/y")).resolves.toBeUndefined();
  });

  it("monta a busca com o termo entre aspas, só editais recebendo proposta", async () => {
    const { cliente, urls } = clienteFalso([{ status: 200, corpo: '{"items":[],"total":0}' }]);
    await cliente.buscar("cateter duplo j", 2, [6, 8]);
    const url = new URL(urls[0]);
    expect(url.pathname).toBe("/api/search/");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: '"cateter duplo j"',
      tipos_documento: "edital",
      ordenacao: "-data",
      pagina: "2",
      tam_pagina: "100",
      status: "recebendo_proposta",
      modalidades: "6|8",
    });
  });

  it("pagina os itens de 500 em 500 e aceita lista vazia", async () => {
    const pagina = (n: number) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ numeroItem: i + 1 })));
    const { cliente, urls } = clienteFalso([
      { status: 200, corpo: pagina(500) },
      { status: 200, corpo: pagina(20) },
      { status: 204 },
    ]);
    expect(await cliente.itens("04092680000171", 2026, 156)).toHaveLength(520);
    expect(urls.map((u) => new URL(u).searchParams.get("pagina"))).toEqual(["1", "2"]);
    expect(await cliente.itens("04092680000171", 2026, 157)).toEqual([]);
  });

  it("respeita a pausa entre chamadas, mesmo em paralelo", async () => {
    const { cliente, esperas } = clienteFalso(
      Array.from({ length: 3 }, () => ({ status: 200, corpo: "{}" })),
      { pausaMs: 300 },
    );
    await Promise.all([cliente.obterJson("/a"), cliente.obterJson("/b"), cliente.obterJson("/c")]);
    // A primeira sai na hora; as outras duas esperam cerca de 300 e 600 ms.
    expect(esperas).toHaveLength(2);
    expect(esperas[0]).toBeGreaterThan(250);
    expect(esperas[1]).toBeGreaterThan(550);
  });
});
