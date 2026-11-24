import { describe, expect, it } from "vitest";

import { compararMedidas, descreverMedida, extrairMedidas } from "./medidas";

const lidas = (texto: string) => extrairMedidas(texto).medidas.map(descreverMedida);

describe("extração de medidas", () => {
  it("lê French em várias escritas", () => {
    expect(lidas("CATETER 6Fr")).toEqual(["6 Fr"]);
    expect(lidas("cateter 4,7 FR")).toEqual(["4,7 Fr"]);
    expect(lidas("sonda calibre: 18, comprimento")).toEqual(["18 Fr"]);
    expect(lidas("Calibre: Nº 10 French")).toEqual(["10 Fr"]);
    expect(lidas("duplo j, CH 6")).toEqual(["6 Fr"]);
    expect(lidas("alça 24CH")).toEqual(["24 Fr"]);
    expect(lidas("introdutor,6F, radial")).toEqual(["6 Fr"]);
    expect(lidas("bainha 11/13FR")).toEqual(["11-13 Fr"]);
  });

  it("lê comprimentos, faixas e metros", () => {
    expect(lidas("26 cm")).toEqual(["26 cm"]);
    expect(lidas("22-30CM")).toEqual(["22-30 cm"]);
    expect(lidas("26 a 28cm")).toEqual(["26-28 cm"]);
    expect(lidas("óptica 3.2MM")).toEqual(["3,2 mm"]);
    expect(lidas("fibra 272UMX 3M")).toEqual(["272 µm", "300 cm"]);
    expect(lidas("frasco 140ML")).toEqual(["140 ml"]);
  });

  it("lê micrômetros com µm, um e micra", () => {
    expect(lidas("fibra 270 µm")).toEqual(["270 µm"]);
    expect(lidas("FIBRA 1000 UM")).toEqual(["1000 µm"]);
    expect(lidas("fibra de 365 micra")).toEqual(["365 µm"]);
    expect(lidas("com 1 um adaptador")).toEqual([]);
  });

  it("lê polegadas do fio guia, com e sem o símbolo", () => {
    expect(lidas('fio guia 0,035"')).toEqual(['0,035"']);
    expect(lidas("fio guia 0.032 x 150cm").sort()).toEqual(['0,032"', "150 cm"]);
    expect(lidas("fio guia .035")).toEqual(['0,035"']);
  });

  it("lê gauge só em valores de agulha", () => {
    expect(lidas("agulha 18G - 20CM")).toEqual(["18G", "20 cm"]);
    expect(lidas("pote 500 g")).toEqual([]);
    expect(lidas("alça 27050G")).toEqual([]);
  });

  it("guarda os números sem unidade de um '6 x 26'", () => {
    expect(extrairMedidas("CATETER DUPLO J 6X26")).toEqual({ medidas: [], soltos: [6, 26] });
    expect(extrairMedidas("sonda tamanho: Nº 08").soltos).toEqual([8]);
    expect(extrairMedidas("kit 4.7FR X 22-30CM").soltos).toEqual([]);
  });

  it("não confunde códigos e marcas com medidas", () => {
    expect(lidas("fita 3M ref EBC1P24")).toEqual([]);
    expect(lidas("RMS: 80102513488")).toEqual([]);
  });
});

describe("comparação de medidas", () => {
  const produto = extrairMedidas('KIT CATETER DUPLO J 4.7FR X 26CM COM FIO GUIA 0.035" X 150CM');
  const comparar = (item: string) => compararMedidas(produto, extrairMedidas(item));

  it("confirma medidas iguais, com tolerância", () => {
    expect(comparar("duplo j 4,8 fr 26 cm")).toEqual({ confirmadas: ["4,7 Fr", "26 cm"], diferentes: [] });
    expect(comparar("duplo j 4.7fr, 24 a 28 cm")).toEqual({ confirmadas: ["4,7 Fr", "26 cm"], diferentes: [] });
  });

  it("aponta a medida diferente", () => {
    expect(comparar("duplo j 6fr x 26cm")).toEqual({
      confirmadas: ["26 cm"],
      diferentes: ["pede 6 Fr; produto 4,7 Fr"],
    });
    expect(comparar("duplo j com fio guia 0,032")).toEqual({
      confirmadas: [],
      diferentes: ['pede 0,032"; produto 0,035"'],
    });
  });

  it("usa os números sem unidade quando o item só diz '6 x 26'", () => {
    expect(comparar("DUPLO J 4.7X26")).toEqual({ confirmadas: ["4,7 Fr", "26 cm"], diferentes: [] });
    expect(comparar("DUPLO J 6X26")).toEqual({ confirmadas: ["26 cm"], diferentes: ["pede 6; produto 4,7 Fr"] });
  });

  it("o que só um lado informa não confirma nem contradiz", () => {
    expect(comparar("cateter duplo j")).toEqual({ confirmadas: [], diferentes: [] });
    expect(comparar("cateter duplo j 500 ml")).toEqual({ confirmadas: [], diferentes: [] });
  });
});
