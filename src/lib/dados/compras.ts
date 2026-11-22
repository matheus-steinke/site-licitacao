import "server-only";

import { criarClienteServidor } from "@/lib/supabase/server";

export const SITUACOES: Record<number, string> = {
  1: "Divulgada",
  2: "Revogada",
  3: "Anulada",
  4: "Suspensa",
};

export type CompraResumo = Awaited<ReturnType<typeof listarCompras>>[number];

/** Licitações das UFs informadas, da disputa mais próxima para a mais distante. */
export async function listarCompras(ufs: string[]) {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("compras")
    .select(
      `id, controle_pncp, numero_compra, uf, municipio, modalidade_nome, objeto,
       situacao_id, data_disputa, valor_total_estimado, exemplo,
       orgao:orgaos (razao_social),
       itens:compra_itens (count)`,
    )
    .in("uf", ufs)
    .order("data_disputa", { ascending: true })
    .limit(200);

  if (error) throw new Error(`Falha ao carregar licitações: ${error.message}`);
  const agora = Date.now();
  return data.map((compra) => ({
    ...compra,
    orgao: compra.orgao?.razao_social ?? "Órgão não informado",
    totalItens: compra.itens[0]?.count ?? 0,
    encerrada: compra.data_disputa ? new Date(compra.data_disputa).getTime() < agora : false,
  }));
}
