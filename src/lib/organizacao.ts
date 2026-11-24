import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { exigirUsuario, obterUsuario } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/tipos";

export type Organizacao = Tables<"organizacoes">;

export type OrganizacaoAtual = {
  org: Organizacao;
  papel: "dono" | "membro";
  ehDono: boolean;
};

export const ROTULO_PORTE: Record<Organizacao["porte"], string> = {
  me_epp: "ME/EPP",
  demais: "Demais (médio ou grande porte)",
};

/** Organização do usuário logado (ou null se ainda não tem). Uma leitura por requisição. */
export const obterOrganizacao = cache(async (): Promise<OrganizacaoAtual | null> => {
  const usuario = await obterUsuario();
  if (!usuario) return null;

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("membros")
    .select("papel, org:organizacoes (*)")
    .eq("user_id", usuario.id)
    .maybeSingle();

  if (error) throw new Error(`Falha ao carregar a organização: ${error.message}`);
  if (!data?.org) return null;
  return { org: data.org, papel: data.papel, ehDono: data.papel === "dono" };
});

/**
 * Para as telas do app: exige login e organização.
 * Sem organização (ou com o onboarding do dono pela metade), manda para /onboarding.
 */
export async function exigirOrganizacao() {
  const usuario = await exigirUsuario();
  const atual = await obterOrganizacao();
  if (!atual) redirect("/onboarding");
  if (atual.ehDono && !atual.org.onboarding_concluido_em) redirect("/onboarding");
  return { usuario, ...atual };
}

/** Ids dos segmentos de interesse da organização. */
export async function listarSegmentosDaOrganizacao(orgId: string): Promise<string[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("organizacao_segmentos")
    .select("segmento_id")
    .eq("org_id", orgId);
  if (error) throw new Error(`Falha ao carregar os segmentos da organização: ${error.message}`);
  return data.map((linha) => linha.segmento_id);
}

/** Segmentos ativos, na ordem de exibição. */
export async function listarSegmentosAtivos() {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("segmentos")
    .select("id, nome, palavras_chave")
    .eq("ativo", true)
    .order("ordem")
    .order("nome");
  if (error) throw new Error(`Falha ao carregar os segmentos: ${error.message}`);
  return data;
}

/** Um segmento de interesse da empresa. A posição define a cor dele nas telas. */
export type SegmentoDeInteresse = { id: string; nome: string; posicao: number };

/**
 * Segmentos de interesse da empresa, na ordem da lista de segmentos. Como a cor vem da
 * posição, cada segmento tem a mesma cor em todas as telas e licitações.
 */
export async function listarSegmentosDeInteresse(orgId: string): Promise<SegmentoDeInteresse[]> {
  const [ativos, daEmpresa] = await Promise.all([listarSegmentosAtivos(), listarSegmentosDaOrganizacao(orgId)]);
  const escolhidos = new Set(daEmpresa);
  return ativos.filter((s) => escolhidos.has(s.id)).map((s, posicao) => ({ id: s.id, nome: s.nome, posicao }));
}
