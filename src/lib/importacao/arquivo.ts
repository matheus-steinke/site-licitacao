// Leitura de Excel (.xlsx) e CSV e geração do modelo. Funciona no navegador e no Node.

import Papa from "papaparse";
import { readSheet } from "read-excel-file/universal";
import writeExcelFile from "write-excel-file/universal";

import { COLUNAS, EXEMPLOS_MODELO } from "./colunas";
import type { Celula } from "./validacao";

export class ErroDeArquivo extends Error {}

function paraCelula(valor: unknown): Celula {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor === "string") return valor;
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  return String(valor);
}

/** CSV exportado pelo Excel brasileiro costuma vir em Windows-1252, não em UTF-8. */
function decodificar(conteudo: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(conteudo);
  } catch {
    return new TextDecoder("windows-1252").decode(conteudo);
  }
}

/** Lê a primeira aba de um .xlsx ou um .csv e devolve as linhas como texto/número. */
export async function lerPlanilha(nomeArquivo: string, conteudo: ArrayBuffer): Promise<Celula[][]> {
  const extensao = nomeArquivo.toLowerCase().split(".").pop() ?? "";

  if (extensao === "xlsx") {
    try {
      const linhas = await readSheet(conteudo);
      return linhas.map((linha) => linha.map(paraCelula));
    } catch {
      throw new ErroDeArquivo(
        "Não consegui abrir o arquivo Excel. Confira se ele não está corrompido ou protegido por senha.",
      );
    }
  }

  if (extensao === "csv" || extensao === "txt") {
    const texto = decodificar(conteudo).replace(/^﻿/, "");
    const resultado = Papa.parse<string[]>(texto, { skipEmptyLines: "greedy" });
    return resultado.data.map((linha) => linha.map(paraCelula));
  }

  if (extensao === "xls") {
    throw new ErroDeArquivo(
      "O formato .xls (Excel antigo) não é aceito. Abra o arquivo no Excel e salve como .xlsx ou CSV.",
    );
  }
  throw new ErroDeArquivo("Formato não aceito. Envie um arquivo .xlsx ou .csv.");
}

/** Modelo da tabela de preços em Excel, com duas linhas de exemplo. */
export async function gerarModeloExcel(): Promise<Blob> {
  const negrito = { fontWeight: "bold" as const };
  const cabecalho = COLUNAS.map((c) => ({ value: c.titulo, ...negrito }));
  return writeExcelFile([cabecalho, ...EXEMPLOS_MODELO], {
    columns: COLUNAS.map((c) => ({ width: c.largura })),
    sheet: "Tabela de preços",
  }).toBlob();
}

/** Modelo em CSV, com ponto e vírgula e BOM, do jeito que o Excel brasileiro abre direto. */
export function gerarModeloCsv(): string {
  const linhas = [COLUNAS.map((c) => c.titulo), ...EXEMPLOS_MODELO].map((linha) =>
    linha.map((valor) =>
      typeof valor === "number" ? valor.toFixed(2).replace(".", ",") : String(valor),
    ),
  );
  return "﻿" + Papa.unparse(linhas, { delimiter: ";", newline: "\r\n" });
}
