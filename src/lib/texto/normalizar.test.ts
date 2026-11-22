import { describe, expect, it } from "vitest";

import { contemTermo, prepararTermo, prepararTexto, singular, tokenizar } from "./normalizar";
import { casarSegmentos, prepararSegmentos } from "./segmentos";

const casa = (texto: string, termo: string) => contemTermo(prepararTexto(texto), prepararTermo(termo)!);

describe("tokenizar", () => {
  it("tira acento, pontuação, palavras vazias e plural", () => {
    expect(tokenizar("Cateteres Duplo-J, 6Fr x 26 cm (estéril)")).toEqual([
      "cateter", "duplo", "j", "6fr", "x", "26", "cm", "esteril",
    ]);
    expect(tokenizar("SONDA DE FOLEY 2 VIAS Nº 16")).toEqual(["sonda", "foley", "2", "via", "n", "16"]);
    expect(tokenizar("  ")).toEqual([]);
  });

  it("reduz plurais comuns", () => {
    expect(["agulhas", "cateteres", "descartaveis", "solucoes", "laboratoriais", "luzes", "bons"].map(singular)).toEqual([
      "agulha", "cateter", "descartavel", "solucao", "laboratorial", "luz", "bom",
    ]);
    // Palavras curtas, com dígitos ou terminadas em "ss" ficam como estão.
    expect(["gas", "uti", "0s3", "glass"].map(singular)).toEqual(["gas", "uti", "0s3", "glass"]);
  });
});

describe("contemTermo", () => {
  it("casa independentemente de caixa, acento, plural e preposições", () => {
    expect(casa("SERINGAS DESCARTÁVEIS 10 ML", "seringa descartável")).toBe(true);
    expect(casa("Sonda Foley 2 vias", "sonda de foley")).toBe(true);
    expect(casa("CATETER P/ HEMODIÁLISE DUPLO LÚMEN", "cateter para hemodiálise")).toBe(true);
  });

  it("aceita palavras no meio e ordem diferente, se estiverem próximas", () => {
    expect(casa("CATETER URETERAL DUPLO J 6FR X 26CM", "cateter duplo j")).toBe(true);
    expect(casa("FIO GUIA 0,035 HIDROFÍLICO PONTA RETA", "fio guia hidrofílico")).toBe(true);
    expect(casa("DESCARTÁVEL, SERINGA 5 ML", "seringa descartável")).toBe(true);
  });

  it("não casa palavras distantes nem pedaços de palavra", () => {
    expect(
      casa("CATETER VENOSO CENTRAL, KIT COM FIO GUIA, DILATADOR, AGULHA E SERINGA, LÚMEN DUPLO, CONECTOR J", "cateter duplo j"),
    ).toBe(false);
    // "trocarte" não é "trocar"; "uti" não está dentro de "utilizado".
    expect(casa("SERVIÇO PARA TROCAR LÂMPADAS", "trocarte")).toBe(false);
    expect(casa("MATERIAL UTILIZADO EM OBRAS", "uti")).toBe(false);
    expect(casa("LEITO DE UTI ADULTO", "uti")).toBe(true);
  });

  it("exige todas as palavras do termo", () => {
    expect(casa("CATETER VENOSO CENTRAL", "cateter duplo j")).toBe(false);
    expect(casa("", "cateter")).toBe(false);
  });

  it("compara números como palavras inteiras", () => {
    expect(casa("FIO GUIA 0,035 X 150 CM", "fio guia 0,035")).toBe(true);
    expect(casa("FIO GUIA 0,014 X 190 CM", "fio guia 0,035")).toBe(false);
  });
});

describe("casarSegmentos", () => {
  const segmentos = prepararSegmentos([
    {
      id: "uro",
      nome: "Urologia",
      palavras_chave: ["cateter duplo j", "sonda de foley"],
      sinonimos: ["pigtail"],
      exclusoes: ["veterinário"],
    },
    { id: "lap", nome: "Laparoscopia", palavras_chave: ["trocarte"], sinonimos: [], exclusoes: [] },
    { id: "vazio", nome: "Sem termos", palavras_chave: [], sinonimos: [], exclusoes: [] },
  ]);

  it("liga o item aos segmentos e diz qual termo casou", () => {
    expect(casarSegmentos("CATETER DUPLO J 6FR", segmentos)).toEqual([{ segmentoId: "uro", termo: "cateter duplo j" }]);
    expect(casarSegmentos("Cateter tipo pigtail", segmentos)).toEqual([{ segmentoId: "uro", termo: "pigtail" }]);
    expect(casarSegmentos("TROCARTES 5MM E SONDA FOLEY", segmentos).map((c) => c.segmentoId)).toEqual(["uro", "lap"]);
  });

  it("respeita os termos de exclusão do segmento", () => {
    expect(casarSegmentos("SONDA DE FOLEY PARA USO VETERINÁRIO", segmentos)).toEqual([]);
  });

  it("não casa o que não é da saúde", () => {
    expect(casarSegmentos("CANETA ESFEROGRÁFICA AZUL", segmentos)).toEqual([]);
    expect(casarSegmentos("", segmentos)).toEqual([]);
  });
});
