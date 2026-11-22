import "server-only";

import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { criarClienteServidor } from "@/lib/supabase/server";

export type Usuario = {
  id: string;
  email: string;
  nome: string;
};

/** Usuário logado (ou null). Uma leitura por requisição. */
export const obterUsuario = cache(async (): Promise<Usuario | null> => {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;

  const metadados = (claims.user_metadata ?? {}) as Record<string, unknown>;
  const email = typeof claims.email === "string" ? claims.email : "";
  const nome =
    [metadados.nome, metadados.full_name, metadados.name].find(
      (v): v is string => typeof v === "string" && v.trim() !== "",
    ) ?? email.split("@")[0];

  return { id: claims.sub, email, nome };
});

/** Usuário logado; redireciona para o login se não houver sessão. */
export async function exigirUsuario(): Promise<Usuario> {
  const usuario = await obterUsuario();
  if (!usuario) redirect("/entrar");
  return usuario;
}

/** true se o usuário logado é admin da plataforma (RLS só devolve a própria linha). */
export const ehAdminPlataforma = cache(async (): Promise<boolean> => {
  const usuario = await obterUsuario();
  if (!usuario) return false;
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("admins_plataforma")
    .select("user_id")
    .eq("user_id", usuario.id)
    .maybeSingle();
  return Boolean(data);
});

/**
 * Para o painel ADMIN: exige login e admin da plataforma.
 * Quem não é admin recebe "página não encontrada", sem saber que o painel existe.
 */
export async function exigirAdmin(): Promise<Usuario> {
  const usuario = await exigirUsuario();
  if (!(await ehAdminPlataforma())) notFound();
  return usuario;
}
