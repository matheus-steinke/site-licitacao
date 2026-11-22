// Listas de termos dos segmentos (palavras-chave, sinônimos, exclusões).

/**
 * Lê um texto com um termo por linha (ou separados por ponto e vírgula).
 * Vírgula NÃO separa termos, porque aparece em medidas como "fio guia 0,035".
 * Devolve os termos em minúsculas, sem espaços sobrando e sem repetição.
 */
export function lerTermos(texto: string): string[] {
  const vistos = new Set<string>();
  for (const pedaco of texto.split(/[\n;]/)) {
    const termo = pedaco.trim().replace(/\s+/g, " ").toLowerCase();
    if (termo) vistos.add(termo);
  }
  return [...vistos];
}

/** "Urologia/Endourologia" -> "urologia-endourologia" */
export function gerarSlug(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
