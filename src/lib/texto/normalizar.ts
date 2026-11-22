// Normalização de texto e casamento de termos, sem IA.
// É a base do filtro "área da saúde" do coletor e da triagem por catálogo.

/** Palavras que não ajudam a distinguir um produto de outro. */
const VAZIAS = new Set([
  "a", "o", "as", "os", "de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas",
  "para", "p", "com", "c", "por", "ou", "um", "uma", "ao", "aos", "tipo",
]);

/**
 * Reduz o plural ao singular de forma simples (não é um dicionário):
 * cateteres -> cateter, descartáveis -> descartavel, soluções -> solucao, agulhas -> agulha.
 * Aplicada igualmente ao termo e ao texto, então eventuais imprecisões se cancelam.
 */
export function singular(palavra: string): string {
  if (palavra.length <= 3 || /\d/.test(palavra)) return palavra;
  if (palavra.endsWith("oes") || palavra.endsWith("aes")) return `${palavra.slice(0, -3)}ao`;
  if (palavra.endsWith("ais")) return `${palavra.slice(0, -3)}al`;
  if (palavra.endsWith("eis")) return `${palavra.slice(0, -3)}el`;
  if (palavra.endsWith("ois")) return `${palavra.slice(0, -3)}ol`;
  if (palavra.endsWith("res") || palavra.endsWith("zes")) return palavra.slice(0, -2);
  if (palavra.endsWith("ns")) return `${palavra.slice(0, -2)}m`;
  if (palavra.endsWith("s") && !palavra.endsWith("ss")) return palavra.slice(0, -1);
  return palavra;
}

/**
 * Texto -> lista de palavras comparáveis: minúsculas, sem acento, sem pontuação,
 * sem palavras vazias e no singular. "Cateteres Duplo-J, 6Fr" -> ["cateter","duplo","j","6fr"].
 */
export function tokenizar(texto: string): string[] {
  const limpo = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!limpo) return [];
  return limpo
    .split(" ")
    .filter((palavra) => !VAZIAS.has(palavra))
    .map(singular);
}

/** Um termo já preparado para comparação. */
export type Termo = { original: string; palavras: string[] };

export function prepararTermo(termo: string): Termo | null {
  const palavras = tokenizar(termo);
  return palavras.length > 0 ? { original: termo, palavras } : null;
}

export function prepararTermos(termos: string[]): Termo[] {
  return termos.flatMap((termo) => prepararTermo(termo) ?? []);
}

/** Um texto já preparado: as palavras e onde cada uma aparece. */
export type TextoPreparado = { palavras: string[]; posicoes: Map<string, number[]> };

export function prepararTexto(texto: string): TextoPreparado {
  const palavras = tokenizar(texto);
  const posicoes = new Map<string, number[]>();
  palavras.forEach((palavra, indice) => {
    const lista = posicoes.get(palavra);
    if (lista) lista.push(indice);
    else posicoes.set(palavra, [indice]);
  });
  return { palavras, posicoes };
}

/** Quantas palavras "de sobra" podem aparecer entre as palavras do termo. */
const FOLGA = 3;

/**
 * true se todas as palavras do termo aparecem no texto, inteiras e próximas
 * umas das outras (em qualquer ordem). Assim "cateter duplo j" casa com
 * "CATETER URETERAL DUPLO J 6FR", mas não com um texto em que "cateter" e
 * "duplo" estão em itens diferentes de uma lista longa.
 */
export function contemTermo(texto: TextoPreparado, termo: Termo): boolean {
  const listas: number[][] = [];
  for (const palavra of termo.palavras) {
    const lista = texto.posicoes.get(palavra);
    if (!lista) return false;
    listas.push(lista);
  }
  if (listas.length === 1) return true;

  const janela = termo.palavras.length + FOLGA;
  // Para cada ocorrência da primeira palavra, as demais precisam cair na mesma janela.
  return listas[0].some((inicio) =>
    listas.every((lista) => lista.some((p) => Math.abs(p - inicio) < janela)),
  );
}

/** Primeiro termo da lista que aparece no texto (ou undefined). */
export function primeiroTermo(texto: TextoPreparado, termos: Termo[]): Termo | undefined {
  return termos.find((termo) => contemTermo(texto, termo));
}
