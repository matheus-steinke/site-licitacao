// Normalização de texto e casamento de termos, sem IA.
// É a base do filtro "área da saúde" do coletor e da triagem por catálogo.

/**
 * Mude este número sempre que a regra de casamento mudar: o coletor reclassifica o que
 * já foi coletado quando a versão (ou os segmentos) muda.
 */
export const VERSAO_DO_CASAMENTO = 2;

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
 * Forma de comparação de uma palavra: singular e sem a vogal final, para que gênero e
 * pequenas variações não atrapalhem (endoscópio/endoscopia, cirúrgico/cirúrgica).
 * Palavras curtas e com números ficam como estão.
 */
export function radical(palavra: string): string {
  const base = singular(palavra);
  if (base.length <= 4 || /\d/.test(base)) return base;
  return /[aeo]$/.test(base) ? base.slice(0, -1) : base;
}

/**
 * Texto -> lista de palavras comparáveis: minúsculas, sem acento, sem pontuação,
 * sem palavras vazias e reduzidas ao radical. "Cateteres Duplo-J, 6Fr" -> ["cateter","dupl","j","6fr"].
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
    .map(radical);
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

/** Quantas palavras "de sobra" podem aparecer entre as palavras do termo, no modo "proximas". */
const FOLGA = 3;

export type OpcoesDeCasamento = {
  /**
   * true (padrão): as palavras do termo precisam estar próximas. Use em textos longos, que
   * falam de várias coisas (objeto do edital, texto do edital).
   * false: basta todas aparecerem. Use na descrição de UM item, em que tudo se refere ao
   * mesmo produto. Muitos órgãos descrevem assim: "SERINGA - ADICIONAL: GRADUADA; ...;
   * ESTERILIDADE: ESTÉRIL, DESCARTÁVEL".
   */
  proximas?: boolean;
};

/**
 * true se todas as palavras do termo aparecem inteiras no texto (em qualquer ordem) e, no
 * modo "proximas", perto umas das outras. "cateter duplo j" casa com
 * "CATETER URETERAL DUPLO J 6FR"; "uti" não casa com "utilizado".
 */
export function contemTermo(texto: TextoPreparado, termo: Termo, opcoes: OpcoesDeCasamento = {}): boolean {
  const listas: number[][] = [];
  for (const palavra of termo.palavras) {
    const lista = texto.posicoes.get(palavra);
    if (!lista) return false;
    listas.push(lista);
  }
  if (listas.length === 1 || opcoes.proximas === false) return true;

  const janela = termo.palavras.length + FOLGA;
  // Para cada ocorrência da primeira palavra, as demais precisam cair na mesma janela.
  return listas[0].some((inicio) =>
    listas.every((lista) => lista.some((p) => Math.abs(p - inicio) < janela)),
  );
}

/** Primeiro termo da lista que aparece no texto (ou undefined). */
export function primeiroTermo(
  texto: TextoPreparado,
  termos: Termo[],
  opcoes: OpcoesDeCasamento = {},
): Termo | undefined {
  return termos.find((termo) => contemTermo(texto, termo, opcoes));
}
