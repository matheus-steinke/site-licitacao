// Casamento de um texto (item de licitação, objeto) com os segmentos da saúde.

import { prepararTermos, prepararTexto, primeiroTermo, type Termo, type TextoPreparado } from "./normalizar";

export type SegmentoBruto = {
  id: string;
  nome: string;
  palavras_chave: string[];
  sinonimos: string[];
  exclusoes: string[];
};

export type SegmentoPreparado = {
  id: string;
  nome: string;
  /** Palavras-chave e sinônimos: qualquer um deles liga o texto ao segmento. */
  termos: Termo[];
  /** Se algum aparecer, o texto não casa com o segmento. */
  exclusoes: Termo[];
};

export function prepararSegmentos(segmentos: SegmentoBruto[]): SegmentoPreparado[] {
  return segmentos.map((s) => ({
    id: s.id,
    nome: s.nome,
    termos: prepararTermos([...s.palavras_chave, ...s.sinonimos]),
    exclusoes: prepararTermos(s.exclusoes),
  }));
}

export type CasamentoDeSegmento = { segmentoId: string; termo: string };

/** Segmentos com que o texto casa, com o termo que provocou o casamento. */
export function casarSegmentos(
  texto: string | TextoPreparado,
  segmentos: SegmentoPreparado[],
): CasamentoDeSegmento[] {
  const preparado = typeof texto === "string" ? prepararTexto(texto) : texto;
  if (preparado.palavras.length === 0) return [];

  const casamentos: CasamentoDeSegmento[] = [];
  for (const segmento of segmentos) {
    const termo = primeiroTermo(preparado, segmento.termos);
    if (!termo) continue;
    if (primeiroTermo(preparado, segmento.exclusoes)) continue;
    casamentos.push({ segmentoId: segmento.id, termo: termo.original });
  }
  return casamentos;
}
