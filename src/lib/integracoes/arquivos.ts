// Baixa um arquivo do edital no PNCP para enviá-lo ao Drive. O PNCP responde sempre como
// "application/octet-stream", sem tamanho e com o nome mal codificado; por isso o nome vem do
// título guardado na coleta e o tipo, da extensão ou do começo do conteúdo.

const TIPOS: Record<string, string> = {
  pdf: "application/pdf",
  zip: "application/zip",
  rar: "application/vnd.rar",
  "7z": "application/x-7z-compressed",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  txt: "text/plain",
  csv: "text/csv",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

export class ArquivoGrandeDemais extends Error {}

export type ArquivoBaixado = { nome: string; tipo: string; conteudo: Uint8Array };

/** Extensão pelo começo do conteúdo, para os arquivos que chegam sem nome útil. */
function extensaoPeloConteudo(conteudo: Uint8Array): string | null {
  const inicio = Buffer.from(conteudo.subarray(0, 8)).toString("latin1");
  if (inicio.startsWith("%PDF")) return "pdf";
  if (inicio.startsWith("PK\u0003\u0004")) return "zip";
  if (inicio.startsWith("Rar!")) return "rar";
  if (inicio.startsWith("7z¼¯")) return "7z";
  if (inicio.startsWith("\u0089PNG")) return "png";
  if (inicio.startsWith("ÿØÿ")) return "jpg";
  return null;
}

/** Nome e tipo finais do arquivo, a partir do título do PNCP e do conteúdo. */
export function identificarArquivo(titulo: string | null, conteudo: Uint8Array, sequencial: number): { nome: string; tipo: string } {
  const base = (titulo ?? "").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() || `Arquivo ${sequencial}`;
  const extensaoDoNome = /\.([a-z0-9]{1,5})$/i.exec(base)?.[1].toLowerCase();
  if (extensaoDoNome && TIPOS[extensaoDoNome]) return { nome: base, tipo: TIPOS[extensaoDoNome] };
  const extensao = extensaoPeloConteudo(conteudo);
  if (!extensao) return { nome: base, tipo: "application/octet-stream" };
  return { nome: extensaoDoNome === extensao ? base : `${base}.${extensao}`, tipo: TIPOS[extensao] };
}

/**
 * Baixa o arquivo inteiro para a memória, até o limite. Passou do limite, desiste com
 * ArquivoGrandeDemais (o arquivo continua disponível pelo link do PNCP).
 */
export async function baixarArquivo(
  url: string,
  titulo: string | null,
  sequencial: number,
  limiteBytes: number,
  buscar: typeof fetch = fetch,
): Promise<ArquivoBaixado> {
  const resposta = await buscar(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; coletor-licitacoes/1.0)" },
    signal: AbortSignal.timeout(120_000),
  });
  if (!resposta.ok || !resposta.body) throw new Error(`O PNCP respondeu HTTP ${resposta.status} ao baixar o arquivo.`);
  const anunciado = Number(resposta.headers.get("content-length"));
  if (anunciado > limiteBytes) {
    await resposta.body.cancel();
    throw new ArquivoGrandeDemais(`Arquivo com mais de ${Math.round(limiteBytes / 1_048_576)} MB.`);
  }

  const pedacos: Uint8Array[] = [];
  let total = 0;
  const leitor = resposta.body.getReader();
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > limiteBytes) {
      await leitor.cancel();
      throw new ArquivoGrandeDemais(`Arquivo com mais de ${Math.round(limiteBytes / 1_048_576)} MB.`);
    }
    pedacos.push(value);
  }
  if (total === 0) throw new Error("O PNCP devolveu um arquivo vazio.");
  const conteudo = new Uint8Array(total);
  let posicao = 0;
  for (const pedaco of pedacos) {
    conteudo.set(pedaco, posicao);
    posicao += pedaco.byteLength;
  }
  return { ...identificarArquivo(titulo, conteudo, sequencial), conteudo };
}
