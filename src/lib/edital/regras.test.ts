import { describe, expect, it } from "vitest";

import { alinhar, lerAlertasDoEdital, lerEdital, lerTrechosDoEdital, MAXIMO_DE_TRECHOS_POR_ALERTA } from "./regras";

const ler = (texto: string, titulo: string | null = "Edital") => lerEdital([{ titulo, texto }]);
const nivel = (texto: string, tipo: string) => ler(texto).alertas.find((a) => a.tipo === tipo)?.nivel ?? null;

describe("alinhar", () => {
  it("mantém o mesmo tamanho nas duas versões", () => {
    const { original, plano } = alinhar("  Será  exigida\n\nAMOSTRA – justiﬁcação técnica, prazo de 5 dias úteis​ ");
    expect(plano).toHaveLength(original.length);
    expect(plano).toContain("sera exigida amostra");
    expect(plano).toContain("justificacao tecnica");
    expect(original).toContain("Será exigida AMOSTRA");
  });
});

describe("amostra: frases que exigem (tiradas de editais reais)", () => {
  it.each([
    "4.3.1. Será exigida apresentação de amostras devido à natureza crítica dos materiais.",
    "Apresentação de amostras, protótipo ou prova de conceito: haverá apresentação de amostras em formato digital e físico.",
    "O licitante classificado em primeiro lugar deverá apresentar amostras dos itens demandados no prazo de 5 (cinco) dias úteis.",
    "4.3.1.2 Prazo para entrega da amostra será de 02 (dois) dias úteis, a contar da solicitação.",
    "4.2.2 Serão exigidas amostras dos itens listados neste processo, sendo necessário enviar 3 unidades.",
    "Será convocado o proponente classificado para apresentar obrigatoriamente a amostra de cada item.",
    "11.4 - As amostras deverão ser entregues no setor de padronização de materiais da Secretaria.",
  ])("%s", (frase) => {
    expect(nivel(frase, "amostra")).toBe("exige");
  });
});

describe("amostra: o que não é exigência fica como citação, nunca some", () => {
  it.each([
    // Cláusulas padrão.
    "7.11. Caso o termo de referência exija a apresentação de amostra, o licitante classificado em primeiro lugar deverá apresentá-la, sob pena de não aceitação da proposta.",
    "A critério da administração poderá ser solicitado ao licitante classificado provisoriamente em primeiro lugar amostras dos produtos ofertados.",
    "10.3.3. Quando exigido pelo termo de referência, não apresentarem amostra ou protótipo.",
    "22.1.3.3. deixar de apresentar amostra; ou apresentar proposta ou amostra em desacordo com o edital.",
    // Descrição de produto.
    "Monitor de glicose, tempo de resultado 5 segundos, volume de amostra sanguínea 2 microlitros.",
    // Negação: o sistema não afirma que não exige; mostra o trecho.
    "Da exigência de amostra. 4.5. Não há exigência de amostra na presente contratação.",
    "4.15.9. Não serão exigidas amostras prévias dos itens, cabendo o catálogo do produto.",
  ])("%s", (frase) => {
    expect(nivel(frase, "amostra")).toBe("cita");
  });

  it("a negação vem primeiro entre os trechos de quem só cita", () => {
    const r = ler(
      "Deixar de apresentar amostra é infração. " + "Texto de enchimento. ".repeat(40) +
        "Da exigência de amostra: não há exigência de amostra na presente contratação.",
    );
    expect(r.alertas).toEqual([{ tipo: "amostra", nivel: "cita" }]);
    expect(r.trechos[0].texto).toContain("não há exigência de amostra");
  });

  it("texto que não cita não gera alerta", () => {
    expect(ler("Aquisição de cateter duplo J 6 Fr, 26 cm, com fio guia.")).toEqual({ alertas: [], trechos: [] });
    expect(lerEdital([])).toEqual({ alertas: [], trechos: [] });
  });

  it("basta um documento exigir", () => {
    const r = lerEdital([
      { titulo: "Edital", texto: "Caso o termo de referência exija a apresentação de amostra, o licitante deverá apresentá-la." },
      { titulo: "Termo de Referência", texto: "4.3.1. Será exigida apresentação de amostras de todos os itens." },
    ]);
    expect(r.alertas).toEqual([{ tipo: "amostra", nivel: "exige" }]);
    expect(r.trechos[0]).toMatchObject({ tipo: "amostra", arquivo: "Termo de Referência" });
    expect(r.trechos[0].texto).toContain("Será exigida apresentação de amostras");
  });
});

describe("comodato e visita técnica", () => {
  it("comodato previsto no contrato sobe de nível", () => {
    expect(nivel("Os equipamentos serão disponibilizados em regime de comodato, sem ônus.", "comodato")).toBe("exige");
    expect(nivel("Anexo VIII: termo de contrato de comodato.", "comodato")).toBe("exige");
    expect(nivel("Acompanha, em comodato, 1 (uma) seladora automática.", "comodato")).toBe("exige");
    expect(nivel("O comodato de bens públicos segue a lei.", "comodato")).toBe("cita");
  });

  it("visita técnica é sempre citação, com o trecho", () => {
    expect(nivel("4.4.1 Não será exigida a realização de vistoria prévia.", "visita_tecnica")).toBe("cita");
    expect(nivel("7.11.2. Atestado de visita técnica emitido pelo departamento de saúde.", "visita_tecnica")).toBe("cita");
    expect(nivel("A visita técnica é obrigatória.", "visita_tecnica")).toBe("cita");
    expect(nivel("Fornecimento de seringas.", "visita_tecnica")).toBeNull();
  });
});

describe("trechos", () => {
  it("saem do texto original, com reticências, sem cortar palavra e no máximo três por alerta", () => {
    const meio = "Será exigida apresentação de amostras devido à natureza crítica dos materiais";
    const r = ler(`${"palavra ".repeat(60)}${meio}. ${"outra ".repeat(80)}`);
    const [trecho] = r.trechos;
    expect(trecho.texto.startsWith("…")).toBe(true);
    expect(trecho.texto.endsWith("…")).toBe(true);
    expect(trecho.texto).toContain(meio);
    expect(trecho.texto.length).toBeLessThan(520);
    expect(trecho.texto.replace(/…/g, "").split(" ").every((p) => ["palavra", "outra", ""].includes(p) || meio.includes(p.replace(".", "")))).toBe(true);

    const muitos = ler(Array.from({ length: 10 }, (_, i) => `Cláusula ${i}: a amostra número ${i} segue o padrão. ${"x ".repeat(300)}`).join(" "));
    expect(muitos.trechos).toHaveLength(MAXIMO_DE_TRECHOS_POR_ALERTA);
  });

  it("a mesma cláusula repetida em dois documentos entra uma vez", () => {
    const clausula = "4.3.1. Será exigida apresentação de amostras devido à natureza crítica dos materiais e insumos.";
    const r = lerEdital([
      { titulo: "Edital", texto: clausula },
      { titulo: "Termo de Referência", texto: clausula },
    ]);
    expect(r.trechos).toHaveLength(1);
  });
});

describe("leitura do que vem do banco", () => {
  it("aproveita só o formato conhecido", () => {
    expect(lerAlertasDoEdital([{ tipo: "amostra", nivel: "exige" }, { tipo: "comodato" }, { tipo: "outro" }, null, "x"])).toEqual([
      { tipo: "amostra", nivel: "exige" },
      { tipo: "comodato", nivel: "cita" },
    ]);
    expect(lerAlertasDoEdital(null)).toEqual([]);
    expect(lerTrechosDoEdital([{ tipo: "amostra", texto: "…trecho…", arquivo: "Edital" }, { tipo: "amostra", texto: "" }, { tipo: "x", texto: "y" }])).toEqual([
      { tipo: "amostra", texto: "…trecho…", arquivo: "Edital" },
    ]);
  });
});
