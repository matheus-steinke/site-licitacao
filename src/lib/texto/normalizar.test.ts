import { describe, expect, it } from "vitest";

import { contemTermo, prepararTermo, prepararTexto, radical, singular, tokenizar } from "./normalizar";
import { assinaturaDaClassificacao, casarSegmentos, prepararSegmentos } from "./segmentos";

const casa = (texto: string, termo: string) => contemTermo(prepararTexto(texto), prepararTermo(termo)!);
const casaNoItem = (texto: string, termo: string) =>
  contemTermo(prepararTexto(texto), prepararTermo(termo)!, { proximas: false });

describe("tokenizar", () => {
  it("tira acento, pontuação, palavras vazias e plural", () => {
    expect(tokenizar("Cateteres Duplo-J, 6Fr x 26 cm (estéril)")).toEqual([
      "cateter", "dupl", "j", "6fr", "x", "26", "cm", "esteril",
    ]);
    expect(tokenizar("SONDA DE FOLEY 2 VIAS Nº 16")).toEqual(["sond", "foley", "2", "via", "n", "16"]);
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

describe("radical", () => {
  it("iguala gênero e pequenas variações, sem mexer em palavras curtas ou com número", () => {
    expect(radical("endoscopio")).toBe(radical("endoscopia"));
    expect(radical("cirurgicas")).toBe(radical("cirurgico"));
    expect(radical("seringas")).toBe("sering");
    expect(["fio", "guia", "gaze", "uti", "6fr", "cateter", "descartavel"].map(radical)).toEqual([
      "fio", "guia", "gaze", "uti", "6fr", "cateter", "descartavel",
    ]);
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

describe("contemTermo na descrição de um item (sem exigir proximidade)", () => {
  it("casa descrições no formato do catálogo federal, com as palavras distantes", () => {
    const seringa =
      "SERINGA - ADICIONAL: GRADUADA (ESCALA ML), NUMERADA; APRESENTAÇÃO: EMBALAGEM INDIVIDUAL; CAPACIDADE: 1 ML; ESTERILIDADE: ESTÉRIL, DESCARTÁVEL";
    expect(casa(seringa, "seringa descartável")).toBe(false);
    expect(casaNoItem(seringa, "seringa descartável")).toBe(true);
    expect(
      casaNoItem(
        "Avental Procedimento - Paramentação esterilidade: não estéril, descartável, material: não tecido 100% polipropileno",
        "avental descartável",
      ),
    ).toBe(true);
    expect(casaNoItem("BOCAL, para endoscopio, em polipropileno, com faixa para cabeca", "bocal para endoscopia")).toBe(true);
  });

  it("continua exigindo todas as palavras, inteiras", () => {
    expect(casaNoItem("SERINGA DE VIDRO REUTILIZÁVEL", "seringa descartável")).toBe(false);
    expect(casaNoItem("MATERIAL UTILIZADO EM OBRAS", "uti")).toBe(false);
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

describe("assinaturaDaClassificacao", () => {
  const base = [
    { id: "b", nome: "B", palavras_chave: ["trocarte"], sinonimos: [], exclusoes: [] },
    { id: "a", nome: "A", palavras_chave: ["Sonda de Foley", "cateter duplo j"], sinonimos: ["pigtail"], exclusoes: [] },
  ];

  it("não muda com a ordem, a caixa ou o nome do segmento", () => {
    const mesma = [
      { id: "a", nome: "Outro nome", palavras_chave: ["cateter duplo j", "sonda de foley"], sinonimos: ["pigtail"], exclusoes: [] },
      { id: "b", nome: "B", palavras_chave: ["trocarte"], sinonimos: [], exclusoes: [] },
    ];
    expect(assinaturaDaClassificacao(mesma)).toBe(assinaturaDaClassificacao(base));
  });

  it("muda quando um termo entra, sai ou troca de lista", () => {
    const comExclusao = base.map((s) => (s.id === "a" ? { ...s, exclusoes: ["veterinário"] } : s));
    const semSinonimo = base.map((s) => (s.id === "a" ? { ...s, sinonimos: [] } : s));
    expect(assinaturaDaClassificacao(comExclusao)).not.toBe(assinaturaDaClassificacao(base));
    expect(assinaturaDaClassificacao(semSinonimo)).not.toBe(assinaturaDaClassificacao(base));
    expect(assinaturaDaClassificacao(base.slice(0, 1))).not.toBe(assinaturaDaClassificacao(base));
  });
});
