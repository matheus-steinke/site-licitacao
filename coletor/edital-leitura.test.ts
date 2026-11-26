import { describe, expect, it } from "vitest";

import { VERSAO_DAS_REGRAS } from "../src/lib/edital/regras";
import {
  criarDownload,
  enderecoDoPncp,
  escolherArquivos,
  FALHAS_PARA_PARAR,
  FalhaDeDownload,
  lerEditais,
  MAXIMO_DE_ARQUIVOS,
  type ArquivoDoEdital,
  type EditalPendente,
  type LeituraParaGravar,
} from "./edital-leitura";
import { PdftotextAusente } from "./edital-texto";

const url = (compra: string, n: number) => `https://pncp.gov.br/pncp-api/v1/orgaos/${compra}/compras/2026/1/arquivos/${n}`;
const arquivo = (compra: string, n: number, tipo: string | null = "Edital"): ArquivoDoEdital => ({
  sequencial: n,
  titulo: `${tipo ?? "Arquivo"} ${n}`,
  tipo,
  url: url(compra, n),
});
const pendente = (compra: string, arquivos: ArquivoDoEdital[]): EditalPendente => ({
  compra_id: compra,
  controle_pncp: `${compra}-1-000001/2026`,
  assinatura: `assinatura-${compra}`,
  arquivos,
});

const TEXTO_QUE_EXIGE = "Termo de referência. 4.3.1. Será exigida apresentação de amostras de todos os itens. ".repeat(5);
const TEXTO_QUE_CITA = "Edital. Caso o termo de referência exija a apresentação de amostra, o licitante deverá apresentá-la. ".repeat(5);
const TEXTO_SEM_ALERTA = "Aquisição de cateteres e sondas para as unidades de saúde do município, conforme o termo. ".repeat(5);

/** Fila em memória: o que foi gravado sem erro sai; o resto continua pendente. */
function cenario(fila: EditalPendente[], conteudos: Record<string, string | Error>) {
  const gravadas: LeituraParaGravar[] = [];
  const baixadas: string[] = [];
  const pausas: number[] = [];
  let relogio = 0;
  const deps = {
    repositorio: {
      async pendentes(versao: number, limite: number) {
        expect(versao).toBe(VERSAO_DAS_REGRAS);
        const abertas = fila.filter((p) => !gravadas.some((g) => g.compraId === p.compra_id));
        return { restantes: abertas.length, compras: abertas.slice(0, limite) };
      },
      async gravar(leitura: LeituraParaGravar) {
        gravadas.push(leitura);
      },
    },
    async baixar(endereco: string) {
      baixadas.push(endereco);
      const conteudo = conteudos[endereco];
      if (conteudo instanceof Error) throw conteudo;
      if (conteudo === undefined) throw new FalhaDeDownload("O PNCP respondeu HTTP 404.", false);
      return new TextEncoder().encode(conteudo);
    },
    async extrair(conteudo: Uint8Array) {
      const texto = new TextDecoder().decode(conteudo);
      if (texto === "SEM PDFTOTEXT") throw new PdftotextAusente();
      if (texto === "QUEBRA") throw new Error("arquivo corrompido");
      return { texto: texto === "IMAGEM" ? " \f " : texto, formato: "pdf" as const };
    },
    agora: () => relogio,
    pausa: async (ms: number) => {
      pausas.push(ms);
      relogio += ms;
    },
    registrar: () => {},
  };
  return { deps, gravadas, baixadas, pausas, avancar: (ms: number) => (relogio += ms) };
}

describe("escolherArquivos", () => {
  it("fica com edital, termo de referência e aviso, nessa ordem, e ignora os outros anexos", () => {
    const escolhidos = escolherArquivos([
      arquivo("a", 1, "Outros Documentos"),
      arquivo("a", 2, "Termo de Referência"),
      arquivo("a", 3, "Edital"),
      arquivo("a", 4, "Estudo Técnico Preliminar"),
      arquivo("a", 5, "Aviso de Contratação Direta"),
      arquivo("a", 6, "Edital"),
    ]);
    expect(escolhidos.map((a) => a.sequencial)).toEqual([3, 6, 2, 5]);
  });

  it("sem nenhum dos principais, lê o que houver, até o limite", () => {
    expect(escolherArquivos([arquivo("a", 2, "Outros Documentos"), arquivo("a", 1, null)]).map((a) => a.sequencial)).toEqual([1, 2]);
    const muitos = Array.from({ length: 20 }, (_, i) => arquivo("a", i + 1));
    expect(escolherArquivos(muitos)).toHaveLength(MAXIMO_DE_ARQUIVOS);
  });
});

describe("enderecoDoPncp", () => {
  it("só aceita https do PNCP", () => {
    expect(enderecoDoPncp("https://pncp.gov.br/pncp-api/v1/orgaos/1/compras/2026/1/arquivos/1")).toBe(true);
    expect(enderecoDoPncp("https://treina.pncp.gov.br/x")).toBe(true);
    expect(enderecoDoPncp("http://pncp.gov.br/x")).toBe(false);
    expect(enderecoDoPncp("https://pncp.gov.br.exemplo.com/x")).toBe(false);
    expect(enderecoDoPncp("https://169.254.169.254/latest/meta-data")).toBe(false);
    expect(enderecoDoPncp("file:///etc/passwd")).toBe(false);
    expect(enderecoDoPncp("isto não é endereço")).toBe(false);
  });
});

describe("criarDownload", () => {
  const resposta = (status: number, corpo = "conteúdo", cabecalhos: Record<string, string> = {}) =>
    new Response(status === 204 ? null : corpo, { status, headers: cabecalhos });

  it("tenta de novo quando o PNCP falha e desiste como falha transitória", async () => {
    const respostas = [resposta(503), resposta(429), resposta(200, "edital")];
    const esperas: number[] = [];
    const baixar = criarDownload({ buscar: async () => respostas.shift()!, pausa: async (ms) => void esperas.push(ms), esperaMs: 10 });
    expect(new TextDecoder().decode(await baixar(url("a", 1)))).toBe("edital");
    expect(esperas).toEqual([10, 20]);

    const semSorte = criarDownload({ buscar: async () => resposta(503), pausa: async () => {}, esperaMs: 1 });
    await expect(semSorte(url("a", 1))).rejects.toMatchObject({ transitoria: true });
    const rede = criarDownload({ buscar: async () => Promise.reject(new Error("socket hang up")), pausa: async () => {}, esperaMs: 1 });
    await expect(rede(url("a", 1))).rejects.toMatchObject({ transitoria: true, message: expect.stringContaining("socket hang up") });
  });

  it("erro do arquivo (4xx), arquivo grande e endereço de fora não são tentados de novo", async () => {
    let chamadas = 0;
    const baixar = criarDownload({ buscar: async () => (chamadas++, resposta(422)), pausa: async () => {} });
    await expect(baixar(url("a", 1))).rejects.toMatchObject({ transitoria: false, message: "O PNCP respondeu HTTP 422." });
    expect(chamadas).toBe(1);

    const anunciado = criarDownload({ buscar: async () => resposta(200, "x", { "content-length": "999999" }), limiteBytes: 100 });
    await expect(anunciado(url("a", 1))).rejects.toMatchObject({ transitoria: false });
    const semAnuncio = criarDownload({ buscar: async () => resposta(200, "x".repeat(500)), limiteBytes: 100 });
    await expect(semAnuncio(url("a", 1))).rejects.toMatchObject({ transitoria: false });

    const fora = criarDownload({ buscar: async () => { throw new Error("não deveria buscar"); } });
    await expect(fora("https://exemplo.com/edital.pdf")).rejects.toMatchObject({ transitoria: false });
  });
});

describe("lerEditais", () => {
  it("lê, classifica e grava só alertas e trechos", async () => {
    const c = cenario(
      [
        pendente("exige", [arquivo("exige", 1, "Edital"), arquivo("exige", 2, "Termo de Referência"), arquivo("exige", 3, "Outros Documentos")]),
        pendente("cita", [arquivo("cita", 1)]),
        pendente("nada", [arquivo("nada", 1)]),
        pendente("imagem", [arquivo("imagem", 1)]),
      ],
      {
        [url("exige", 1)]: TEXTO_QUE_CITA,
        [url("exige", 2)]: TEXTO_QUE_EXIGE,
        [url("cita", 1)]: TEXTO_QUE_CITA,
        [url("nada", 1)]: TEXTO_SEM_ALERTA,
        [url("imagem", 1)]: "IMAGEM",
      },
    );
    const resumo = await lerEditais(c.deps, { pausaMs: 5 });

    expect(resumo).toEqual({ lidas: 3, comExigencia: 1, comCitacao: 1, semTexto: 1, erros: 0, restantes: 0, interrompida: null });
    expect(c.baixadas).not.toContain(url("exige", 3));
    const [exige, cita, nada, imagem] = c.gravadas;
    expect(exige).toMatchObject({
      compraId: "exige", status: "lido", assinatura: "assinatura-exige", versao: VERSAO_DAS_REGRAS,
      arquivosLidos: 2, arquivosTotal: 2, erro: null, alertas: [{ tipo: "amostra", nivel: "exige" }],
    });
    expect(exige.trechos[0]).toMatchObject({ tipo: "amostra", arquivo: "Termo de Referência 2" });
    expect(JSON.stringify(exige).length).toBeLessThan(3000);
    expect(cita.alertas).toEqual([{ tipo: "amostra", nivel: "cita" }]);
    expect(nada).toMatchObject({ status: "lido", alertas: [], trechos: [] });
    expect(imagem).toMatchObject({ status: "sem_texto", alertas: [], trechos: [], arquivosLidos: 0 });
    // Uma pausa entre cada download.
    expect(c.pausas.filter((ms) => ms === 5).length).toBe(c.baixadas.length - 1);
  });

  it("parte dos arquivos falha: fica o que foi lido, com o erro anotado para tentar de novo", async () => {
    const c = cenario([pendente("a", [arquivo("a", 1), arquivo("a", 2, "Termo de Referência")])], {
      [url("a", 1)]: new FalhaDeDownload("O PNCP respondeu HTTP 422.", false),
      [url("a", 2)]: TEXTO_QUE_EXIGE,
    });
    await lerEditais(c.deps, { pausaMs: 0 });
    expect(c.gravadas[0]).toMatchObject({ status: "lido", arquivosLidos: 1, arquivosTotal: 2 });
    expect(c.gravadas[0].erro).toContain("1 de 2 arquivo(s) com falha");
    expect(c.gravadas[0].alertas).toEqual([{ tipo: "amostra", nivel: "exige" }]);
  });

  it("nenhum arquivo baixado vira erro; arquivo que não abre não derruba a rodada", async () => {
    const c = cenario([pendente("a", [arquivo("a", 1)]), pendente("b", [arquivo("b", 1)])], {
      [url("a", 1)]: new FalhaDeDownload("O PNCP respondeu HTTP 422.", false),
      [url("b", 1)]: "QUEBRA",
    });
    const resumo = await lerEditais(c.deps, { pausaMs: 0 });
    expect(c.gravadas.map((g) => g.status)).toEqual(["erro", "sem_texto"]);
    expect(c.gravadas[0].erro).toContain("HTTP 422");
    expect(c.gravadas[1].erro).toContain("arquivo corrompido");
    expect(resumo).toMatchObject({ erros: 1, semTexto: 1, interrompida: null });
  });

  it("PNCP fora do ar: para depois de algumas licitações seguidas e não grava essas falhas", async () => {
    const fila = Array.from({ length: 10 }, (_, i) => pendente(`c${i}`, [arquivo(`c${i}`, 1)]));
    const conteudos = Object.fromEntries(fila.map((p) => [p.arquivos[0].url, new FalhaDeDownload("O PNCP não entregou o arquivo (HTTP 503).", true)]));
    const c = cenario(fila, conteudos);
    const resumo = await lerEditais(c.deps, { pausaMs: 0 });
    expect(c.baixadas).toHaveLength(FALHAS_PARA_PARAR);
    expect(c.gravadas).toEqual([]);
    expect(resumo.interrompida).toContain("o PNCP não entregou");
    expect(resumo.restantes).toBe(10);
  });

  it("falha isolada do PNCP entre leituras boas conta como tentativa", async () => {
    const c = cenario([pendente("a", [arquivo("a", 1)]), pendente("b", [arquivo("b", 1)]), pendente("c", [arquivo("c", 1)])], {
      [url("a", 1)]: new FalhaDeDownload("O PNCP não entregou o arquivo (HTTP 503).", true),
      [url("b", 1)]: TEXTO_SEM_ALERTA,
      [url("c", 1)]: new FalhaDeDownload("O PNCP não entregou o arquivo (HTTP 503).", true),
    });
    const resumo = await lerEditais(c.deps, { pausaMs: 0 });
    expect(c.gravadas.map((g) => `${g.compraId}:${g.status}`)).toEqual(["a:erro", "b:lido", "c:erro"]);
    expect(resumo).toMatchObject({ lidas: 1, erros: 2, interrompida: null });
  });

  it("respeita o tempo e o limite de licitações da rodada", async () => {
    const fila = Array.from({ length: 6 }, (_, i) => pendente(`c${i}`, [arquivo(`c${i}`, 1)]));
    const conteudos = Object.fromEntries(fila.map((p) => [p.arquivos[0].url, TEXTO_SEM_ALERTA]));

    const porTempo = cenario(fila, conteudos);
    // A partir da segunda, cada licitação começa 1000 ms depois; com prazo de 1500 ms, a
    // quarta já encontra o tempo esgotado.
    const resumo = await lerEditais(porTempo.deps, { pausaMs: 1000, tempoMaximoMs: 1500, lote: 2 });
    expect(porTempo.gravadas).toHaveLength(3);
    expect(resumo).toMatchObject({ lidas: 3, restantes: 3, interrompida: "tempo da rodada esgotado" });

    const porLimite = cenario(fila, conteudos);
    const outro = await lerEditais(porLimite.deps, { pausaMs: 0, maxCompras: 4, lote: 3 });
    expect(porLimite.gravadas).toHaveLength(4);
    expect(outro.interrompida).toContain("limite de 4");
  });

  it("sem o pdftotext, a rodada inteira falha em vez de marcar tudo como sem texto", async () => {
    const c = cenario([pendente("a", [arquivo("a", 1)])], { [url("a", 1)]: "SEM PDFTOTEXT" });
    await expect(lerEditais(c.deps, { pausaMs: 0 })).rejects.toBeInstanceOf(PdftotextAusente);
    expect(c.gravadas).toEqual([]);
  });
});
