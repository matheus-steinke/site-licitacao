import "server-only";

import { limitesDoPeriodo, type Periodo } from "@/lib/dashboard/periodo";
import { resumirDashboard, type LinhaDoDashboard, type StatusNoDashboard } from "@/lib/dashboard/resumo";
import { criarClienteServidor } from "@/lib/supabase/server";

const PAGINA = 1000;
/** Teto de segurança: muito além do que uma empresa aprova. */
const MAXIMO_DE_LINHAS = 10_000;

const COLUNAS =
  "id, status, data_disputa, uf, municipio, orgao_nome, modalidade_nome, numero_compra, objeto, situacao_id, itens_compativeis, itens_a_verificar, valor_lance_minimo";

/**
 * Números do Dashboard: licitações aprovadas (ou ganhas, ou perdidas) da organização com a
 * disputa dentro do período. O RLS garante que só entram as da própria organização.
 */
export async function carregarDashboard(orgId: string, periodo: Periodo) {
  const supabase = await criarClienteServidor();
  const { de, ate } = limitesDoPeriodo(periodo);

  const linhas: LinhaDoDashboard[] = [];
  for (let inicio = 0; inicio < MAXIMO_DE_LINHAS; inicio += PAGINA) {
    let consulta = supabase
      .from("oportunidades_aprovadas")
      .select(COLUNAS)
      .eq("org_id", orgId)
      .not("data_disputa", "is", null);
    if (de) consulta = consulta.gte("data_disputa", de);
    if (ate) consulta = consulta.lte("data_disputa", ate);
    const { data, error } = await consulta
      .order("data_disputa", { ascending: true })
      .order("id", { ascending: true })
      .range(inicio, inicio + PAGINA - 1);
    if (error) throw new Error(`Falha ao carregar o Dashboard: ${error.message}`);

    for (const linha of data) {
      if (!linha.id || !linha.data_disputa) continue;
      linhas.push({
        id: linha.id,
        status: (linha.status ?? "aprovada") as StatusNoDashboard,
        dataDisputa: linha.data_disputa,
        uf: linha.uf ?? "",
        municipio: linha.municipio,
        orgao: linha.orgao_nome ?? "Órgão não informado",
        modalidade: linha.modalidade_nome ?? "",
        numeroCompra: linha.numero_compra,
        objeto: linha.objeto ?? "",
        situacaoId: linha.situacao_id ?? 1,
        itensCompativeis: linha.itens_compativeis ?? 0,
        itensAVerificar: linha.itens_a_verificar ?? 0,
        valor: Number(linha.valor_lance_minimo ?? 0),
      });
    }
    if (data.length < PAGINA) break;
  }

  return resumirDashboard(linhas, Date.now());
}
