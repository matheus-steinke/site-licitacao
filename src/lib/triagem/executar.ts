// Executa a triagem de uma organização em lotes: pede ao banco as compras pendentes, compara
// com o catálogo (motor.ts) e grava o resultado. O coletor chama com a chave de serviço e o
// app, com a sessão do usuário: as funções do banco conferem a permissão nos dois casos.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "../supabase/tipos";
import {
  prepararTriagem,
  triarCompra,
  VERSAO_DA_TRIAGEM,
  type ConfiguracaoDaTriagem,
  type ResultadoDaTriagem,
  type TriagemPreparada,
} from "./motor";
import type { ProdutoBruto } from "./produto";

type Cliente = SupabaseClient<Database>;

type CompraDoLote = {
  id: string;
  objeto: string;
  itens: {
    id: string;
    numero: number;
    descricao: string;
    quantidade: number | null;
    valor: number | null;
    me_epp: boolean;
    segmentos: string[];
  }[];
};

type Lote = { config_em: string; marca_ate: string | null; restantes: number; compras: CompraDoLote[] };

export type SituacaoDaTriagem = {
  /** O cliente mudou catálogo, exclusões, segmentos, estados ou limites (ou o motor mudou). */
  desatualizada: boolean;
  /** Licitações ainda não comparadas com o catálogo. */
  pendentes: number;
  triada_em: string | null;
};

const PAGINA = 1000;

export async function situacaoDaTriagem(supabase: Cliente, orgId: string): Promise<SituacaoDaTriagem> {
  const { data, error } = await supabase.rpc("triagem_situacao", { p_org: orgId, p_motor: VERSAO_DA_TRIAGEM });
  if (error) throw new Error(`Falha ao consultar a triagem: ${error.message}`);
  return data as unknown as SituacaoDaTriagem;
}

/** Tudo o que a triagem usa de uma organização: porte, limites, segmentos, exclusões e catálogo. */
export async function carregarConfiguracao(supabase: Cliente, orgId: string): Promise<ConfiguracaoDaTriagem> {
  const [org, segmentos, exclusoes] = await Promise.all([
    supabase.from("organizacoes").select("porte, score_compativel, score_verificar").eq("id", orgId).single(),
    supabase.from("organizacao_segmentos").select("segmento_id").eq("org_id", orgId),
    supabase.from("organizacao_exclusoes").select("termo").eq("org_id", orgId),
  ]);
  const erro = org.error ?? segmentos.error ?? exclusoes.error;
  if (erro || !org.data) throw new Error(`Falha ao carregar a configuração da triagem: ${erro?.message}`);

  const produtos: ProdutoBruto[] = [];
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await supabase
      .from("produtos")
      .select("id, codigo, nome, palavras_chave, medidas, marca, fabricante, lance_minimo")
      .eq("org_id", orgId)
      .order("id")
      .range(inicio, inicio + PAGINA - 1);
    if (error) throw new Error(`Falha ao carregar o catálogo: ${error.message}`);
    produtos.push(...data);
    if (data.length < PAGINA) break;
  }

  return {
    porte: org.data.porte,
    limiteCompativel: org.data.score_compativel,
    limiteVerificar: org.data.score_verificar,
    segmentoIds: (segmentos.data ?? []).map((s) => s.segmento_id),
    exclusoes: (exclusoes.data ?? []).map((e) => e.termo),
    produtos,
  };
}

function paraOBanco(compraId: string, r: ResultadoDaTriagem) {
  return {
    compra_id: compraId,
    prioridade: r.prioridade,
    score: r.score,
    itens_compativeis: r.itensCompativeis,
    itens_a_verificar: r.itensAVerificar,
    itens_do_segmento: r.itensDoSegmento,
    segmento_ids: r.segmentoIds,
    itens_por_segmento: r.itensPorSegmento,
    valor_estimado: r.valorEstimado,
    alertas: r.alertas,
    itens: r.itens.map((item) => ({
      item_id: item.itemId,
      produto_id: item.produtoId,
      nivel: item.nivel,
      score: item.score,
      detalhe: item.detalhe,
      alertas: item.alertas,
      lote: item.lote,
    })),
  };
}

export type OpcoesDoLote = { maxCompras?: number; maxItens?: number };

export type ResultadoDoLote = {
  /** Compras comparadas neste lote. */
  feitas: number;
  /** Quantas viraram (ou continuaram) oportunidade. */
  oportunidades: number;
  restantes: number;
  /** A configuração mudou durante o lote: nada foi gravado, é só chamar de novo. */
  refazer: boolean;
};

/** Guarda o catálogo preparado entre um lote e outro, enquanto a configuração não muda. */
export type MemoriaDaTriagem = { configEm?: string; triagem?: TriagemPreparada };

export async function triarLote(
  supabase: Cliente,
  orgId: string,
  opcoes: OpcoesDoLote = {},
  memoria: MemoriaDaTriagem = {},
): Promise<ResultadoDoLote> {
  const pedido = await supabase.rpc("triagem_lote", {
    p_org: orgId,
    p_motor: VERSAO_DA_TRIAGEM,
    p_max_compras: opcoes.maxCompras ?? 100,
    p_max_itens: opcoes.maxItens ?? 10_000,
  });
  if (pedido.error) throw new Error(`Falha ao pedir o lote de triagem: ${pedido.error.message}`);
  const lote = pedido.data as unknown as Lote;
  if (lote.compras.length === 0 || lote.marca_ate === null) {
    return { feitas: 0, oportunidades: 0, restantes: lote.restantes, refazer: false };
  }

  if (memoria.configEm !== lote.config_em || !memoria.triagem) {
    memoria.triagem = prepararTriagem(await carregarConfiguracao(supabase, orgId));
    memoria.configEm = lote.config_em;
  }
  const triagem = memoria.triagem;

  const resultados = lote.compras.map((compra) =>
    paraOBanco(
      compra.id,
      triarCompra(triagem, {
        objeto: compra.objeto,
        itens: compra.itens.map((item) => ({
          id: item.id,
          numero: item.numero,
          descricao: item.descricao,
          quantidade: item.quantidade,
          valorUnitario: item.valor,
          exclusivoMeEpp: item.me_epp,
          segmentoIds: item.segmentos,
        })),
      }),
    ),
  );

  const gravacao = await supabase.rpc("triagem_gravar", {
    p_org: orgId,
    p_config_em: lote.config_em,
    p_marca_ate: lote.marca_ate,
    p_resultados: resultados as unknown as Json,
  });
  if (gravacao.error) throw new Error(`Falha ao gravar a triagem: ${gravacao.error.message}`);
  const gravou = gravacao.data as unknown as { ok: boolean; motivo?: string };
  if (!gravou.ok) {
    memoria.configEm = undefined;
    return { feitas: 0, oportunidades: 0, restantes: lote.restantes + lote.compras.length, refazer: true };
  }
  return {
    feitas: lote.compras.length,
    oportunidades: resultados.filter((r) => r.prioridade > 0).length,
    restantes: lote.restantes,
    refazer: false,
  };
}

export type ResultadoDaOrganizacao = { feitas: number; oportunidades: number; restantes: number; lotes: number };

/** Tria tudo o que estiver pendente para a organização, até acabar ou o tempo se esgotar. */
export async function triarOrganizacao(
  supabase: Cliente,
  orgId: string,
  opcoes: OpcoesDoLote & { tempoMaximoMs?: number; agora?: () => number } = {},
): Promise<ResultadoDaOrganizacao> {
  const agora = opcoes.agora ?? Date.now;
  const prazo = agora() + (opcoes.tempoMaximoMs ?? 5 * 60_000);
  const memoria: MemoriaDaTriagem = {};
  const total: ResultadoDaOrganizacao = { feitas: 0, oportunidades: 0, restantes: 0, lotes: 0 };
  let refeitos = 0;

  while (agora() < prazo) {
    const lote = await triarLote(supabase, orgId, opcoes, memoria);
    total.lotes++;
    total.feitas += lote.feitas;
    total.oportunidades += lote.oportunidades;
    total.restantes = lote.restantes;
    if (lote.refazer) {
      // O cliente está mexendo no catálogo agora: tenta de novo algumas vezes e desiste.
      if (++refeitos > 3) break;
      continue;
    }
    if (lote.feitas === 0 || lote.restantes === 0) break;
  }
  return total;
}
