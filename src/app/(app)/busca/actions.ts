"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { lerFiltros, paraSalvar } from "@/lib/busca/filtros";
import { hojeEmBrasilia, MAXIMO_DE_BUSCAS_SALVAS } from "@/lib/dados/busca";
import { obterOrganizacao } from "@/lib/organizacao";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/tipos";

const SEM_EMPRESA = "Sua sessão expirou ou você não faz parte de uma empresa. Recarregue a página.";
const FALHA = "Não foi possível salvar. Tente de novo em instantes.";

export type ResultadoDaAcao = { ok: true } | { ok: false; erro: string };

/** Salva os filtros atuais da Busca com um nome. "consulta" é a parte do endereço depois de "?". */
export async function salvarBusca(entrada: { nome: string; consulta: string }): Promise<ResultadoDaAcao> {
  const nome = z.string().trim().min(1).max(80).safeParse(entrada.nome.replace(/\s+/g, " "));
  if (!nome.success) return { ok: false, erro: "Dê um nome de até 80 caracteres para a busca." };
  if (typeof entrada.consulta !== "string" || entrada.consulta.length > 3000) return { ok: false, erro: FALHA };

  const atual = await obterOrganizacao();
  if (!atual) return { ok: false, erro: SEM_EMPRESA };

  const parametros = new URLSearchParams(entrada.consulta);
  const filtros = lerFiltros(
    Object.fromEntries([...new Set(parametros.keys())].map((chave) => [chave, parametros.getAll(chave)])),
    { ufs: atual.org.ufs, hoje: hojeEmBrasilia() },
  );

  const supabase = await criarClienteServidor();
  const { count, error: erroContagem } = await supabase
    .from("buscas_salvas")
    .select("id", { count: "exact", head: true })
    .eq("org_id", atual.org.id);
  if (erroContagem) return { ok: false, erro: FALHA };
  if ((count ?? 0) >= MAXIMO_DE_BUSCAS_SALVAS) {
    return { ok: false, erro: `Sua empresa já tem ${MAXIMO_DE_BUSCAS_SALVAS} buscas salvas. Exclua alguma para salvar outra.` };
  }

  const { error } = await supabase
    .from("buscas_salvas")
    .insert({ org_id: atual.org.id, nome: nome.data, filtros: paraSalvar(filtros) as Json });
  if (error) {
    if (error.code === "23505") return { ok: false, erro: "Já existe uma busca salva com esse nome." };
    console.error("[busca] salvar:", error.message);
    return { ok: false, erro: FALHA };
  }
  refresh();
  return { ok: true };
}

export async function excluirBusca(id: string): Promise<ResultadoDaAcao> {
  const idValido = z.uuid().safeParse(id);
  if (!idValido.success) return { ok: false, erro: FALHA };
  const atual = await obterOrganizacao();
  if (!atual) return { ok: false, erro: SEM_EMPRESA };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("buscas_salvas").delete().eq("id", idValido.data).eq("org_id", atual.org.id);
  if (error) {
    console.error("[busca] excluir:", error.message);
    return { ok: false, erro: "Não foi possível excluir. Tente de novo em instantes." };
  }
  refresh();
  return { ok: true };
}
