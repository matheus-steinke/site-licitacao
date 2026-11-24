import { describe, expect, it } from "vitest";

import {
  extrairLote,
  LIMITES_PADRAO,
  prepararTriagem,
  semelhanca,
  triarCompra,
  type ConfiguracaoDaTriagem,
  type ItemDaCompra,
} from "./motor";
import { prepararProduto, marcasDoCatalogo, type ProdutoBruto } from "./produto";

const BOILERPLATE =
  "DESCARTÁVEL. ESTÉRIL. ATÓXICO E APIROGÊNICO. EMBALAGEM INDIVIDUAL EM PAPEL GRAU CIRÚRGICO E FILME PLÁSTICO. RMS: 80421079054";

function produto(codigo: string, nome: string, extras: Partial<ProdutoBruto> = {}): ProdutoBruto {
  return {
    id: `p${codigo}`,
    codigo,
    nome,
    palavras_chave: [],
    medidas: null,
    marca: null,
    fabricante: null,
    lance_minimo: 100,
    ...extras,
  };
}

// Um catálogo no formato real: tipo do produto, marca, medidas e frases de embalagem.
const CATALOGO: ProdutoBruto[] = [
  produto("1", `CATETER URETERAL DUPLO J SOFT 4.7FR X 26CM MARCA: UROLLINE / FABRICANTE: WELLEAD ${BOILERPLATE}`),
  produto("2", `CATETER URETERAL DUPLO J SOFT 6FR X 26CM MARCA: UROLLINE / FABRICANTE: WELLEAD ${BOILERPLATE}`),
  produto("3", `CATETER URETERAL MARCA: UROLLINE / FABRICANTE: WELLEAD 5FR X 70CM ${BOILERPLATE}`),
  produto("4", `FIO GUIA HIDROFÍLICO 0.035" X 150CM STIFF MARCA: UROLLINE / FABRICANTE: WELLEAD ${BOILERPLATE}`),
  produto("5", `BAINHA DE ACESSO URETERAL MARCA: UROLLINE / FABRICANTE: REBORN 10FR X 45CM ${BOILERPLATE}`),
  produto("6", `ALÇA TURP LOOP BIPOLAR CORTE 1P 24FR MARCA: ENDOSURG / FABRICANTE: ENDOSURG ${BOILERPLATE}`, {
    palavras_chave: ["alça de ressecção bipolar"],
    lance_minimo: 758.1,
  }),
  produto("7", "CANULA DE FIBRA OTICA 272 UM SOLVO REUTILIZAVEL C/ RFID MARCA: DORNIER / FABRICANTE: DORNIER RMS: 80102513488"),
];

const URO = "seg-urologia";
const CONSUMO = "seg-consumo";

function configuracao(extras: Partial<ConfiguracaoDaTriagem> = {}): ConfiguracaoDaTriagem {
  return {
    porte: "demais",
    limiteCompativel: LIMITES_PADRAO.compativel,
    limiteVerificar: LIMITES_PADRAO.verificar,
    segmentoIds: [URO],
    exclusoes: [],
    produtos: CATALOGO,
    ...extras,
  };
}

let proximo = 0;
function item(descricao: string, extras: Partial<ItemDaCompra> = {}): ItemDaCompra {
  proximo++;
  return {
    id: `i${proximo}`,
    numero: proximo,
    descricao,
    quantidade: 10,
    valorUnitario: 200,
    exclusivoMeEpp: false,
    segmentoIds: [],
    ...extras,
  };
}

function triar(itens: ItemDaCompra[], cfg = configuracao(), objeto = "Aquisição de materiais médico-hospitalares") {
  return triarCompra(prepararTriagem(cfg), { objeto, itens });
}

describe("preparação do produto", () => {
  const marcas = marcasDoCatalogo(CATALOGO);

  it("tira do nome só as palavras que definem o produto", () => {
    const palavras = (codigo: string) =>
      prepararProduto(CATALOGO.find((p) => p.codigo === codigo)!, marcas).nucleo.map((n) => n.palavra);
    expect(palavras("1")).toEqual(["cateter", "ureteral", "dupl", "j", "soft"]);
    expect(palavras("3")).toEqual(["cateter", "ureteral"]);
    expect(palavras("5")).toEqual(["bainh", "acess", "ureteral"]);
    expect(palavras("7")).toEqual(["canul", "fibr", "otic", "solv", "reutilizavel", "rfid"]);
  });

  it("reconhece as marcas citadas no catálogo e não as usa para casar", () => {
    expect([...marcas].sort()).toEqual(["dornier", "endosurg", "reborn", "urollin", "wellead"]);
    const comMarcaNoMeio = produto("9", "KIT CATETER DUPLO J SOFT UROLLINE 4.7FR X 22-30CM");
    expect(prepararProduto(comMarcaNoMeio, marcas).nucleo.map((n) => n.palavra)).toEqual(["kit", "cateter", "dupl", "j", "soft"]);
  });

  it("lê as medidas do nome e do campo de medidas", () => {
    const p = prepararProduto(produto("9", "CATETER DUPLO J", { medidas: "6 Fr x 26 cm" }));
    expect(p.medidas.medidas).toEqual([
      { tipo: "fr", min: 6, max: 6 },
      { tipo: "cm", min: 26, max: 26 },
    ]);
  });
});

describe("item x catálogo", () => {
  it("medida certa: sugere o produto da medida pedida", () => {
    const r = triar([item("Cateter ureteral duplo j, 26 a 28cm, CH 6")]);
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0]).toMatchObject({ produtoId: "p2", nivel: "compativel" });
    expect(r.itens[0].detalhe.medidasConfirmadas).toEqual(["6 Fr", "26 cm"]);
    expect(r.itens[0].detalhe.medidasDiferentes).toEqual([]);
    expect(r.itens[0].score).toBeGreaterThanOrEqual(80);
    expect(r).toMatchObject({ prioridade: 3, itensCompativeis: 1, itensAVerificar: 0, valorEstimado: 2000 });
  });

  it("medida errada: não é compatível, fica para verificar com a diferença explicada", () => {
    const r = triar([item("CATETER URETERAL DUPLO J 7FR X 26CM")]);
    expect(r.itens[0].nivel).toBe("verificar");
    expect(r.itens[0].detalhe.medidasDiferentes[0]).toMatch(/^pede 7 Fr; produto (4,7|6) Fr$/);
    expect(r.itens[0].detalhe.medidasConfirmadas).toEqual(["26 cm"]);
    expect(r).toMatchObject({ prioridade: 2, itensCompativeis: 0, itensAVerificar: 1, valorEstimado: 0 });
  });

  it("lê a medida escrita sem unidade (6X26)", () => {
    const r = triar([item("Código GHC: 32202 Especificação: CATETER URETERAL DUPLO J 6X26 - ANEXO: 3 Unidade: UNIDADE")]);
    expect(r.itens[0]).toMatchObject({ produtoId: "p2", nivel: "compativel" });
  });

  it("item sem medida casa pelo texto e avisa que há outros produtos parecidos", () => {
    const r = triar([item("CATETER URETERAL DUPLO J")]);
    expect(r.itens[0].nivel).toBe("compativel");
    expect(r.itens[0].detalhe.outrosProdutos).toBeGreaterThanOrEqual(1);
  });

  it("distingue produtos parecidos pelo nome: cateter ureteral não é duplo J", () => {
    const r = triar([item("CATETER URETERAL 5.0 FR 70 CM OPEN END")]);
    expect(r.itens[0]).toMatchObject({ produtoId: "p3", nivel: "compativel" });
  });

  it("palavras do item que apontam para outro produto pesam contra", () => {
    // Catálogo só com o cateter ureteral simples: o item pede duplo J.
    const r = triar([item("CATETER URETERAL DUPLO J 5FR X 70CM")], configuracao({ produtos: CATALOGO.slice(1, 3) }));
    const simples = triar([item("CATETER URETERAL 5FR X 70CM")], configuracao({ produtos: CATALOGO.slice(2, 3) }));
    expect(simples.itens[0].score).toBe(100);
    expect(r.itens[0].produtoId).toBe("p3");
    expect(r.itens[0].detalhe.palavrasDeOutroProduto).toEqual(["duplo"]);
    expect(r.itens[0].score).toBeLessThan(simples.itens[0].score);
  });

  it("descrição no formato do catálogo federal, com as palavras distantes", () => {
    const r = triar([
      item('Fio Guia aplicação: urológica, material: nitinol, revestimento: hidrofílico, diâmetro: 0,035", comprimento: cerca de 150 cm, tipo ponta: reta'),
    ]);
    expect(r.itens[0]).toMatchObject({ produtoId: "p4", nivel: "compativel" });
    expect(r.itens[0].detalhe.medidasConfirmadas).toEqual(['0,035"', "150 cm"]);
  });

  it("palavra-chave do produto vale mais que o nome", () => {
    const r = triar([item("ALÇA DE RESSECÇÃO BIPOLAR 24 FR, COMPATÍVEL COM RESSECTOSCÓPIO")]);
    expect(r.itens[0]).toMatchObject({ produtoId: "p6", nivel: "compativel" });
    expect(r.itens[0].detalhe.palavraChave).toBe("alça de ressecção bipolar");
    expect(r.itens[0].score).toBe(100);
  });

  it("não casa item de outro tipo só porque tem uma palavra em comum", () => {
    const r = triar([
      item("ALÇA DE POLIPECTOMIA A FRIO, descartável, uso único"),
      item("SERINGA DESCARTÁVEL 10 ML COM AGULHA"),
      item("Cateter intravenoso periférico 22G"),
      item("FIO DE SUTURA NYLON 3-0"),
    ]);
    expect(r.itens).toEqual([]);
    expect(r.prioridade).toBe(0);
  });

  it("o item precisa ser do mesmo tipo do produto, não só ter palavras em comum", () => {
    const catalogo = [
      produto("1", `BAINHA PARA ASPIRAÇÃO FLEXÍVEL MARCA: UROLLINE / FABRICANTE: WELLEAD 11/13FR - 36CM ${BOILERPLATE}`),
      produto("2", `AGULHA DE PUNÇÃO INICIAL 18G - 20CM MARCA: UROLLINE / FABRICANTE: WELLEAD ${BOILERPLATE}`),
      produto("3", "PROCESSADOR DE IMAGEM DIGITAL PARA ENDOSCÓPIO MARCA: UROLLINE / FABRICANTE: WESEEMED"),
      produto("4", `KIT CATETER DUPLO J INFANTIL 4FR X 14CM COM FIO GUIA TEFLONADO ${BOILERPLATE}`),
    ];
    const r = triar(
      [
        // É uma sonda, não uma bainha.
        item("SONDA DE ASPIRAÇÃO TRAQUEAL nº12, em PVC atóxico, flexível e transparente, descartável"),
        // É um cateter; a agulha é um detalhe da descrição.
        item("CATETER INTRAVENOSO PERIFÉRICO 18G, COM DISPOSITIVO DE PROTEÇÃO DA AGULHA, PARA PUNÇÃO VENOSA"),
        // É um endoscópio, não o processador de imagem dele.
        item("Endoscópio Rígido, ângulo de visão 30°, com processamento de imagem digital"),
        // "Duplo lúmen" não é "duplo J".
        item("CATETER VENOSO CENTRAL DUPLO LÚMEN INFANTIL 4FR X 13CM (KIT)"),
      ],
      configuracao({ produtos: catalogo }),
    );
    expect(r.itens).toEqual([]);
  });

  it("o tipo do produto citado só no meio da descrição não basta para ser compatível", () => {
    const catalogo = [produto("1", `FRASCO COLETOR MARCA: UROLLINE / FABRICANTE: WELLEAD 140ML ${BOILERPLATE}`)];
    const r = triar(
      [
        item("Sistema Coletor Para Dreno De Tórax tipo: selo d'água, modelo recipiente: frasco rígido, graduado"),
        item("FRASCO COLETOR 140 ML, ESTÉRIL"),
      ],
      configuracao({ produtos: catalogo }),
    );
    expect(r.itens.map((i) => i.nivel)).toEqual(["verificar", "compativel"]);
    expect(r.itens[1].score).toBe(100);
    expect(r.itensCompativeis).toBe(1);
  });

  it("tolera erro de digitação pela semelhança de escrita", () => {
    expect(semelhanca("percutanea", "perutanea")).toBeGreaterThan(0.5);
    expect(semelhanca("ureteral", "uretral")).toBeLessThan(0.8);
    const r = triar([item("BAINHA DE ACESO URETERAL 10FR 45CM")]);
    expect(r.itens[0]).toMatchObject({ produtoId: "p5", nivel: "compativel" });
  });

  it("os limites do score são configuráveis", () => {
    const itens = [item("CATETER URETERAL DUPLO J 7FR X 26CM")];
    expect(triar(itens, configuracao({ limiteVerificar: 90, limiteCompativel: 95 })).itens).toEqual([]);
    // Mesmo com o limite baixo, medida diferente não vira "compatível".
    expect(triar(itens, configuracao({ limiteVerificar: 10, limiteCompativel: 20 })).itens[0].nivel).toBe("verificar");
  });
});

describe("exclusões e segmentos", () => {
  it("exclusão da empresa tira o item do catálogo e do segmento", () => {
    const itens = [
      item("SONDA DE FOLEY 2 VIAS 16FR", { segmentoIds: [URO] }),
      item("CATETER URETERAL DUPLO J 6FR X 26CM, sem fio guia", { segmentoIds: [URO] }),
    ];
    const sem = triar(itens);
    expect(sem).toMatchObject({ itensDoSegmento: 2, itensCompativeis: 1 });

    const com = triar(itens, configuracao({ exclusoes: ["foley", "sem fio guia"] }));
    expect(com).toMatchObject({ itensDoSegmento: 0, itensCompativeis: 0, prioridade: 0 });
  });

  it("sem catálogo compatível, vale o segmento de interesse", () => {
    const r = triar([
      item("SONDA URETRAL Nº 12", { segmentoIds: [URO] }),
      item("SERINGA 10 ML", { segmentoIds: [CONSUMO] }),
    ]);
    expect(r).toMatchObject({ prioridade: 1, itensDoSegmento: 1, segmentoIds: [URO], itens: [] });
  });

  it("licitação de outro segmento e sem item do catálogo não é oportunidade", () => {
    const r = triar([item("SERINGA 10 ML", { segmentoIds: [CONSUMO] })]);
    expect(r).toMatchObject({ prioridade: 0, alertas: [] });
  });
});

describe("lote", () => {
  it("reconhece o lote no começo da descrição", () => {
    expect(extrairLote("LOTE 1 - CATETER DUPLO J")).toBe("1");
    expect(extrairLote("Lote 003: fio guia")).toBe("3");
    expect(extrairLote("GRUPO 2 - bainha")).toBe("2");
    expect(extrairLote("(L4) 6511.105034-caneta")).toBe("4");
    expect(extrairLote("Cateter com número do lote 123 impresso")).toBeNull();
    expect(extrairLote("Item 1 - lote")).toBeNull();
  });

  it("lote incompleto: diz quais itens faltam", () => {
    const r = triar([
      item("LOTE 1 - CATETER URETERAL DUPLO J 6FR X 26CM", { numero: 1 }),
      item("LOTE 1 - FIO GUIA HIDROFÍLICO 0,035 X 150CM", { numero: 2 }),
      item("LOTE 1 - SERINGA DESCARTÁVEL 20 ML", { numero: 3 }),
      item("LOTE 1 - EQUIPO MACROGOTAS", { numero: 4 }),
      item("LOTE 2 - LUVA DE PROCEDIMENTO", { numero: 5 }),
    ]);
    expect(r.itensCompativeis).toBe(2);
    expect(r.alertas).toContainEqual({ tipo: "lote_incompleto", lote: "1", faltam: [3, 4] });
    expect(r.alertas.filter((a) => a.tipo.startsWith("lote_"))).toHaveLength(1);
  });

  it("lote completo quando todos os itens do lote são compatíveis", () => {
    const r = triar([
      item("LOTE 7 - CATETER URETERAL DUPLO J 6FR X 26CM", { numero: 1 }),
      item("LOTE 7 - BAINHA DE ACESSO URETERAL 10FR X 45CM", { numero: 2 }),
    ]);
    expect(r.alertas).toContainEqual({ tipo: "lote_completo", lote: "7" });
  });

  it("sem lote na descrição, não há alerta de lote", () => {
    const r = triar([item("CATETER URETERAL DUPLO J 6FR X 26CM"), item("SERINGA 20 ML")]);
    expect(r.alertas.some((a) => a.tipo.startsWith("lote_"))).toBe(false);
  });
});

describe("ME/EPP e alertas", () => {
  const exclusivo = () => [item("CATETER URETERAL DUPLO J 6FR X 26CM", { numero: 1, exclusivoMeEpp: true })];

  it("empresa que não é ME/EPP: não descarta, alerta para repassar a parceiro", () => {
    const r = triar(exclusivo(), configuracao({ porte: "demais" }));
    expect(r.itensCompativeis).toBe(1);
    expect(r.itens[0].alertas).toContain("exclusivo_me_epp");
    expect(r.alertas).toContainEqual({ tipo: "me_epp_repassar", itens: [1] });
  });

  it("empresa ME/EPP: só marca o item como exclusivo", () => {
    const r = triar(exclusivo(), configuracao({ porte: "me_epp" }));
    expect(r.alertas).toContainEqual({ tipo: "exclusivo_me_epp", itens: [1] });
    expect(r.alertas.some((a) => a.tipo === "me_epp_repassar")).toBe(false);
  });

  it("reconhece a exclusividade escrita na descrição do item", () => {
    const r = triar([item("ITEM EXCLUSIVO PARA MEI/ME/EPP - Cateter ureteral duplo j 6fr 26cm", { numero: 1 })]);
    expect(r.alertas).toContainEqual({ tipo: "me_epp_repassar", itens: [1] });
  });

  it("valor de referência abaixo do lance mínimo do cliente", () => {
    const r = triar([
      item("CATETER URETERAL DUPLO J 6FR X 26CM", { numero: 1, valorUnitario: 80 }),
      item("BAINHA DE ACESSO URETERAL 10FR X 45CM", { numero: 2, valorUnitario: 300 }),
      item("FIO GUIA HIDROFÍLICO 0,035 X 150CM", { numero: 3, valorUnitario: null }),
    ]);
    expect(r.itens.map((i) => i.alertas)).toEqual([["referencia_abaixo_minimo"], [], []]);
    expect(r.alertas).toContainEqual({ tipo: "referencia_abaixo_minimo", itens: [1] });
  });

  it("alertas por palavra no objeto: amostra, comodato, visita técnica, exclusiva ME/EPP", () => {
    const itens = [item("CATETER URETERAL DUPLO J 6FR X 26CM")];
    const tipos = (objeto: string) => triar(itens, configuracao(), objeto).alertas.map((a) => a.tipo);
    expect(tipos("Registro de preços de cateteres, com apresentação de amostras")).toContain("amostra");
    expect(tipos("Aquisição de fibras laser com equipamento em regime de COMODATO")).toContain("comodato");
    expect(tipos("Aquisição com visita técnica obrigatória")).toContain("visita_tecnica");
    expect(tipos("Licitação exclusiva para microempresas e empresas de pequeno porte")).toContain("exclusiva_me_epp");
    expect(tipos("Aquisição de materiais médico-hospitalares")).toEqual([]);
  });

  it("comodato citado no item também gera o alerta", () => {
    const r = triar([item("CANULA DE FIBRA OTICA 272 µm, com fornecimento do laser em comodato")]);
    expect(r.alertas).toContainEqual({ tipo: "comodato" });
  });
});
