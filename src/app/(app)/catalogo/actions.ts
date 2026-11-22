"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { obterUsuario } from "@/lib/auth";
import { listarCaminhosDeArquivos } from "@/lib/dados/catalogo";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import {
  interpretarPreco,
  lerPalavrasChave,
  resumir,
  validarPlanilha,
  type Celula,
} from "@/lib/importacao/validacao";
import { listarSegmentosAtivos, obterOrganizacao } from "@/lib/organizacao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { lerTermos } from "@/lib/termos";

const FALHA = "Não foi possível salvar. Tente de novo em instantes.";
const SEM_EMPRESA = "Sua sessão expirou ou você não faz parte de uma empresa. Recarregue a página.";
const BUCKET = "produtos";

function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor : "";
}

async function removerDoStorage(caminhos: string[]) {
  if (caminhos.length === 0) return;
  const supabase = await criarClienteServidor();
  for (let i = 0; i < caminhos.length; i += 100) {
    const { error } = await supabase.storage.from(BUCKET).remove(caminhos.slice(i, i + 100));
    if (error) console.error("[catalogo] remover do storage:", error.message);
  }
}

// ---------------------------------------------------------------------------
// Produto
// ---------------------------------------------------------------------------
export async function salvarProduto(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const atual = await obterOrganizacao();
  if (!atual) return { erro: SEM_EMPRESA };

  const basicos = z
    .object({
      codigo: z.string().trim().min(1, "Informe o ID.").max(60, "O ID pode ter até 60 caracteres."),
      referencia: z.string().trim().min(1, "Informe a referência.").max(120),
      nome: z.string().trim().min(1, "Informe o nome do produto.").max(500),
    })
    .safeParse({
      codigo: texto(formData, "codigo"),
      referencia: texto(formData, "referencia"),
      nome: texto(formData, "nome"),
    });
  if (!basicos.success) return { erro: basicos.error.issues[0]?.message ?? FALHA };

  const preco = interpretarPreco(texto(formData, "preco_proposta"));
  if ("erro" in preco) return { erro: `Preço proposta ${preco.erro}.` };
  const lance = interpretarPreco(texto(formData, "lance_minimo"));
  if ("erro" in lance) return { erro: `Lance mínimo ${lance.erro}.` };

  const segmento = z.uuid().safeParse(formData.get("segmento_id"));
  const opcional = (campo: string) => texto(formData, campo).replace(/\s+/g, " ").trim() || null;
  const registro = {
    ...basicos.data,
    preco_proposta: preco.valor,
    lance_minimo: lance.valor,
    segmento_id: segmento.success ? segmento.data : null,
    palavras_chave: lerPalavrasChave(texto(formData, "palavras_chave")),
    medidas: opcional("medidas"),
    marca: opcional("marca"),
    fabricante: opcional("fabricante"),
    registro_anvisa: opcional("registro_anvisa"),
  };

  const supabase = await criarClienteServidor();
  const id = z.uuid().safeParse(formData.get("id"));

  if (id.success) {
    const { error } = await supabase
      .from("produtos")
      .update(registro)
      .eq("id", id.data)
      .eq("org_id", atual.org.id);
    if (error) {
      if (error.code === "23505") return { erro: "Já existe outro produto com esse ID." };
      console.error("[catalogo] atualizar produto:", error.code, error.message);
      return { erro: FALHA };
    }
    refresh();
    return { mensagem: "Produto salvo." };
  }

  const { data, error } = await supabase
    .from("produtos")
    .insert({ ...registro, org_id: atual.org.id })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { erro: "Já existe um produto com esse ID." };
    console.error("[catalogo] criar produto:", error.code, error.message);
    return { erro: FALHA };
  }
  redirect(`/catalogo/${data.id}?novo=1`);
}

export async function excluirProduto(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const atual = await obterOrganizacao();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!atual || !id.success) return { erro: SEM_EMPRESA };

  const supabase = await criarClienteServidor();
  const { data: arquivos } = await supabase
    .from("produto_arquivos")
    .select("caminho")
    .eq("produto_id", id.data);

  const { error } = await supabase
    .from("produtos")
    .delete()
    .eq("id", id.data)
    .eq("org_id", atual.org.id);
  if (error) {
    console.error("[catalogo] excluir produto:", error.code, error.message);
    return { erro: "Não foi possível excluir. Tente de novo em instantes." };
  }
  await removerDoStorage((arquivos ?? []).map((a) => a.caminho));
  redirect("/catalogo");
}

// ---------------------------------------------------------------------------
// Importação da tabela de preços
// ---------------------------------------------------------------------------
export type ProblemaDeLinha = { linha: number; codigo: string; erros: string[]; avisos: string[] };

export type RelatorioImportacao = {
  erro?: string;
  incluidos: number;
  alterados: number;
  semMudanca: number;
  excluidos: number;
  comErro: number;
  problemas: ProblemaDeLinha[];
};

const VAZIO: RelatorioImportacao = {
  incluidos: 0,
  alterados: 0,
  semMudanca: 0,
  excluidos: 0,
  comErro: 0,
  problemas: [],
};

const esquemaImportacao = z.object({
  arquivoNome: z.string().min(1).max(255),
  modo: z.enum(["atualizar", "substituir"]),
  planilha: z.array(z.array(z.union([z.string(), z.number(), z.null()]))).max(20000),
});

/**
 * Importa a tabela de preços. Recebe as células lidas no navegador e valida
 * tudo de novo aqui: o navegador serve só para a pré-visualização.
 */
export async function importarTabela(entrada: {
  arquivoNome: string;
  modo: "atualizar" | "substituir";
  planilha: Celula[][];
}): Promise<RelatorioImportacao> {
  const usuario = await obterUsuario();
  const atual = await obterOrganizacao();
  if (!usuario || !atual) return { ...VAZIO, erro: SEM_EMPRESA };

  const dados = esquemaImportacao.safeParse(entrada);
  if (!dados.success) return { ...VAZIO, erro: "Arquivo inválido. Selecione a planilha de novo." };

  const segmentos = await listarSegmentosAtivos();
  const validacao = validarPlanilha(dados.data.planilha, segmentos);
  if (validacao.erroGeral) return { ...VAZIO, erro: validacao.erroGeral };

  const resumo = resumir(validacao.linhas);
  const validas = validacao.linhas.flatMap((l) => (l.dados ? [l.dados] : []));
  if (validas.length === 0) {
    return { ...VAZIO, erro: "Nenhuma linha válida para importar. Corrija os erros e envie de novo." };
  }
  // No modo "substituir", produtos cujas linhas vieram com erro não são excluídos.
  const manter = [
    ...new Set(validacao.linhas.filter((l) => !l.dados && l.codigo).map((l) => l.codigo)),
  ];

  const supabase = await criarClienteServidor();
  const substituir = dados.data.modo === "substituir";
  const arquivosAntes = substituir ? await listarCaminhosDeArquivos(atual.org.id) : [];

  const { data, error } = await supabase.rpc("importar_produtos", {
    p_org: atual.org.id,
    p_modo: dados.data.modo,
    p_linhas: validas,
    p_manter: manter,
  });
  if (error) {
    console.error("[catalogo] importar:", error.code, error.message);
    return { ...VAZIO, erro: "A importação falhou e nada foi alterado. Tente de novo em instantes." };
  }

  // Produtos excluídos levam junto os registros de arquivo; aqui saem os arquivos em si.
  if (substituir && arquivosAntes.length > 0) {
    const depois = new Set(await listarCaminhosDeArquivos(atual.org.id));
    await removerDoStorage(arquivosAntes.filter((caminho) => !depois.has(caminho)));
  }

  const contagem = data as {
    incluidos: number;
    alterados: number;
    sem_mudanca: number;
    excluidos: number;
  };
  const problemas: ProblemaDeLinha[] = validacao.linhas
    .filter((l) => l.erros.length > 0 || l.avisos.length > 0)
    .map((l) => ({ linha: l.linha, codigo: l.codigo, erros: l.erros, avisos: l.avisos }));

  const { error: erroRegistro } = await supabase.from("importacoes").insert({
    org_id: atual.org.id,
    user_id: usuario.id,
    arquivo_nome: dados.data.arquivoNome,
    modo: dados.data.modo,
    total_linhas: resumo.total,
    incluidos: contagem.incluidos,
    alterados: contagem.alterados,
    sem_mudanca: contagem.sem_mudanca,
    excluidos: contagem.excluidos,
    com_erro: resumo.comErro,
    relatorio: problemas.slice(0, 500),
  });
  if (erroRegistro) console.error("[catalogo] registrar importação:", erroRegistro.message);

  refresh();
  return {
    incluidos: contagem.incluidos,
    alterados: contagem.alterados,
    semMudanca: contagem.sem_mudanca,
    excluidos: contagem.excluidos,
    comErro: resumo.comErro,
    problemas,
  };
}

// ---------------------------------------------------------------------------
// Exclusões da empresa
// ---------------------------------------------------------------------------
export async function adicionarExclusoes(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const atual = await obterOrganizacao();
  if (!atual) return { erro: SEM_EMPRESA };

  const termos = lerTermos(texto(formData, "termos"));
  if (termos.length === 0) return { erro: "Escreva pelo menos um termo." };
  const invalido = termos.find((t) => t.length < 2 || t.length > 120);
  if (invalido) return { erro: `O termo "${invalido}" precisa ter entre 2 e 120 caracteres.` };

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("organizacao_exclusoes")
    .upsert(
      termos.map((termo) => ({ org_id: atual.org.id, termo })),
      { onConflict: "org_id,termo", ignoreDuplicates: true },
    );
  if (error) {
    console.error("[catalogo] adicionar exclusões:", error.code, error.message);
    return { erro: FALHA };
  }
  refresh();
  return {
    mensagem: termos.length === 1 ? `"${termos[0]}" adicionado.` : `${termos.length} termos adicionados.`,
  };
}

export async function removerExclusao(formData: FormData): Promise<void> {
  const atual = await obterOrganizacao();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!atual || !id.success) return;

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("organizacao_exclusoes")
    .delete()
    .eq("id", id.data)
    .eq("org_id", atual.org.id);
  if (error) console.error("[catalogo] remover exclusão:", error.code, error.message);
  refresh();
}

// ---------------------------------------------------------------------------
// Arquivos do produto (o envio vai direto do navegador para o Storage)
// ---------------------------------------------------------------------------
const esquemaArquivo = z.object({
  produtoId: z.uuid(),
  tipo: z.enum(["catalogo_tecnico", "registro_anvisa", "outro"]),
  nome: z.string().trim().min(1).max(255),
  caminho: z.string().min(10).max(400),
  tamanho: z.number().int().min(1).max(20 * 1024 * 1024),
  tipoMime: z.enum(["application/pdf", "image/png", "image/jpeg"]),
});

/** Registra no banco um arquivo que o navegador acabou de enviar ao Storage. */
export async function registrarArquivo(
  entrada: z.input<typeof esquemaArquivo>,
): Promise<{ erro?: string }> {
  const usuario = await obterUsuario();
  const atual = await obterOrganizacao();
  if (!usuario || !atual) return { erro: SEM_EMPRESA };

  const dados = esquemaArquivo.safeParse(entrada);
  if (!dados.success) return { erro: "Arquivo inválido." };

  const prefixo = `${atual.org.id}/${dados.data.produtoId}/`;
  if (!dados.data.caminho.startsWith(prefixo) || dados.data.caminho.includes("..")) {
    return { erro: "Arquivo inválido." };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("produto_arquivos").insert({
    org_id: atual.org.id,
    produto_id: dados.data.produtoId,
    tipo: dados.data.tipo,
    nome: dados.data.nome,
    caminho: dados.data.caminho,
    tamanho: dados.data.tamanho,
    tipo_mime: dados.data.tipoMime,
    enviado_por: usuario.id,
  });
  if (error) {
    console.error("[catalogo] registrar arquivo:", error.code, error.message);
    await removerDoStorage([dados.data.caminho]);
    return { erro: "Não foi possível salvar o arquivo. Tente de novo em instantes." };
  }
  refresh();
  return {};
}

export async function excluirArquivo(formData: FormData): Promise<void> {
  const atual = await obterOrganizacao();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!atual || !id.success) return;

  const supabase = await criarClienteServidor();
  const { data: arquivo } = await supabase
    .from("produto_arquivos")
    .delete()
    .eq("id", id.data)
    .eq("org_id", atual.org.id)
    .select("caminho")
    .maybeSingle();
  if (arquivo) await removerDoStorage([arquivo.caminho]);
  refresh();
}
