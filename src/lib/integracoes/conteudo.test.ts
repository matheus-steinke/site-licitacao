import { describe, expect, it } from "vitest";

import {
  assinaturaDoEvento,
  descricaoDoEvento,
  montarEvento,
  nomeDaPasta,
  nomeDaPastaDoMes,
  numeroComAno,
  siglaDaModalidade,
  tituloDoEvento,
  type LicitacaoParaIntegrar,
} from "./conteudo";

function licitacao(extras: Partial<LicitacaoParaIntegrar> = {}): LicitacaoParaIntegrar {
  return {
    oportunidadeId: "op-1",
    numeroCompra: "780",
    ano: 2026,
    modalidade: "Pregão - Eletrônico",
    orgao: "SECRETARIA DE ESTADO DA ADMINISTRACAO",
    objeto: "Aquisição de   materiais\nde urologia",
    uf: "SC",
    municipio: "Florianópolis",
    dataDisputa: "2026-12-03T16:15:00+00:00", // 13:15 em Brasília
    situacao: null,
    linkPncp: "https://pncp.gov.br/app/editais/82951229000176/2026/780",
    itens: [
      { numero: 46, descricao: "CATETER URETERAL DUPLO J 6.0 FR X 28 CM", quantidade: 50, unidade: "UN", nivel: "compativel", produto: "26 - Cateter duplo J 6 Fr x 28 cm" },
      { numero: 45, descricao: "CATETER URETERAL DUPLO J 6.0 FR X 26 CM", quantidade: 1234.5, unidade: null, nivel: "compativel", produto: "25 - Cateter duplo J 6 Fr x 26 cm" },
      { numero: 50, descricao: "FIO GUIA HIDROFÍLICO", quantidade: null, unidade: "UN", nivel: "verificar", produto: "40 - Fio guia 0,035" },
    ],
    alertas: ["Referência abaixo do seu mínimo (item 45)"],
    ...extras,
  };
}

describe("título do evento", () => {
  it("segue o formato PE <nº>/<ano> - <Órgão>", () => {
    expect(tituloDoEvento(licitacao())).toBe("PE 780/2026 - SECRETARIA DE ESTADO DA ADMINISTRACAO");
  });

  it("não repete o ano quando o número do PNCP já traz", () => {
    expect(numeroComAno("90001/2026", 2026, "/")).toBe("90001/2026");
    expect(numeroComAno("0975/26", 2026, "/")).toBe("0975/26");
    expect(numeroComAno("084", 2026, "/")).toBe("084/2026");
    expect(numeroComAno(null, 2026, "/")).toBe("s/nº/2026");
    expect(numeroComAno("0975/26", 2026, ".")).toBe("0975.26");
    expect(numeroComAno("780", 2026, ".")).toBe("780.2026");
  });

  it("pregão é PE; dispensa e outras vão pelo nome", () => {
    expect(siglaDaModalidade("Pregão - Eletrônico")).toBe("PE");
    expect(siglaDaModalidade("Dispensa")).toBe("Dispensa");
    expect(siglaDaModalidade("Concorrência - Eletrônica")).toBe("Concorrência - Eletrônica");
    expect(tituloDoEvento(licitacao({ modalidade: "Dispensa", numeroCompra: "12" }))).toBe(
      "Dispensa 12/2026 - SECRETARIA DE ESTADO DA ADMINISTRACAO",
    );
  });
});

describe("descrição do evento", () => {
  it("traz itens compatíveis com quantidade e produto, itens a verificar, alertas e os links", () => {
    expect(descricaoDoEvento(licitacao(), "https://app.exemplo/oportunidades/op-1")).toBe(
      [
        "Objeto: Aquisição de materiais de urologia",
        "",
        "Itens compatíveis com o seu catálogo (2):",
        "- Item 45: CATETER URETERAL DUPLO J 6.0 FR X 26 CM | 1.234,5 | produto: 25 - Cateter duplo J 6 Fr x 26 cm",
        "- Item 46: CATETER URETERAL DUPLO J 6.0 FR X 28 CM | 50 UN | produto: 26 - Cateter duplo J 6 Fr x 28 cm",
        "",
        "Itens a verificar (1):",
        "- Item 50: FIO GUIA HIDROFÍLICO | produto: 40 - Fio guia 0,035",
        "",
        "Alertas:",
        "- Referência abaixo do seu mínimo (item 45)",
        "",
        "Edital no PNCP: https://pncp.gov.br/app/editais/82951229000176/2026/780",
        "Abrir a oportunidade: https://app.exemplo/oportunidades/op-1",
      ].join("\n"),
    );
  });

  it("avisa da situação alterada e de quando nenhum item casou", () => {
    const texto = descricaoDoEvento(licitacao({ situacao: "Suspensa", itens: [], alertas: [], linkPncp: null }), null);
    expect(texto.split("\n")[0]).toBe("ATENÇÃO: o PNCP mostra esta licitação como Suspensa.");
    expect(texto).toContain("Nenhum item casou com o seu catálogo");
    expect(texto).not.toContain("Alertas");
    expect(texto).not.toContain("PNCP:");
  });

  it("corta listas longas e descrições longas", () => {
    const itens = Array.from({ length: 45 }, (_, i) => ({
      numero: i + 1, descricao: "X".repeat(200), quantidade: 1, unidade: "UN", nivel: "compativel" as const, produto: "1 - P",
    }));
    const linhas = descricaoDoEvento(licitacao({ itens }), null).split("\n");
    expect(linhas.filter((l) => l.startsWith("- Item"))).toHaveLength(40);
    expect(linhas).toContain("- e mais 5");
    expect(linhas.find((l) => l.startsWith("- Item 1:"))).toContain(`${"X".repeat(137)}...`);
  });
});

describe("evento", () => {
  it("começa na hora da disputa e dura 1 hora, no fuso de Brasília", () => {
    const evento = montarEvento(licitacao(), null);
    expect(evento).toMatchObject({
      summary: "PE 780/2026 - SECRETARIA DE ESTADO DA ADMINISTRACAO",
      location: "Florianópolis/SC",
      start: { dateTime: "2026-12-03T16:15:00.000Z", timeZone: "America/Sao_Paulo" },
      end: { dateTime: "2026-12-03T17:15:00.000Z", timeZone: "America/Sao_Paulo" },
    });
  });

  it("sem data de disputa não há evento", () => {
    expect(montarEvento(licitacao({ dataDisputa: null }), null)).toBeNull();
    expect(montarEvento(licitacao({ dataDisputa: "ontem" }), null)).toBeNull();
  });

  it("a assinatura muda quando a data, os itens ou a situação mudam", () => {
    const base = assinaturaDoEvento(montarEvento(licitacao(), null)!);
    expect(assinaturaDoEvento(montarEvento(licitacao(), null)!)).toBe(base);
    expect(assinaturaDoEvento(montarEvento(licitacao({ dataDisputa: "2026-12-10T16:15:00+00:00" }), null)!)).not.toBe(base);
    expect(assinaturaDoEvento(montarEvento(licitacao({ situacao: "Suspensa" }), null)!)).not.toBe(base);
    expect(assinaturaDoEvento(montarEvento(licitacao({ itens: [] }), null)!)).not.toBe(base);
  });
});

describe("pastas do Drive", () => {
  it("pasta do mês e pasta do processo, no formato da especificação", () => {
    expect(nomeDaPastaDoMes("2026-12-03T16:15:00+00:00")).toBe("Dezembro 2026");
    expect(nomeDaPasta(licitacao())).toBe("PE 780.2026 - SECRETARIA DE ESTADO DA ADMINISTRACAO 03.12");
  });

  it("usa o dia e o mês de Brasília (disputa às 23h de 30/11 é de novembro)", () => {
    expect(nomeDaPastaDoMes("2026-12-01T02:00:00+00:00")).toBe("Novembro 2026");
    expect(nomeDaPasta(licitacao({ dataDisputa: "2026-12-01T02:00:00+00:00" }))).toMatch(/ 30\.11$/);
  });

  it("troca barras e outros caracteres problemáticos, e limita o nome do órgão", () => {
    const nome = nomeDaPasta(licitacao({ numeroCompra: "0975/26", orgao: `HOSPITAL "N. S." DA CONCEICAO S/A: ${"X".repeat(100)}` }));
    expect(nome.startsWith("PE 0975.26 - HOSPITAL -N. S.- DA CONCEICAO S-A- XXX")).toBe(true);
    expect(nome).not.toMatch(/[\\/:*?"<>|]/);
    expect(nome.length).toBeLessThan(110);
  });
});
