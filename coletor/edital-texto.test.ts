import { spawnSync } from "node:child_process";

import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { extrairTexto, letras, pdfParaTexto, type ConversorDePdf } from "./edital-texto";

const pdfFalso = (texto: string) => strToU8(`%PDF-1.4 ${texto}`);
/** No lugar do pdftotext: devolve o que vem depois do cabeçalho. */
const converter: ConversorDePdf = async (pdf) => Buffer.from(pdf).toString("utf8").replace("%PDF-1.4 ", "");

const docx = (texto: string) =>
  zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "word/document.xml": strToU8(`<w:document><w:body><w:p><w:r><w:t>${texto}</w:t></w:r></w:p></w:body></w:document>`),
  });

describe("extrairTexto", () => {
  it("PDF passa pelo conversor", async () => {
    expect(await extrairTexto(pdfFalso("Será exigida amostra"), converter)).toEqual({ texto: "Será exigida amostra", formato: "pdf" });
  });

  it("DOCX e ODT: texto do XML, com quebra de parágrafo", async () => {
    const r = await extrairTexto(docx("Termo de Referência &amp; anexos"), converter);
    expect(r.formato).toBe("docx");
    expect(r.texto.trim()).toBe("Termo de Referência & anexos");
    const odt = zipSync({ "content.xml": strToU8("<office:text><text:p>Edital em ODT</text:p><text:p>segunda linha</text:p></office:text>") });
    const lido = await extrairTexto(odt, converter);
    expect(lido.formato).toBe("odt");
    expect(lido.texto).toMatch(/Edital em ODT\s*\n\s*segunda linha/);
  });

  it("planilha não tem texto de edital", async () => {
    const xlsx = zipSync({ "xl/workbook.xml": strToU8("<workbook/>"), "xl/sharedStrings.xml": strToU8("<sst>amostra</sst>") });
    expect(await extrairTexto(xlsx, converter)).toEqual({ texto: "", formato: "planilha" });
  });

  it("ZIP: junta PDF, DOCX, HTML e TXT de dentro e ignora o resto", async () => {
    const zip = zipSync({
      "1 - Edital.pdf": pdfFalso("edital em pdf"),
      "anexos/Anexo I - TR.docx": docx("termo em docx"),
      "pagina.html": strToU8("<html><head><style>p{color:red}</style><script>var amostra=1</script></head><body><p>p&aacute;gina em html</p></body></html>"),
      "leia-me.txt": strToU8("texto puro"),
      "planilha.xlsx": zipSync({ "xl/workbook.xml": strToU8("<workbook/>") }),
      "foto.jpg": new Uint8Array([0xff, 0xd8, 0xff, 0x00]),
      "outro.zip": zipSync({ "dentro.pdf": pdfFalso("zip dentro de zip não é aberto") }),
    });
    const r = await extrairTexto(zip, converter);
    expect(r.formato).toBe("zip");
    expect(r.texto).toContain("edital em pdf");
    expect(r.texto).toContain("termo em docx");
    expect(r.texto).toContain("página em html");
    expect(r.texto).toContain("texto puro");
    expect(r.texto).not.toContain("color:red");
    expect(r.texto).not.toContain("var amostra");
    expect(r.texto).not.toContain("zip dentro de zip");
  });

  it("HTML em Latin-1 e arquivo desconhecido", async () => {
    const latin1 = Buffer.from("<html><body><p>Licitação com exigência</p></body></html>", "latin1");
    const r = await extrairTexto(latin1, converter);
    expect(r.formato).toBe("html");
    expect(r.texto).toContain("Licitação com exigência");
    // Como o SEI escreve: acentos em entidades, com nome, número ou hexadecimal.
    const sei = strToU8("<html><body>APRESENTA&Ccedil;&Atilde;O DE AMOSTRA: N&#195;O &#xE9; exigida&nbsp;agora</body></html>");
    expect((await extrairTexto(sei, converter)).texto).toContain("APRESENTAÇÃO DE AMOSTRA: NÃO é exigida agora");
    expect(await extrairTexto(new Uint8Array([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00, 0x01]), converter)).toEqual({ texto: "", formato: "outro" });
    expect(await extrairTexto(new Uint8Array(), converter)).toEqual({ texto: "", formato: "outro" });
  });

  it("ZIP quebrado não derruba a leitura", async () => {
    const quebrado = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(await extrairTexto(quebrado, converter)).toEqual({ texto: "", formato: "zip" });
  });

  it("letras conta só letras e números", () => {
    expect(letras(" \n -- 12 ação.\f")).toBe(6);
  });
});

// PDF mínimo de verdade, para conferir o pdftotext quando ele está instalado.
const PDF_MINIMO = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 58>>stream
BT /F1 18 Tf 20 100 Td (Sera exigida amostra) Tj ET
endstream
endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Root 1 0 R>>
%%EOF`;

const temPdftotext = spawnSync("pdftotext", ["-v"]).error === undefined;

describe.skipIf(!temPdftotext)("pdfParaTexto (pdftotext de verdade)", () => {
  it("lê o texto de um PDF e não quebra com lixo", async () => {
    expect(await pdfParaTexto(strToU8(PDF_MINIMO))).toContain("Sera exigida amostra");
    expect(await pdfParaTexto(strToU8("%PDF-1.4 isto não é um PDF"))).toBe("");
  });
});
