import { describe, expect, it } from "vitest";

import {
  interpretarPreco,
  lerPalavrasChave,
  mapearColunas,
  resumir,
  validarPlanilha,
  type Celula,
} from "./validacao";

const SEGMENTOS = [
  { id: "seg-uro", nome: "Urologia/Endourologia" },
  { id: "seg-lap", nome: "Laparoscopia" },
];
const CABECALHO = ["ID", "REFERÊNCIA", "PRODUTO", "PREÇO PROPOSTA", "LANCE MÍNIMO"];

function validar(linhas: Celula[][], cabecalho: Celula[] = CABECALHO) {
  return validarPlanilha([cabecalho, ...linhas], SEGMENTOS);
}

describe("interpretarPreco", () => {
  it("aceita vírgula ou ponto como decimal", () => {
    expect(interpretarPreco("98,5")).toEqual({ valor: 98.5 });
    expect(interpretarPreco("98.5")).toEqual({ valor: 98.5 });
    expect(interpretarPreco("150")).toEqual({ valor: 150 });
    expect(interpretarPreco(150.25)).toEqual({ valor: 150.25 });
  });

  it("entende separador de milhar nos dois padrões", () => {
    expect(interpretarPreco("1.234,56")).toEqual({ valor: 1234.56 });
    expect(interpretarPreco("1,234.56")).toEqual({ valor: 1234.56 });
    expect(interpretarPreco("1.234.567,8")).toEqual({ valor: 1234567.8 });
    expect(interpretarPreco("1.234.567")).toEqual({ valor: 1234567 });
    expect(interpretarPreco("1,234,567")).toEqual({ valor: 1234567 });
  });

  it("ignora R$ e espaços", () => {
    expect(interpretarPreco("R$ 1.234,56")).toEqual({ valor: 1234.56 });
    expect(interpretarPreco("  r$98,50 ")).toEqual({ valor: 98.5 });
  });

  it("avisa quando um ponto sozinho pode ser milhar", () => {
    const resultado = interpretarPreco("1.234");
    expect(resultado).toMatchObject({ valor: 1.234 });
    expect("aviso" in resultado && resultado.aviso).toContain("Se for milhar");
    // Com 2 casas não há dúvida.
    expect(interpretarPreco("12.50")).toEqual({ valor: 12.5 });
  });

  it("recusa vazio, texto e negativo", () => {
    expect(interpretarPreco("")).toEqual({ erro: "em branco" });
    expect(interpretarPreco(null)).toEqual({ erro: "em branco" });
    expect(interpretarPreco("a consultar")).toMatchObject({ erro: expect.stringContaining("não é um número") });
    expect(interpretarPreco("-5")).toEqual({ erro: "não pode ser negativo" });
    expect(interpretarPreco(-5)).toEqual({ erro: "não pode ser negativo" });
  });

  it("arredonda para 4 casas", () => {
    expect(interpretarPreco("0,123456")).toEqual({ valor: 0.1235 });
    expect(interpretarPreco(0.1 + 0.2)).toEqual({ valor: 0.3 });
  });
});

describe("mapearColunas", () => {
  it("reconhece os títulos do modelo em qualquer ordem, sem ligar para acento e caixa", () => {
    const mapa = mapearColunas(["lance minimo", "Produto", "id", "Referencia", "PREÇO PROPOSTA"]);
    expect(mapa.indices).toEqual({ lance_minimo: 0, nome: 1, codigo: 2, referencia: 3, preco_proposta: 4 });
    expect(mapa.faltando).toEqual([]);
  });

  it("aceita apelidos e colunas opcionais", () => {
    const mapa = mapearColunas(["Código", "Ref.", "Descrição", "Preço", "Mínimo", "Registro ANVISA", "Palavras-chave/Sinônimos"]);
    expect(mapa.faltando).toEqual([]);
    expect(mapa.indices.registro_anvisa).toBe(5);
    expect(mapa.indices.palavras_chave).toBe(6);
  });

  it("aponta colunas obrigatórias que faltam, as ignoradas e as repetidas", () => {
    const mapa = mapearColunas(["ID", "PRODUTO", "Estoque", "produto", null, ""]);
    expect(mapa.faltando).toEqual(["REFERÊNCIA", "PREÇO PROPOSTA", "LANCE MÍNIMO"]);
    expect(mapa.ignoradas).toEqual(["Estoque"]);
    expect(mapa.repetidas).toEqual(["PRODUTO"]);
  });
});

describe("validarPlanilha", () => {
  it("aceita linhas completas, com preço em texto ou número", () => {
    const r = validar([
      ["001", "DJ-626", "Cateter duplo J 6Fr x 26 cm", "150,00", "98,5"],
      [2, "FG-035", "Fio guia 0,035", 180, 120],
    ]);
    expect(r.erroGeral).toBeUndefined();
    expect(r.linhas.map((l) => l.erros)).toEqual([[], []]);
    expect(r.linhas[0].dados).toMatchObject({ codigo: "001", preco_proposta: 150, lance_minimo: 98.5 });
    // ID numérico vira texto sem casas decimais, e a linha da planilha é contada a partir do cabeçalho.
    expect(r.linhas[1].dados?.codigo).toBe("2");
    expect(r.linhas[1].linha).toBe(3);
  });

  it("marca campos obrigatórios vazios, um erro por campo", () => {
    const r = validar([["", "", "", "", ""].map(() => null) as Celula[], ["003", "", "Produto", "abc", ""]]);
    // A linha totalmente vazia é ignorada.
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0].erros).toEqual([
      "REFERÊNCIA em branco",
      'PREÇO PROPOSTA "abc" não é um número',
      "LANCE MÍNIMO em branco",
    ]);
    expect(r.linhas[0].dados).toBeUndefined();
  });

  it("recusa todas as linhas de um ID repetido e diz onde está a outra", () => {
    const r = validar([
      ["001", "A", "Produto A", 10, 8],
      ["002", "B", "Produto B", 10, 8],
      ["001", "C", "Produto C", 12, 9],
    ]);
    expect(r.linhas[0].erros).toEqual(["ID repetido (também na linha 4)"]);
    expect(r.linhas[2].erros).toEqual(["ID repetido (também na linha 2)"]);
    expect(r.linhas[0].dados).toBeUndefined();
    expect(r.linhas[1].dados).toBeDefined();
    expect(resumir(r.linhas)).toEqual({ total: 3, validas: 1, comErro: 2, comAviso: 0 });
  });

  it("avisa (sem barrar) lance acima do preço, preço zero e segmento desconhecido", () => {
    const r = validar(
      [
        ["1", "A", "Produto A", 10, 12, "Urologia"],
        ["2", "B", "Produto B", 0, 0, "laparoscopia"],
        ["3", "C", "Produto C", 10, 8, "Odontologia"],
      ],
      [...CABECALHO, "Segmento"],
    );
    expect(r.linhas[0].avisos).toEqual(["LANCE MÍNIMO maior que o PREÇO PROPOSTA"]);
    expect(r.linhas[0].dados?.segmento_id).toBe("seg-uro");
    expect(r.linhas[1].avisos).toEqual(["PREÇO PROPOSTA igual a zero", "LANCE MÍNIMO igual a zero"]);
    expect(r.linhas[1].dados?.segmento_id).toBe("seg-lap");
    expect(r.linhas[2].avisos).toEqual(['Segmento "Odontologia" não reconhecido; ficará em branco']);
    expect(r.linhas[2].dados?.segmento_id).toBeNull();
    expect(resumir(r.linhas)).toEqual({ total: 3, validas: 3, comErro: 0, comAviso: 3 });
  });

  it("lê as colunas opcionais e limpa espaços", () => {
    const r = validar(
      [["1", " A ", "  Cateter   duplo J ", 10, 8, "Duplo J; pigtail | DUPLO J", " 6Fr x 26 cm ", "", "Fab", 80123]],
      [...CABECALHO, "Palavras-chave", "Medidas", "Marca", "Fabricante", "Registro ANVISA"],
    );
    expect(r.linhas[0].dados).toMatchObject({
      referencia: "A",
      nome: "Cateter duplo J",
      palavras_chave: ["duplo j", "pigtail"],
      medidas: "6Fr x 26 cm",
      marca: null,
      fabricante: "Fab",
      registro_anvisa: "80123",
    });
  });

  it("para tudo quando falta coluna obrigatória ou não há produtos", () => {
    expect(validarPlanilha([["ID", "PRODUTO"], ["1", "x"]], SEGMENTOS).erroGeral).toContain(
      "REFERÊNCIA, PREÇO PROPOSTA, LANCE MÍNIMO",
    );
    expect(validarPlanilha([CABECALHO], SEGMENTOS).erroGeral).toContain("só tem o cabeçalho");
    expect(validarPlanilha([], SEGMENTOS).erroGeral).toContain("vazia");
    expect(validarPlanilha([[null, ""], []], SEGMENTOS).erroGeral).toContain("vazia");
  });

  it("aceita linhas em branco antes do cabeçalho", () => {
    const r = validarPlanilha([[], [null], CABECALHO, ["1", "A", "Produto", 10, 8]], SEGMENTOS);
    expect(r.erroGeral).toBeUndefined();
    expect(r.linhas[0].linha).toBe(4);
  });

  it("limita o tamanho da importação", () => {
    const muitas = Array.from({ length: 5001 }, (_, i) => [String(i), "R", "Produto", 10, 8]);
    expect(validar(muitas).erroGeral).toContain("limite por importação é 5.000");
    expect(validar(muitas.slice(0, 5000)).erroGeral).toBeUndefined();
  });
});

describe("lerPalavrasChave", () => {
  it("separa por ponto e vírgula, barra ou linha, sem quebrar na vírgula", () => {
    expect(lerPalavrasChave("fio guia 0,035; Fio  Guia 0,035 | hidrofílico\nstent")).toEqual([
      "fio guia 0,035",
      "hidrofílico",
      "stent",
    ]);
    expect(lerPalavrasChave("")).toEqual([]);
  });
});
