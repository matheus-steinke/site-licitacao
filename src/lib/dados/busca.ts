import "server-only";

import { FUSO } from "@/lib/app";
import {
  lerSalvos,
  periodoDaBusca,
  RESULTADOS_POR_PAGINA,
  type FiltrosDeBusca,
} from "@/lib/busca/filtros";
import { linkDoPncp } from "@/lib/dados/compras";
import type { StatusOportunidade } from "@/lib/dados/oportunidades";
import { criarClienteServidor } from "@/lib/supabase/server";

/** O dia de hoje no horário de Brasília, AAAA-MM-DD. */
export function hojeEmBrasilia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );
}

type LinhaDoBanco = {
  id: string;
  controle_pncp: string;
  orgao_cnpj: string;
  ano: number;
  sequencial: number;
  numero_compra: string | null;
  uf: string;
  municipio: string | null;
  modalidade_nome: string;
  objeto: string;
  situacao_id: number;
  data_disputa: string | null;
  valor_total_estimado: number | null;
  segmento_ids: string[] | null;
  exemplo: boolean;
  itens_com_termo: number;
  termo_no_objeto: boolean;
  amostra: string[] | null;
  orgao_nome: string | null;
  total_itens: number;
  oportunidade: {
    id: string;
    status: StatusOportunidade;
    prioridade: number;
    itens_compativeis: number;
    itens_a_verificar: number;
    itens_por_segmento: Record<string, number> | null;
  } | null;
};

export type ResultadoDaBusca = Awaited<ReturnType<typeof buscarLicitacoes>>["resultados"][number];

/** Licitações da área da saúde que atendem aos filtros, uma página por vez. */
export async function buscarLicitacoes(orgId: string, filtros: FiltrosDeBusca, hoje: string) {
  const supabase = await criarClienteServidor();
  const periodo = periodoDaBusca(filtros, hoje);
  const { data, error } = await supabase.rpc("buscar_licitacoes", {
    p_org: orgId,
    p_termo: filtros.q || undefined,
    p_ufs: filtros.ufs ?? undefined,
    p_segmentos: filtros.segmentos.length > 0 ? filtros.segmentos : undefined,
    p_de: periodo.de ?? undefined,
    p_ate: periodo.ate ?? undefined,
    p_modalidades: filtros.modalidades.length > 0 ? filtros.modalidades : undefined,
    p_situacoes: filtros.situacoes.length > 0 ? filtros.situacoes : undefined,
    p_so_catalogo: filtros.soCatalogo,
    p_limite: RESULTADOS_POR_PAGINA,
    p_deslocamento: (filtros.pagina - 1) * RESULTADOS_POR_PAGINA,
  });
  if (error) throw new Error(`Falha na busca: ${error.message}`);

  const resposta = data as unknown as { total: number; linhas: LinhaDoBanco[] };
  const agora = Date.now();
  return {
    total: resposta.total,
    paginas: Math.max(1, Math.ceil(resposta.total / RESULTADOS_POR_PAGINA)),
    resultados: resposta.linhas.map((l) => ({
      compraId: l.id,
      controlePncp: l.controle_pncp,
      numeroCompra: l.numero_compra,
      uf: l.uf,
      municipio: l.municipio,
      modalidade: l.modalidade_nome,
      objeto: l.objeto,
      situacaoId: l.situacao_id,
      dataDisputa: l.data_disputa,
      valorTotalDoEdital: l.valor_total_estimado,
      segmentoIds: l.segmento_ids ?? [],
      exemplo: l.exemplo,
      orgao: l.orgao_nome ?? "Órgão não informado",
      totalItens: l.total_itens,
      itensComTermo: l.itens_com_termo,
      termoNoObjeto: l.termo_no_objeto,
      amostra: l.amostra ?? [],
      encerrada: l.data_disputa ? new Date(l.data_disputa).getTime() < agora : false,
      oportunidade: l.oportunidade
        ? {
            id: l.oportunidade.id,
            status: l.oportunidade.status,
            prioridade: l.oportunidade.prioridade,
            itensCompativeis: l.oportunidade.itens_compativeis,
            itensAVerificar: l.oportunidade.itens_a_verificar,
            itensPorSegmento: l.oportunidade.itens_por_segmento ?? {},
          }
        : null,
      linkPncp: l.exemplo ? null : linkDoPncp({ orgao_cnpj: l.orgao_cnpj, ano: l.ano, sequencial: l.sequencial }),
    })),
  };
}

export const MAXIMO_DE_BUSCAS_SALVAS = 30;

export type BuscaSalva = { id: string; nome: string; filtros: FiltrosDeBusca };

/** Buscas salvas da organização, em ordem alfabética. */
export async function listarBuscasSalvas(orgId: string, hoje: string): Promise<BuscaSalva[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("buscas_salvas")
    .select("id, nome, filtros")
    .eq("org_id", orgId)
    .order("nome");
  if (error) throw new Error(`Falha ao carregar as buscas salvas: ${error.message}`);
  return data.map((b) => ({ id: b.id, nome: b.nome, filtros: lerSalvos(b.filtros, hoje) }));
}
