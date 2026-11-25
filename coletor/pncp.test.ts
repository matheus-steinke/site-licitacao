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
    // 503 e "não é JSON" esperam 1 s e 2 s; a queda de conexão, no meio, espera pouco.
    expect(esperas).toEqual([1000, 333, 2000]);
    expect(falhas.map((f) => f.definitiva)).toEqual([false, false, false]);
    expect(cliente.chamadas).toBe(4);
  });

  it("insiste até 10 vezes quando a conexão é derrubada, com espera curta", async () => {
    const queda = () => Object.assign(new TypeError("fetch failed"), { cause: { code: "UND_ERR_SOCKET" } });
    const nove = clienteFalso([...Array.from({ length: 9 }, queda), { status: 200, corpo: '{"ok":true}' }]);
    await expect(nove.cliente.obterJson("/x")).resolves.toEqual({ ok: true });
    expect(nove.esperas).toEqual([333, 666, 1332, 2664, 4000, 4000, 4000, 4000, 4000]);

    const dez = clienteFalso(Array.from({ length: 10 }, queda));
    await expect(dez.cliente.obterJson("/x")).rejects.toMatchObject({ message: "fetch failed (UND_ERR_SOCKET)" });
    expect(dez.cliente.chamadas).toBe(10);
    expect(dez.falhas.at(-1)).toMatchObject({ tentativa: 10, definitiva: true });
  });

  it("quedas de conexão não gastam as tentativas das falhas lentas", async () => {
    const queda = () => Object.assign(new TypeError("fetch failed"), { cause: { code: "UND_ERR_SOCKET" } });
    const { cliente } = clienteFalso([
      queda(), { status: 503 }, queda(), { status: 503 }, queda(), { status: 503 }, queda(),
      { status: 200, corpo: "{}" },
    ]);
    // 4 quedas + 3 erros 503 e ainda assim chega à resposta (o limite de 503 é 4).
    await expect(cliente.obterJson("/x")).resolves.toEqual({});
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

  it("busca vários números de controle numa chamada, em qualquer situação, e só aceita os controles pedidos", async () => {
    const a = "06140818000196-1-000056/2026";
    const b = "27080605002059-1-000333/2026";
    const excluida = "01203485000183-1-000129/2026";
    const item = (numero: string, situacao: string) => ({ numero_controle_pncp: numero, situacao_id: situacao });
    const { cliente, urls } = clienteFalso([
      // Outro edital que só cita um dos números no texto não serve.
      { status: 200, corpo: JSON.stringify({ items: [item("99999999000199-1-000001/2026", "1"), item(a, "4"), item(b, "2")], total: 3 }) },
    ]);
    const achadas = await cliente.buscarPorControles([a, b, excluida]);
    expect([...achadas.keys()]).toEqual([a, b]);
    expect(achadas.get(a)).toMatchObject({ situacao_id: "4" });
    expect(achadas.has(excluida)).toBe(false);

    const url = new URL(urls[0]);
    expect(url.pathname).toBe("/api/search/");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: `"${a}" OR "${b}" OR "${excluida}"`,
      tipos_documento: "edital",
      ordenacao: "-data",
      pagina: "1",
      tam_pagina: "100",
      status: "todos",
    });
  });

  it("lista vazia de controles não chama o PNCP; mais de 20 por chamada é recusado", async () => {
    const { cliente, urls } = clienteFalso([]);
    await expect(cliente.buscarPorControles([])).resolves.toEqual(new Map());
    await expect(cliente.buscarPorControles(Array.from({ length: 21 }, (_, i) => `c${i}`))).rejects.toThrow("No máximo 20");
    expect(urls).toEqual([]);
  });

  it("a API de consulta (detalhe, plano B) tem fila própria, mais lenta que as outras", async () => {
    const { cliente, esperas } = clienteFalso(
      Array.from({ length: 4 }, () => ({ status: 200, corpo: "{}" })),
      { pausaMs: 300 },
    );
    await Promise.all([
      cliente.detalhe("04092680000171", 2026, 1),
      cliente.detalhe("04092680000171", 2026, 2),
      cliente.obterJson("/api/search/?q=x"),
      cliente.detalhe("04092680000171", 2026, 3),
    ]);
    // 2º detalhe: 1,2 s depois do 1º. A busca só respeita a pausa geral (300 ms depois dele).
    // 3º detalhe: mais 1,2 s depois do 2º.
    expect(esperas).toHaveLength(3);
    expect(esperas[0]).toBeGreaterThan(1150);
    expect(esperas[1]).toBeGreaterThan(1450);
    expect(esperas[1]).toBeLessThan(1600);
    expect(esperas[2]).toBeGreaterThan(2350);
  });

  it("depois de um 429 (limite de requisições) espera bem mais antes de insistir", async () => {
    const { cliente, esperas } = clienteFalso([
      { status: 429, corpo: "<html>Limite de requisições excedido</html>" },
      { status: 429 },
      { status: 200, corpo: '{"ok":true}' },
    ]);
    await expect(cliente.obterJson("/x")).resolves.toEqual({ ok: true });
    expect(esperas).toEqual([5000, 10000]);
  });

  it("410 (contratação excluída) não é tentado de novo e chega a quem chamou", async () => {
    const { cliente, urls } = clienteFalso([{ status: 410, corpo: '{"message":"A contratação informada foi excluída"}' }]);
    await expect(cliente.detalhe("01203485000183", 2026, 129)).rejects.toMatchObject({ status: 410 });
    expect(urls).toHaveLength(1);
  });
});

describe("mensagem de erro de conexão", () => {
  it("inclui o motivo real junto de 'fetch failed'", async () => {
    const falhas: string[] = [];
    const cliente = criarClientePncp({
      pausaMs: 0,
      tentativas: 1,
      tentativasEmQueda: 1,
      aoFalhar: (f) => falhas.push(f.mensagem),
      fetch: (async () => {
        throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });
      }) as typeof fetch,
    });
    await expect(cliente.obterJson("/x")).rejects.toMatchObject({ message: "fetch failed (ECONNRESET)" });
    expect(falhas).toEqual(["fetch failed (ECONNRESET)"]);
  });
});

describe("limite duro de tempo", () => {
  it("desiste de uma chamada que nunca responde e tenta de novo", async () => {
    let chamadas = 0;
    const cliente = criarClientePncp({
      pausaMs: 0,
      timeoutMs: 20,
      folgaDoLimiteMs: 20,
      tentativas: 2,
      esperaInicialMs: 1,
      dormir: async () => {},
      // Ignora o sinal de cancelamento de propósito: simula uma conexão pendurada.
      fetch: (() => {
        chamadas++;
        return new Promise<Response>(() => {});
      }) as typeof fetch,
    });
    await expect(cliente.obterJson("/x")).rejects.toMatchObject({ message: expect.stringContaining("sem resposta") });
    expect(chamadas).toBe(2);
  });
});
