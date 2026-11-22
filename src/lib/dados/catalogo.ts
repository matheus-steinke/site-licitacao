import "server-only";

import { criarClienteServidor } from "@/lib/supabase/server";

export const PRODUTOS_POR_PAGINA = 50;

export const TIPOS_DE_ARQUIVO: Record<string, string> = {
  catalogo_tecnico: "Catálogo técnico",
  registro_anvisa: "Registro ANVISA",
  outro: "Outro",
};

/** Tira o que quebraria o filtro do PostgREST e os curingas do LIKE. */
export function limparBusca(texto: string | undefined): string {
  return (texto ?? "")
    .replace(/[%_,()\\"*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export async function listarProdutos(orgId: string, busca: string, pagina: number) {
  const supabase = await criarClienteServidor();
  const inicio = (pagina - 1) * PRODUTOS_POR_PAGINA;

  let consulta = supabase
    .from("produtos")
    .select(
      `id, codigo, referencia, nome, preco_proposta, lance_minimo, marca,
       segmento:segmentos (nome), arquivos:produto_arquivos (count)`,
      { count: "exact" },
    )
    .eq("org_id", orgId);

  if (busca) {
    const padrao = `%${busca}%`;
    consulta = consulta.or(
      `codigo.ilike.${padrao},referencia.ilike.${padrao},nome.ilike.${padrao},marca.ilike.${padrao}`,
    );
  }

  const { data, count, error } = await consulta
    .order("codigo")
    .range(inicio, inicio + PRODUTOS_POR_PAGINA - 1);
  if (error) throw new Error(`Falha ao carregar os produtos: ${error.message}`);

  return {
    produtos: data.map((p) => ({
      ...p,
      segmento: p.segmento?.nome ?? null,
      totalArquivos: p.arquivos[0]?.count ?? 0,
    })),
    total: count ?? 0,
  };
}

export async function contarProdutos(orgId: string): Promise<number> {
  const supabase = await criarClienteServidor();
  const { count, error } = await supabase
    .from("produtos")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);
  if (error) throw new Error(`Falha ao contar os produtos: ${error.message}`);
  return count ?? 0;
}

export async function obterProduto(orgId: string, id: string) {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("produtos")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Falha ao carregar o produto: ${error.message}`);
  return data;
}

export async function listarArquivosDoProduto(produtoId: string) {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("produto_arquivos")
    .select("id, tipo, nome, tamanho, criado_em")
    .eq("produto_id", produtoId)
    .order("criado_em");
  if (error) throw new Error(`Falha ao carregar os arquivos: ${error.message}`);
  return data;
}

/** Todos os IDs (coluna "ID" da tabela de preços) já cadastrados. */
export async function listarCodigos(orgId: string): Promise<string[]> {
  const supabase = await criarClienteServidor();
  const codigos: string[] = [];
  // O PostgREST devolve no máximo 1.000 linhas por chamada.
  for (let inicio = 0; ; inicio += 1000) {
    const { data, error } = await supabase
      .from("produtos")
      .select("codigo")
      .eq("org_id", orgId)
      .order("codigo")
      .range(inicio, inicio + 999);
    if (error) throw new Error(`Falha ao carregar os IDs: ${error.message}`);
    codigos.push(...data.map((p) => p.codigo));
    if (data.length < 1000) break;
  }
  return codigos;
}

export async function listarExclusoes(orgId: string) {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("organizacao_exclusoes")
    .select("id, termo")
    .eq("org_id", orgId)
    .order("termo");
  if (error) throw new Error(`Falha ao carregar as exclusões: ${error.message}`);
  return data;
}

export async function listarImportacoes(orgId: string) {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("importacoes")
    .select(
      "id, arquivo_nome, modo, total_linhas, incluidos, alterados, sem_mudanca, excluidos, com_erro, criado_em",
    )
    .eq("org_id", orgId)
    .order("criado_em", { ascending: false })
    .limit(10);
  if (error) throw new Error(`Falha ao carregar o histórico: ${error.message}`);
  return data;
}

/** Caminhos, no Storage, de todos os arquivos de produto da organização. */
export async function listarCaminhosDeArquivos(orgId: string): Promise<string[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("produto_arquivos")
    .select("caminho")
    .eq("org_id", orgId)
    .limit(10000);
  if (error) throw new Error(`Falha ao carregar os arquivos: ${error.message}`);
  return data.map((a) => a.caminho);
}
