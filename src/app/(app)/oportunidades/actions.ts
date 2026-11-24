"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { obterOrganizacao } from "@/lib/organizacao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { triarLote } from "@/lib/triagem/executar";

const SEM_EMPRESA = "Sua sessão expirou ou você não faz parte de uma empresa. Recarregue a página.";

export type ResultadoDaDecisao = { ok: true } | { ok: false; erro: string };

const decisao = z.object({
  id: z.uuid(),
  status: z.enum(["nova", "aprovada", "descartada", "ganha", "perdida"]),
  motivo: z.string().trim().max(500).optional(),
});

/** Aprovar, descartar (com motivo), reabrir ou marcar como ganha/perdida. */
export async function decidirOportunidade(entrada: {
  id: string;
  status: "nova" | "aprovada" | "descartada" | "ganha" | "perdida";
  motivo?: string;
}): Promise<ResultadoDaDecisao> {
  const dados = decisao.safeParse(entrada);
  if (!dados.success) return { ok: false, erro: "Dados inválidos. Recarregue a página e tente de novo." };
  if (dados.data.status === "descartada" && (dados.data.motivo ?? "").length < 2) {
    return { ok: false, erro: "Informe o motivo do descarte." };
  }
  const atual = await obterOrganizacao();
  if (!atual) return { ok: false, erro: SEM_EMPRESA };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("decidir_oportunidade", {
    p_oportunidade: dados.data.id,
    p_status: dados.data.status,
    p_motivo: dados.data.motivo,
  });
  if (error) {
    // As mensagens da função do banco já são para o usuário ("A disputa ainda não aconteceu.").
    const conhecida = /motivo|aprovada|ainda não aconteceu|não encontrada/i.test(error.message);
    if (!conhecida) console.error("[oportunidades] decidir:", error.message);
    return { ok: false, erro: conhecida ? error.message : "Não foi possível salvar. Tente de novo em instantes." };
  }
  refresh();
  return { ok: true };
}

export type AndamentoDaTriagem =
  | { ok: true; feitas: number; restantes: number }
  | { ok: false; erro: string };

/**
 * Compara mais um lote de licitações com o catálogo da empresa. A tela chama de novo enquanto
 * houver pendentes, para mostrar o andamento e nunca passar do tempo de uma requisição.
 */
export async function atualizarTriagem(): Promise<AndamentoDaTriagem> {
  const atual = await obterOrganizacao();
  if (!atual) return { ok: false, erro: SEM_EMPRESA };
  try {
    const supabase = await criarClienteServidor();
    const lote = await triarLote(supabase, atual.org.id, { maxCompras: 60, maxItens: 5000 });
    return { ok: true, feitas: lote.feitas, restantes: lote.refazer ? Math.max(lote.restantes, 1) : lote.restantes };
  } catch (erro) {
    console.error("[oportunidades] triagem:", erro instanceof Error ? erro.message : erro);
    return { ok: false, erro: "Não foi possível atualizar a triagem agora. Tente de novo em instantes." };
  }
}
