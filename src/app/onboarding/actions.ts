"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import type { EstadoFormulario } from "@/lib/estado-formulario";
import { obterOrganizacao } from "@/lib/organizacao";
import {
  salvarEmpresa,
  salvarSegmentos,
  salvarUfs,
  valoresEmpresa,
} from "@/lib/organizacao-acoes";
import { criarClienteServidor } from "@/lib/supabase/server";

export async function passoEmpresa(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const resultado = await salvarEmpresa(formData);
  if (resultado.erro) return { erro: resultado.erro, valores: valoresEmpresa(formData) };
  redirect("/onboarding?passo=ufs");
}

export async function passoUfs(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const resultado = await salvarUfs(formData);
  if (resultado.erro) return { erro: resultado.erro };
  redirect("/onboarding?passo=segmentos");
}

export async function passoSegmentos(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const resultado = await salvarSegmentos(formData);
  if (resultado.erro) return { erro: resultado.erro };
  redirect("/onboarding?passo=tabela");
}

export async function concluirOnboarding(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  // "Pular e fazer depois" envia destino=pular; o botão principal leva à importação.
  const destino = formData.get("destino") === "pular" ? "/oportunidades" : "/catalogo/importar";
  const atual = await obterOrganizacao();
  if (!atual) redirect("/onboarding");
  if (atual.ehDono && !atual.org.onboarding_concluido_em) {
    const supabase = await criarClienteServidor();
    const { error } = await supabase
      .from("organizacoes")
      .update({ onboarding_concluido_em: new Date().toISOString() })
      .eq("id", atual.org.id);
    if (error) {
      console.error("[onboarding] concluir:", error.code, error.message);
      return { erro: "Não foi possível concluir. Tente de novo em instantes." };
    }
  }
  redirect(destino);
}

export async function aceitarConvite(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const convite = z.uuid().safeParse(formData.get("convite"));
  if (!convite.success) return { erro: "Convite inválido." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("aceitar_convite", { p_convite: convite.data });
  if (error) {
    if (error.message.includes("EMAIL_NAO_CONFIRMADO")) {
      return { erro: "Confirme seu e-mail antes de aceitar o convite." };
    }
    if (error.message.includes("JA_TEM_ORGANIZACAO")) {
      return { erro: "Você já faz parte de uma empresa." };
    }
    if (error.message.includes("CONVITE_INVALIDO")) {
      return { erro: "Este convite expirou ou foi cancelado. Peça um novo ao responsável." };
    }
    console.error("[onboarding] aceitar convite:", error.code, error.message);
    return { erro: "Não foi possível aceitar o convite. Tente de novo em instantes." };
  }
  redirect("/oportunidades");
}
