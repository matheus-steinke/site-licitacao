import { describe, expect, it } from "vitest";
import writeExcelFile from "write-excel-file/universal";

import { ErroDeArquivo, gerarModeloCsv, gerarModeloExcel, lerPlanilha } from "./arquivo";
import { COLUNAS } from "./colunas";
import { resumir, validarPlanilha } from "./validacao";

const SEGMENTOS = [{ id: "seg-uro", nome: "Urologia/Endourologia" }];
const utf8 = (texto: string) => new TextEncoder().encode(texto).buffer as ArrayBuffer;

describe("lerPlanilha", () => {
  it("lê um Excel de verdade, com números e textos", async () => {
    const blob = await writeExcelFile([
      ["ID", "REFERÊNCIA", "PRODUTO", "PREÇO PROPOSTA", "LANCE MÍNIMO"],
      ["001", "DJ-626", "Cateter duplo J 6Fr x 26 cm", 150.5, "98,50"],
      [2, "FG-035", "Fio guia hidrofílico 0,035\"", "1.234,56", 900],
    ]).toBlob();
    const planilha = await lerPlanilha("Tabela.XLSX", await blob.arrayBuffer());
    const resultado = validarPlanilha(planilha, SEGMENTOS);

    expect(resultado.erroGeral).toBeUndefined();
    expect(resultado.linhas.map((l) => l.dados)).toMatchObject([
      { codigo: "001", preco_proposta: 150.5, lance_minimo: 98.5 },
      { codigo: "2", nome: 'Fio guia hidrofílico 0,035"', preco_proposta: 1234.56, lance_minimo: 900 },
    ]);
  });

  it("lê CSV com ponto e vírgula, aspas e BOM", async () => {
    const csv =
      "﻿ID;REFERÊNCIA;PRODUTO;PREÇO PROPOSTA;LANCE MÍNIMO\r\n" +
      '001;DJ-626;"Cateter duplo J; 6Fr x 26 cm";150,00;98,50\r\n' +
      "\r\n" +
      "002;FG-035;Fio guia;180;120\r\n";
    const resultado = validarPlanilha(await lerPlanilha("tabela.csv", utf8(csv)), SEGMENTOS);
    expect(resultado.linhas.map((l) => l.dados)).toMatchObject([
      { codigo: "001", nome: "Cateter duplo J; 6Fr x 26 cm", preco_proposta: 150, lance_minimo: 98.5 },
      { codigo: "002", preco_proposta: 180 },
    ]);
  });

  it("lê CSV com vírgula como separador e ponto decimal", async () => {
    const csv = 'ID,REFERENCIA,PRODUTO,PRECO PROPOSTA,LANCE MINIMO\n7,R7,"Produto, com vírgula",10.5,8.25\n';
    const resultado = validarPlanilha(await lerPlanilha("tabela.csv", utf8(csv)), SEGMENTOS);
    expect(resultado.linhas[0].dados).toMatchObject({
      codigo: "7",
      nome: "Produto, com vírgula",
      preco_proposta: 10.5,
      lance_minimo: 8.25,
    });
  });

  it("lê CSV em Windows-1252 (padrão do Excel brasileiro) sem estragar os acentos", async () => {
    // "ID;REFERÊNCIA;PRODUTO;PREÇO PROPOSTA;LANCE MÍNIMO\n1;R;Cânula;10;8" em Windows-1252
    const texto = "ID;REFERÊNCIA;PRODUTO;PREÇO PROPOSTA;LANCE MÍNIMO\n1;R;Cânula de aspiração;10;8\n";
    const bytes = Uint8Array.from([...texto].map((c) => c.charCodeAt(0)));
    const resultado = validarPlanilha(await lerPlanilha("tabela.csv", bytes.buffer), SEGMENTOS);
    expect(resultado.erroGeral).toBeUndefined();
    expect(resultado.linhas[0].dados?.nome).toBe("Cânula de aspiração");
  });

  it("explica formatos não aceitos e arquivos corrompidos", async () => {
    await expect(lerPlanilha("antiga.xls", new ArrayBuffer(8))).rejects.toThrow(/salve como \.xlsx/i);
    await expect(lerPlanilha("foto.pdf", new ArrayBuffer(8))).rejects.toThrow(ErroDeArquivo);
    await expect(lerPlanilha("quebrado.xlsx", utf8("isto não é um excel"))).rejects.toThrow(
      /Não consegui abrir/,
    );
  });
});

describe("modelos para download", () => {
  it("o modelo Excel pode ser importado de volta sem erros", async () => {
    const blob = await gerarModeloExcel();
    const planilha = await lerPlanilha("modelo.xlsx", await blob.arrayBuffer());
    expect(planilha[0]).toEqual(COLUNAS.map((c) => c.titulo));

    const resultado = validarPlanilha(planilha, SEGMENTOS);
    expect(resultado.mapeamento.ignoradas).toEqual([]);
    expect(resumir(resultado.linhas)).toEqual({ total: 2, validas: 2, comErro: 0, comAviso: 0 });
    expect(resultado.linhas[0].dados).toMatchObject({
      codigo: "001",
      segmento_id: "seg-uro",
      palavras_chave: ["duplo j", "pigtail"],
      preco_proposta: 150,
      lance_minimo: 98.5,
    });
  });

  it("o modelo CSV pode ser importado de volta sem erros", async () => {
    const resultado = validarPlanilha(await lerPlanilha("modelo.csv", utf8(gerarModeloCsv())), SEGMENTOS);
    expect(resumir(resultado.linhas)).toEqual({ total: 2, validas: 2, comErro: 0, comAviso: 0 });
    expect(resultado.linhas[1].dados).toMatchObject({ codigo: "002", medidas: '0,035" x 150 cm', lance_minimo: 120 });
  });
});
