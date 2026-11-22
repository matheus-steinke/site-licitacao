import "server-only";

import { z } from "zod";

import { cnpjValido, normalizarCnpj } from "@/lib/cnpj";
import { obterOrganizacao } from "@/lib/organizacao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { limparUfs } from "@/lib/ufs";

// Regras de gravação da organização, usadas pelo onboarding e pelas Configurações.
// Cada função devolve { erro } quando algo impede a gravação.

export type Resultado = { erro?: string };

const SEM_PERMISSAO = "Só o responsável pela empresa pode alterar estes dados.";
const FALHA = "Não foi possível salvar. Tente de novo em instantes.";

function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor : "";
}

const esquemaEmpresa = z.object({
  razao_social: z
    .string()
    .trim()
    .min(2, "Informe a razão social.")
    .max(200, "A razão social pode ter no máximo 200 caracteres."),
  cnpj: z
    .string()
    .transform(normalizarCnpj)
    .refine(cnpjValido, "CNPJ inválido. Confira os números."),
  porte: z.enum(["me_epp", "demais"], { error: "Selecione o porte da empresa." }),
});

export function valoresEmpresa(formData: FormData): Record<string, string> {
  return {
    razao_social: texto(formData, "razao_social"),
    cnpj: texto(formData, "cnpj"),
    porte: texto(formData, "porte"),
  };
}

/** Cria a organização (primeiro acesso) ou atualiza os dados dela (dono). */
export async function salvarEmpresa(formData: FormData): Promise<Resultado> {
  const dados = esquemaEmpresa.safeParse(valoresEmpresa(formData));
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? FALHA };

  const supabase = await criarClienteServidor();
  const atual = await obterOrganizacao();

  if (!atual) {
    const { error } = await supabase.rpc("criar_organizacao", {
      p_razao_social: dados.data.razao_social,
      p_cnpj: dados.data.cnpj,
      p_porte: dados.data.porte,
    });
    if (!error) return {};
    if (error.message.includes("CNPJ_JA_CADASTRADO")) {
      return {
        erro: "Este CNPJ já está cadastrado. Peça ao responsável pela empresa um convite para o seu e-mail.",
      };
    }
    if (error.message.includes("JA_TEM_ORGANIZACAO")) {
      return { erro: "Você já faz parte de uma empresa. Recarregue a página." };
    }
    console.error("[organizacao] criar:", error.code, error.message);
    return { erro: FALHA };
  }

  if (!atual.ehDono) return { erro: SEM_PERMISSAO };

  const { error } = await supabase
    .from("organizacoes")
    .update(dados.data)
    .eq("id", atual.org.id);
  if (!error) return {};
  if (error.code === "23505") return { erro: "Este CNPJ já está cadastrado em outra empresa." };
  console.error("[organizacao] atualizar:", error.code, error.message);
  return { erro: FALHA };
}

/** Grava os estados atendidos (pelo menos um). */
export async function salvarUfs(formData: FormData): Promise<Resultado> {
  const ufs = limparUfs(formData.getAll("ufs"));
  if (ufs.length === 0) return { erro: "Selecione pelo menos um estado." };

  const atual = await obterOrganizacao();
  if (!atual?.ehDono) return { erro: SEM_PERMISSAO };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("organizacoes").update({ ufs }).eq("id", atual.org.id);
  if (!error) return {};
  console.error("[organizacao] ufs:", error.code, error.message);
  return { erro: FALHA };
}

/** Grava os segmentos de interesse (pelo menos um). */
export async function salvarSegmentos(formData: FormData): Promise<Resultado> {
  const ids = z.array(z.uuid()).safeParse([...new Set(formData.getAll("segmentos"))]);
  if (!ids.success || ids.data.length === 0) {
    return { erro: "Selecione pelo menos um segmento." };
  }

  const atual = await obterOrganizacao();
  if (!atual?.ehDono) return { erro: SEM_PERMISSAO };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("definir_segmentos_organizacao", {
    p_org: atual.org.id,
    p_segmentos: ids.data,
  });
  if (!error) return {};
  console.error("[organizacao] segmentos:", error.code, error.message);
  return { erro: FALHA };
}
