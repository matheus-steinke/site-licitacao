// Tira o texto de um arquivo do edital: PDF (com o pdftotext, do pacote poppler-utils), DOCX,
// ODT, HTML, texto puro e ZIP com esses formatos dentro. Documento digitalizado (imagem) sai
// sem texto: ler imagem exigiria OCR, que fica fora do MVP.
//
// Os arquivos vêm de fora e não são confiáveis: há limite de tamanho e de quantidade, e o
// pdftotext roda sem as variáveis de ambiente do coletor (onde está a chave de serviço).

import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable, Writable } from "node:stream";

import { unzipSync } from "fflate";

export type Formato = "pdf" | "docx" | "odt" | "html" | "texto" | "zip" | "planilha" | "outro";
export type TextoExtraido = { texto: string; formato: Formato };

/** O pdftotext não está instalado: o passo inteiro para, em vez de marcar tudo como sem texto. */
export class PdftotextAusente extends Error {
  constructor() {
    super("O pdftotext não está instalado. No Ubuntu: sudo apt-get install -y poppler-utils.");
  }
}

const MAXIMO_DE_ENTRADAS = 40;
const MAXIMO_POR_ENTRADA = 40 * 1_048_576;
const MAXIMO_DESCOMPACTADO = 120 * 1_048_576;
/** Um edital de 300 páginas tem perto de 1 milhão de letras; acima disso é anexo de planilha. */
const MAXIMO_DE_TEXTO = 4_000_000;
const TEMPO_DO_PDFTOTEXT_MS = 90_000;

export type ConversorDePdf = (pdf: Uint8Array) => Promise<string>;

/** Roda "pdftotext - -": o PDF entra pela entrada padrão e o texto sai pela saída. */
export const pdfParaTexto: ConversorDePdf = (pdf) =>
  new Promise((resolve, reject) => {
    const processo: ChildProcessByStdio<Writable, Readable, null> = spawn("pdftotext", ["-enc", "UTF-8", "-q", "-", "-"], {
      // Ambiente mínimo: o pdftotext não recebe a chave de serviço nem as outras variáveis.
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin" } as Partial<NodeJS.ProcessEnv> as NodeJS.ProcessEnv,
      stdio: ["pipe", "pipe", "ignore"],
    });
    const pedacos: Buffer[] = [];
    let total = 0;
    const relogio = setTimeout(() => processo.kill("SIGKILL"), TEMPO_DO_PDFTOTEXT_MS);
    processo.stdout.on("data", (pedaco: Buffer) => {
      total += pedaco.length;
      if (total > MAXIMO_DE_TEXTO * 4) processo.kill("SIGKILL");
      else pedacos.push(pedaco);
    });
    processo.on("error", (erro: Error) => {
      clearTimeout(relogio);
      reject((erro as NodeJS.ErrnoException).code === "ENOENT" ? new PdftotextAusente() : erro);
    });
    // PDF quebrado, protegido por senha ou que estourou o tempo: fica com o que saiu.
    processo.on("close", () => {
      clearTimeout(relogio);
      resolve(Buffer.concat(pedacos).toString("utf8"));
    });
    // O pdftotext pode fechar a entrada antes de ler tudo; isso não é erro nosso.
    processo.stdin.on("error", () => {});
    processo.stdin.end(pdf);
  });

function decodificar(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  // Muitos órgãos ainda geram HTML e TXT em Latin-1.
  return utf8.includes("�") ? new TextDecoder("latin1").decode(bytes) : utf8;
}

// Entidades de HTML que aparecem em páginas em português (o SEI escreve "licita&ccedil;&atilde;o").
const ENTIDADES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  agrave: "à", Agrave: "À", acirc: "â", ecirc: "ê", ocirc: "ô", Acirc: "Â", Ecirc: "Ê", Ocirc: "Ô",
  atilde: "ã", otilde: "õ", Atilde: "Ã", Otilde: "Õ", ccedil: "ç", Ccedil: "Ç", uuml: "ü", Uuml: "Ü",
  ordm: "º", ordf: "ª", deg: "°", sect: "§", ndash: "–", mdash: "—", hellip: "…",
  laquo: "«", raquo: "»", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’",
};

function semMarcacao(fonte: string): string {
  return fonte
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|tr|li|h\d|text:p|w:p)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n: string) => {
      const codigo = /^x/i.test(n) ? parseInt(n.slice(1), 16) : Number(n);
      return codigo > 0 && codigo <= 0x10ffff ? String.fromCodePoint(codigo) : " ";
    })
    .replace(/&([a-z]+);/gi, (_, nome: string) => ENTIDADES[nome] ?? ENTIDADES[nome.toLowerCase()] ?? " ");
}

function comeco(conteudo: Uint8Array, quantos: number): string {
  return Buffer.from(conteudo.subarray(0, quantos)).toString("latin1");
}

function extensao(nome: string): string {
  return /\.([a-z0-9]{1,5})$/i.exec(nome)?.[1].toLowerCase() ?? "";
}

type Entradas = Record<string, Uint8Array>;

function abrirZip(conteudo: Uint8Array, aceitar: (nome: string) => boolean): Entradas {
  let entradas = 0;
  let total = 0;
  try {
    return unzipSync(conteudo, {
      filter(arquivo) {
        if (!aceitar(arquivo.name) || arquivo.originalSize > MAXIMO_POR_ENTRADA) return false;
        if (++entradas > MAXIMO_DE_ENTRADAS) return false;
        total += arquivo.originalSize;
        return total <= MAXIMO_DESCOMPACTADO;
      },
    });
  } catch {
    return {};
  }
}

const cortar = (texto: string) => (texto.length > MAXIMO_DE_TEXTO ? texto.slice(0, MAXIMO_DE_TEXTO) : texto);

/**
 * O texto de um arquivo. Formato desconhecido ou sem texto devolve texto vazio; só a falta do
 * pdftotext vira erro.
 */
export async function extrairTexto(
  conteudo: Uint8Array,
  converterPdf: ConversorDePdf = pdfParaTexto,
  dentroDeZip = false,
): Promise<TextoExtraido> {
  const inicio = comeco(conteudo, 1024);
  if (inicio.startsWith("%PDF")) return { texto: cortar(await converterPdf(conteudo)), formato: "pdf" };

  if (inicio.startsWith("PK\u0003\u0004")) {
    // DOCX, XLSX e ODT também são ZIP: olha primeiro os nomes de dentro.
    const marcas = abrirZip(conteudo, (nome) => nome === "word/document.xml" || nome === "content.xml" || nome === "xl/workbook.xml");
    if (marcas["word/document.xml"]) return { texto: cortar(semMarcacao(decodificar(marcas["word/document.xml"]))), formato: "docx" };
    if (marcas["xl/workbook.xml"]) return { texto: "", formato: "planilha" };
    if (marcas["content.xml"]) return { texto: cortar(semMarcacao(decodificar(marcas["content.xml"]))), formato: "odt" };
    if (dentroDeZip) return { texto: "", formato: "zip" };

    const dentro = abrirZip(conteudo, (nome) => ["pdf", "docx", "odt", "html", "htm", "txt"].includes(extensao(nome)));
    const partes: string[] = [];
    let tamanho = 0;
    for (const nome of Object.keys(dentro).sort()) {
      if (tamanho >= MAXIMO_DE_TEXTO) break;
      const bytes = dentro[nome];
      const tipo = extensao(nome);
      const parte =
        tipo === "html" || tipo === "htm"
          ? semMarcacao(decodificar(bytes))
          : tipo === "txt"
            ? decodificar(bytes)
            : (await extrairTexto(bytes, converterPdf, true)).texto;
      partes.push(parte);
      tamanho += parte.length;
    }
    return { texto: cortar(partes.join("\n")), formato: "zip" };
  }

  if (/^\s*(?:<!doctype html|<html|<\?xml)/i.test(inicio) || /<html[\s>]/i.test(inicio)) {
    return { texto: cortar(semMarcacao(decodificar(conteudo))), formato: "html" };
  }
  // Texto puro: quase só caracteres imprimíveis no começo.
  const amostra = comeco(conteudo, 512);
  if (amostra.length > 0 && !/[\u0000-\u0008\u000e-\u001f]/.test(amostra)) return { texto: cortar(decodificar(conteudo)), formato: "texto" };
  return { texto: "", formato: "outro" };
}

/** Quantas letras e números o texto tem: abaixo de um mínimo, o documento é imagem. */
export function letras(texto: string): number {
  return texto.replace(/[^\p{L}\p{N}]/gu, "").length;
}
