// Prepara um produto do catálogo para a triagem: do nome saem as palavras que definem o
// produto (o "núcleo") e as medidas. Marca, fabricante e frases de embalagem ficam de fora.

import { prepararTermos, radical, tokenizar, type Termo } from "../texto/normalizar";
import { extrairMedidas, normalizarParaMedidas, type MedidasExtraidas } from "./medidas";

export type ProdutoBruto = {
  id: string;
  codigo: string;
  nome: string;
  palavras_chave: string[];
  medidas: string | null;
  marca: string | null;
  fabricante: string | null;
  lance_minimo: number;
};

export type ProdutoPreparado = {
  id: string;
  codigo: string;
  /** Palavras do nome que definem o produto, já no radical, na ordem em que aparecem. */
  nucleo: { palavra: string; peso: number }[];
  palavrasChave: Termo[];
  medidas: MedidasExtraidas;
  lanceMinimo: number;
};

/** Do ponto em que uma destas aparece em diante, o nome fala de marca, registro ou embalagem. */
const FIM_DO_NUCLEO =
  /\b(?:marca|fabricante|fabric|rms|registro|anvisa|referencia|ref|codigo|cod|atoxico|apirogenico|embalagem|validade|procedencia)\b|\b(?:descartavel|esteril)\s*\./;

/** Depois de "MARCA:" ou "FABRICANTE:" vem o nome da marca. */
const NOME_DE_MARCA = /\b(?:marca|fabricante)\s*:?\s*([a-z][a-z0-9-]{2,})/g;

/** Palavras que dizem pouco sobre qual é o produto. */
export const FRACAS = new Set(
  [
    "kit", "conjunto", "sistema", "jogo", "par", "peca", "parte", "modelo", "tipo", "uso", "unico",
    "descartavel", "esteril", "reutilizavel", "digital", "adulto", "infantil", "pediatrico", "ponta",
    "compativel", "equipamento", "aparelho", "material", "produto", "via", "novo", "video",
  ].map(radical),
);
const PESO_FRACA = 0.3;
const MAXIMO_DE_PALAVRAS = 8;

/** Nomes de marca citados depois de "MARCA:"/"FABRICANTE:" em qualquer produto do catálogo. */
export function marcasDoCatalogo(produtos: ProdutoBruto[]): Set<string> {
  const marcas = new Set<string>();
  for (const produto of produtos) {
    for (const campo of [produto.marca, produto.fabricante]) {
      for (const palavra of tokenizar(campo ?? "")) marcas.add(palavra);
    }
    for (const achado of normalizarParaMedidas(produto.nome).matchAll(NOME_DE_MARCA)) {
      for (const palavra of tokenizar(achado[1])) marcas.add(palavra);
    }
  }
  return marcas;
}

export function prepararProduto(produto: ProdutoBruto, marcas: Set<string> = new Set()): ProdutoPreparado {
  const nome = normalizarParaMedidas(produto.nome);
  const corte = nome.search(FIM_DO_NUCLEO);
  const inicio = corte === -1 ? nome : nome.slice(0, corte);

  const nucleo: ProdutoPreparado["nucleo"] = [];
  for (const palavra of tokenizar(inicio)) {
    // Números, medidas ("4.7fr", "1p") e o "x" de "6 x 26" não definem o produto.
    if (/\d/.test(palavra) || palavra === "x" || marcas.has(palavra)) continue;
    if (nucleo.some((n) => n.palavra === palavra)) continue;
    nucleo.push({ palavra, peso: FRACAS.has(palavra) ? PESO_FRACA : 1 });
    if (nucleo.length === MAXIMO_DE_PALAVRAS) break;
  }

  return {
    id: produto.id,
    codigo: produto.codigo,
    nucleo,
    palavrasChave: prepararTermos(produto.palavras_chave ?? []),
    medidas: extrairMedidas(`${produto.nome} ${produto.medidas ?? ""}`),
    lanceMinimo: Number(produto.lance_minimo),
  };
}
