"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import type { EstadoFormulario } from "@/lib/estado-formulario";
import { obterUsuario } from "@/lib/auth";
import { obterOrganizacao } from "@/lib/organizacao";
import {
  salvarEmpresa,
  salvarSegmentos,
  salvarUfs,
  valoresEmpresa,
} from "@/lib/organizacao-acoes";
import { criarClienteServidor } from "@/lib/supabase/server";

const SEM_PERMISSAO = "Só o responsável pela empresa pode fazer isso.";
const FALHA = "Não foi possível concluir. Tente de novo em instantes.";

export async function atualizarEmpresa(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const resultado = await salvarEmpresa(formData);
  if (resultado.erro) return { erro: resultado.erro, valores: valoresEmpresa(formData) };
  refresh();
  return { mensagem: "Dados da empresa salvos." };
}

export async function atualizarUfs(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const resultado = await salvarUfs(formData);
  if (resultado.erro) return { erro: resultado.erro };
  refresh();
  return { mensagem: "Estados atendidos salvos." };
}

export async function atualizarSegmentos(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const resultado = await salvarSegmentos(formData);
  if (resultado.erro) return { erro: resultado.erro };
  refresh();
  return { mensagem: "Segmentos de interesse salvos." };
}

async function origem(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  }
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const protocolo =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocolo}://${host}`;
}

export async function convidar(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const bruto = formData.get("email");
  const valores = { email: typeof bruto === "string" ? bruto : "" };
  const email = z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Informe um e-mail válido."))
    .safeParse(valores.email);
  if (!email.success) return { erro: email.error.issues[0]?.message ?? FALHA, valores };

  const usuario = await obterUsuario();
  const atual = await obterOrganizacao();
  if (!usuario || !atual?.ehDono) return { erro: SEM_PERMISSAO, valores };

  const supabase = await criarClienteServidor();
  const { data: jaMembro } = await supabase
    .from("membros")
    .select("user_id")
    .eq("org_id", atual.org.id)
    .eq("email", email.data)
    .maybeSingle();
  if (jaMembro) return { erro: "Esta pessoa já faz parte da empresa.", valores };

  // Convite antigo (expirado ou já usado) para o mesmo e-mail é substituído.
  await supabase.from("convites").delete().eq("org_id", atual.org.id).eq("email", email.data);
  const { error } = await supabase
    .from("convites")
    .insert({ org_id: atual.org.id, email: email.data, convidado_por: usuario.id });
  if (error) {
    console.error("[configuracoes] convidar:", error.code, error.message);
    return { erro: FALHA, valores };
  }

  refresh();
  const link = `${await origem()}/cadastrar?email=${encodeURIComponent(email.data)}`;
  return {
    mensagem: `Convite criado para ${email.data}. Envie o link abaixo para a pessoa: ao se cadastrar (ou entrar) com esse e-mail, ela vê o convite.`,
    valores: { link },
  };
}

export async function cancelarConvite(formData: FormData): Promise<void> {
  const id = z.uuid().safeParse(formData.get("convite"));
  const atual = await obterOrganizacao();
  if (!id.success || !atual?.ehDono) return;

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("convites")
    .delete()
    .eq("id", id.data)
    .eq("org_id", atual.org.id);
  if (error) console.error("[configuracoes] cancelar convite:", error.code, error.message);
  refresh();
}

export async function removerMembro(formData: FormData): Promise<void> {
  const id = z.uuid().safeParse(formData.get("usuario"));
  const atual = await obterOrganizacao();
  if (!id.success || !atual?.ehDono) return;

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("membros")
    .delete()
    .eq("org_id", atual.org.id)
    .eq("user_id", id.data);
  if (error) console.error("[configuracoes] remover membro:", error.code, error.message);
  refresh();
}
