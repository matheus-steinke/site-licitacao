// Dados públicos de uma licitação do PNCP que servem tanto ao app quanto ao coletor.

export const SITUACOES: Record<number, string> = {
  1: "Divulgada",
  2: "Revogada",
  3: "Anulada",
  4: "Suspensa",
  // Código nosso: o PNCP respondeu que a contratação foi excluída do portal.
  99: "Excluída do PNCP",
};

/** Endereço público do edital no portal do PNCP. */
export function linkDoPncp(compra: { orgao_cnpj: string; ano: number; sequencial: number }): string {
  return `https://pncp.gov.br/app/editais/${compra.orgao_cnpj}/${compra.ano}/${compra.sequencial}`;
}
