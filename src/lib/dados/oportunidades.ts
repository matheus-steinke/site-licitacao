import "server-only";

import { linkDoPncp } from "@/lib/dados/compras";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/tipos";
import { lerAlertas } from "@/lib/triagem/alertas";
import type { AlertaDeItem, DetalheDoCasamento, Nivel } from "@/lib/triagem/motor";

export type StatusOportunidade = Database["public"]["Enums"]["status_oportunidade"];

export const ABAS = ["novas", "agendadas", "disputadas", "descartadas"] as const;
export type AbaDeOportunidades = (typeof ABAS)[number];

export const LIMITE_DA_LISTA = 200;
/** Quantos itens sem casamento a página de detalhe mostra. */
export const LIMITE_DE_OUTROS_ITENS = 300;

export type OportunidadeResumo = Awaited<ReturnType<typeof listarOportunidades>>["oportunidades"][number];

type Linha = Database["public"]["Views"]["oportunidades_lista"]["Row"];

function resumir(linha: Linha, agora: number) {
  const disputa = linha.data_disputa ? new Date(linha.data_disputa).getTime() : null;
  return {
    id: linha.id as string,
    compraId: linha.compra_id as string,
    status: linha.status as StatusOportunidade,
    motivoDescarte: linha.motivo_descarte,
    decididoEm: linha.decidido_em,
    prioridade: linha.prioridade ?? 0,
    score: linha.score ?? 0,
    itensCompativeis: linha.itens_compativeis ?? 0,
    itensAVerificar: linha.itens_a_verificar ?? 0,
    itensDoSegmento: linha.itens_do_segmento ?? 0,
    segmentoIds: linha.segmento_ids ?? [],
    valorEstimado: Number(linha.valor_estimado ?? 0),
    alertas: lerAlertas(linha.alertas),
    controlePncp: linha.controle_pncp ?? "",
    numeroCompra: linha.numero_compra,
    uf: linha.uf ?? "",
    municipio: linha.municipio,
    modalidade: linha.modalidade_nome ?? "",
    objeto: linha.objeto ?? "",
    situacaoId: linha.situacao_id ?? 1,
    dataDisputa: linha.data_disputa,
    valorTotalDoEdital: linha.valor_total_estimado,
    orgao: linha.orgao_nome ?? "Órgão não informado",
    totalItens: linha.total_itens ?? 0,
    exemplo: linha.exemplo ?? false,
    /** A disputa já aconteceu. */
    encerrada: disputa !== null && disputa < agora,
    linkPncp:
      linha.exemplo || !linha.orgao_cnpj || !linha.ano || !linha.sequencial
        ? null
        : linkDoPncp({ orgao_cnpj: linha.orgao_cnpj, ano: linha.ano, sequencial: linha.sequencial }),
  };
}

/**
 * Oportunidades da organização numa das abas da caixa de entrada, com a contagem de cada aba.
 * "Disputada" não é um status gravado: é a aprovada cuja data de disputa já passou.
 */
export async function listarOportunidades(orgId: string, aba: AbaDeOportunidades, soCatalogo: boolean) {
  const supabase = await criarClienteServidor();
  const agoraMs = Date.now();
  const agora = new Date(agoraMs).toISOString();

  const filtrar = (qual: AbaDeOportunidades, contar: boolean) => {
    const base = contar
      ? supabase.from("oportunidades_lista").select("id", { count: "exact", head: true })
      : supabase.from("oportunidades_lista").select("*");
    const consulta = base.eq("org_id", orgId);
    switch (qual) {
      case "novas":
        return consulta.eq("status", "nova").gte("prioridade", soCatalogo ? 2 : 1).gte("data_disputa", agora);
      case "agendadas":
        return consulta.eq("status", "aprovada").gte("data_disputa", agora);
      case "disputadas":
        return consulta.in("status", ["aprovada", "ganha", "perdida"]).lt("data_disputa", agora);
      case "descartadas":
        return consulta.eq("status", "descartada");
    }
  };

  let lista = filtrar(aba, false);
  if (aba === "novas") lista = lista.order("prioridade", { ascending: false }).order("data_disputa", { ascending: true });
  else if (aba === "agendadas") lista = lista.order("data_disputa", { ascending: true });
  else if (aba === "disputadas") lista = lista.order("data_disputa", { ascending: false });
  else lista = lista.order("decidido_em", { ascending: false });

  const [linhas, ...contagens] = await Promise.all([lista.limit(LIMITE_DA_LISTA), ...ABAS.map((a) => filtrar(a, true))]);
  const erro = linhas.error ?? contagens.find((c) => c.error)?.error;
  if (erro) throw new Error(`Falha ao carregar as oportunidades: ${erro.message}`);

  const total = Object.fromEntries(ABAS.map((a, i) => [a, contagens[i].count ?? 0])) as Record<AbaDeOportunidades, number>;
  return {
    oportunidades: (linhas.data ?? []).map((linha) => resumir(linha as Linha, agoraMs)),
    total,
    cortada: (linhas.data ?? []).length === LIMITE_DA_LISTA,
  };
}

export type ItemCompativel = {
  itemId: string;
  numero: number;
  descricao: string;
  quantidade: number | null;
  unidade: string | null;
  valorReferencia: number | null;
  nivel: Nivel;
  score: number;
  detalhe: Partial<DetalheDoCasamento>;
  alertas: AlertaDeItem[];
  lote: string | null;
  produto: { id: string; codigo: string; referencia: string; nome: string; precoProposta: number; lanceMinimo: number };
};

export type OutroItem = {
  id: string;
  numero: number;
  descricao: string;
  quantidade: number | null;
  unidade: string | null;
  valorReferencia: number | null;
};

/** Uma oportunidade com tudo o que a página de detalhe mostra (ou null se não existe para a organização). */
export async function obterOportunidade(orgId: string, id: string) {
  const supabase = await criarClienteServidor();
  const { data: linha, error } = await supabase
    .from("oportunidades_lista")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Falha ao carregar a oportunidade: ${error.message}`);
  if (!linha?.compra_id) return null;

  const [casados, itens, arquivos, compra] = await Promise.all([
    supabase
      .from("oportunidade_itens")
      .select(
        `nivel, score, detalhe, alertas, lote,
         item:compra_itens (id, numero_item, descricao, quantidade, unidade, valor_unitario_estimado),
         produto:produtos (id, codigo, referencia, nome, preco_proposta, lance_minimo)`,
      )
      .eq("oportunidade_id", id),
    supabase
      .from("compra_itens")
      .select("id, numero_item, descricao, quantidade, unidade, valor_unitario_estimado")
      .eq("compra_id", linha.compra_id)
      .order("numero_item")
      .limit(LIMITE_DE_OUTROS_ITENS + 200),
    supabase
      .from("compra_arquivos")
      .select("id, titulo, tipo_documento, url, publicado_em")
      .eq("compra_id", linha.compra_id)
      .order("sequencial_documento"),
    supabase
      .from("compras")
      .select("processo, unidade_nome, modo_disputa, srp, data_publicacao, data_abertura_proposta, link_sistema_origem")
      .eq("id", linha.compra_id)
      .maybeSingle(),
  ]);
  const falha = casados.error ?? itens.error ?? arquivos.error ?? compra.error;
  if (falha) throw new Error(`Falha ao carregar os itens da oportunidade: ${falha.message}`);

  const compativeis: ItemCompativel[] = (casados.data ?? [])
    .flatMap((c) => {
      if (!c.item || !c.produto) return [];
      return [
        {
          itemId: c.item.id,
          numero: c.item.numero_item,
          descricao: c.item.descricao,
          quantidade: c.item.quantidade,
          unidade: c.item.unidade,
          valorReferencia: c.item.valor_unitario_estimado,
          nivel: c.nivel as Nivel,
          score: c.score,
          detalhe: (c.detalhe ?? {}) as Partial<DetalheDoCasamento>,
          alertas: c.alertas as AlertaDeItem[],
          lote: c.lote,
          produto: {
            id: c.produto.id,
            codigo: c.produto.codigo,
            referencia: c.produto.referencia,
            nome: c.produto.nome,
            precoProposta: Number(c.produto.preco_proposta),
            lanceMinimo: Number(c.produto.lance_minimo),
          },
        },
      ];
    })
    .sort((a, b) => a.numero - b.numero);

  const casou = new Set(compativeis.map((c) => c.itemId));
  const outros: OutroItem[] = (itens.data ?? [])
    .filter((item) => !casou.has(item.id))
    .slice(0, LIMITE_DE_OUTROS_ITENS)
    .map((item) => ({
      id: item.id,
      numero: item.numero_item,
      descricao: item.descricao,
      quantidade: item.quantidade,
      unidade: item.unidade,
      valorReferencia: item.valor_unitario_estimado,
    }));

  const resumo = resumir(linha as Linha, Date.now());
  return {
    ...resumo,
    compra: compra.data,
    compativeis,
    outros,
    totalDeOutros: Math.max(0, resumo.totalItens - compativeis.length),
    arquivos: arquivos.data ?? [],
  };
}

export type OportunidadeDetalhe = NonNullable<Awaited<ReturnType<typeof obterOportunidade>>>;
