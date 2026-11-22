import "server-only";

import { criarClienteServidor } from "@/lib/supabase/server";

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

export type CompraResumo = Awaited<ReturnType<typeof listarCompras>>["compras"][number];

const CAMPOS = `id, controle_pncp, orgao_cnpj, ano, sequencial, numero_compra, uf, municipio,
  modalidade_nome, objeto, situacao_id, data_disputa, valor_total_estimado, exemplo,
  orgao:orgaos (razao_social),
  itens:compra_itens (count)`;

/**
 * Licitações das UFs informadas, da disputa mais próxima para a mais distante.
 * Enquanto o coletor não trouxe nenhuma licitação real, devolve as de exemplo.
 */
export async function listarCompras(ufs: string[]) {
  const supabase = await criarClienteServidor();
  const agora = Date.now();

  const { count: reais, error: erroContagem } = await supabase
    .from("compras")
    .select("id", { count: "exact", head: true })
    .eq("exemplo", false);
  if (erroContagem) throw new Error(`Falha ao carregar licitações: ${erroContagem.message}`);
  const soExemplos = (reais ?? 0) === 0;

  let consulta = supabase.from("compras").select(CAMPOS).in("uf", ufs).eq("exemplo", soExemplos);
  // Com dados reais, só as disputas que ainda não aconteceram.
  if (!soExemplos) consulta = consulta.gte("data_disputa", new Date(agora).toISOString());
  const { data, error } = await consulta.order("data_disputa", { ascending: true }).limit(200);
  if (error) throw new Error(`Falha ao carregar licitações: ${error.message}`);

  return {
    soExemplos,
    compras: data.map((compra) => ({
      ...compra,
      orgao: compra.orgao?.razao_social ?? "Órgão não informado",
      totalItens: compra.itens[0]?.count ?? 0,
      encerrada: compra.data_disputa ? new Date(compra.data_disputa).getTime() < agora : false,
      linkPncp: compra.exemplo ? null : linkDoPncp(compra),
    })),
  };
}
