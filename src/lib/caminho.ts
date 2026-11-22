/** Aceita só caminhos internos ("/algo"), para evitar redirecionamento aberto. */
export function caminhoSeguro(valor: unknown, padrao = "/oportunidades"): string {
  if (typeof valor !== "string") return padrao;
  if (!valor.startsWith("/") || valor.startsWith("//") || valor.includes("\\")) {
    return padrao;
  }
  return valor;
}
