// Casamento de um texto (item de licitação, objeto) com os segmentos da saúde.

import {
  prepararTermos,
  prepararTexto,
  primeiroTermo,
  VERSAO_DO_CASAMENTO,
  type OpcoesDeCasamento,
  type Termo,
  type TextoPreparado,
} from "./normalizar";

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
  opcoes: OpcoesDeCasamento = {},
): CasamentoDeSegmento[] {
  const preparado = typeof texto === "string" ? prepararTexto(texto) : texto;
  if (preparado.palavras.length === 0) return [];

  const casamentos: CasamentoDeSegmento[] = [];
  for (const segmento of segmentos) {
    const termo = primeiroTermo(preparado, segmento.termos, opcoes);
    if (!termo) continue;
    if (primeiroTermo(preparado, segmento.exclusoes, opcoes)) continue;
    casamentos.push({ segmentoId: segmento.id, termo: termo.original });
  }
  return casamentos;
}

/**
 * Texto que identifica a regra de classificação em vigor: a versão do casamento mais os
 * termos de todos os segmentos. Se dois momentos têm a mesma assinatura, classificar de
 * novo daria o mesmo resultado.
 */
export function assinaturaDaClassificacao(segmentos: SegmentoBruto[]): string {
  const ordenar = (termos: string[]) => [...termos].map((t) => t.trim().toLowerCase()).sort();
  const base = [...segmentos]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((s) => [s.id, ordenar(s.palavras_chave), ordenar(s.sinonimos), ordenar(s.exclusoes)]);
  return JSON.stringify([VERSAO_DO_CASAMENTO, base]);
}
