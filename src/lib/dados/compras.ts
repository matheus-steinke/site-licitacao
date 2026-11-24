import "server-only";

export const SITUACOES: Record<number, string> = {
  1: "Divulgada",
  2: "Revogada",
  3: "Anulada",
  4: "Suspensa",
};

/** Endereço público do edital no portal do PNCP. */
export function linkDoPncp(compra: { orgao_cnpj: string; ano: number; sequencial: number }): string {
  return `https://pncp.gov.br/app/editais/${compra.orgao_cnpj}/${compra.ano}/${compra.sequencial}`;
}
