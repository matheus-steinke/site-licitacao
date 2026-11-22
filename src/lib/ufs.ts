export type Uf = { sigla: string; nome: string };

export const REGIOES: { nome: string; ufs: Uf[] }[] = [
  {
    nome: "Sul",
    ufs: [
      { sigla: "PR", nome: "Paraná" },
      { sigla: "RS", nome: "Rio Grande do Sul" },
      { sigla: "SC", nome: "Santa Catarina" },
    ],
  },
  {
    nome: "Sudeste",
    ufs: [
      { sigla: "ES", nome: "Espírito Santo" },
      { sigla: "MG", nome: "Minas Gerais" },
      { sigla: "RJ", nome: "Rio de Janeiro" },
      { sigla: "SP", nome: "São Paulo" },
    ],
  },
  {
    nome: "Centro-Oeste",
    ufs: [
      { sigla: "DF", nome: "Distrito Federal" },
      { sigla: "GO", nome: "Goiás" },
      { sigla: "MT", nome: "Mato Grosso" },
      { sigla: "MS", nome: "Mato Grosso do Sul" },
    ],
  },
  {
    nome: "Nordeste",
    ufs: [
      { sigla: "AL", nome: "Alagoas" },
      { sigla: "BA", nome: "Bahia" },
      { sigla: "CE", nome: "Ceará" },
      { sigla: "MA", nome: "Maranhão" },
      { sigla: "PB", nome: "Paraíba" },
      { sigla: "PE", nome: "Pernambuco" },
      { sigla: "PI", nome: "Piauí" },
      { sigla: "RN", nome: "Rio Grande do Norte" },
      { sigla: "SE", nome: "Sergipe" },
    ],
  },
  {
    nome: "Norte",
    ufs: [
      { sigla: "AC", nome: "Acre" },
      { sigla: "AP", nome: "Amapá" },
      { sigla: "AM", nome: "Amazonas" },
      { sigla: "PA", nome: "Pará" },
      { sigla: "RO", nome: "Rondônia" },
      { sigla: "RR", nome: "Roraima" },
      { sigla: "TO", nome: "Tocantins" },
    ],
  },
];

export const TODAS_UFS: string[] = REGIOES.flatMap((r) => r.ufs.map((u) => u.sigla));

const ORDEM = new Map(TODAS_UFS.map((sigla, i) => [sigla, i]));

/** Mantém só siglas válidas, sem repetição, na ordem das regiões. */
export function limparUfs(valores: unknown[]): string[] {
  const validas = new Set(
    valores.filter((v): v is string => typeof v === "string" && ORDEM.has(v)),
  );
  return [...validas].sort((a, b) => ORDEM.get(a)! - ORDEM.get(b)!);
}
