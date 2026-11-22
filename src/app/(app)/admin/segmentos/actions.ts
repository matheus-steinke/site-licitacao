"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ehAdminPlataforma } from "@/lib/auth";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import { criarClienteServidor } from "@/lib/supabase/server";
import { gerarSlug, lerTermos } from "@/lib/termos";

const FALHA = "Não foi possível salvar. Tente de novo em instantes.";

function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor : "";
}

export async function salvarSegmento(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  if (!(await ehAdminPlataforma())) return { erro: "Sem permissão." };

  const id = z.uuid().safeParse(formData.get("id"));
  const dados = z
    .object({
      nome: z.string().trim().min(2, "Informe o nome do segmento.").max(120),
      ordem: z.coerce.number().int("A ordem precisa ser um número inteiro.").min(0).max(100000),
    })
    .safeParse({ nome: texto(formData, "nome"), ordem: texto(formData, "ordem") || "0" });
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? FALHA };

  const ativo = formData.get("ativo") === "on";
  const palavras_chave = lerTermos(texto(formData, "palavras_chave"));
  const sinonimos = lerTermos(texto(formData, "sinonimos"));
  const exclusoes = lerTermos(texto(formData, "exclusoes"));
  if (ativo && palavras_chave.length === 0) {
    return { erro: "Um segmento ativo precisa de pelo menos uma palavra-chave." };
  }

  const registro = { ...dados.data, ativo, palavras_chave, sinonimos, exclusoes };
  const supabase = await criarClienteServidor();

  if (id.success) {
    const { error } = await supabase.from("segmentos").update(registro).eq("id", id.data);
    if (error) {
      console.error("[admin] atualizar segmento:", error.code, error.message);
      return { erro: FALHA };
    }
    refresh();
    return { mensagem: "Segmento salvo." };
  }

  const slug = gerarSlug(dados.data.nome);
  if (!slug) return { erro: "O nome precisa ter letras ou números." };
  const { error } = await supabase.from("segmentos").insert({ ...registro, slug });
  if (error) {
    if (error.code === "23505") return { erro: "Já existe um segmento com esse nome." };
    console.error("[admin] criar segmento:", error.code, error.message);
    return { erro: FALHA };
  }
  redirect("/admin/segmentos");
}

export async function excluirSegmento(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  if (!(await ehAdminPlataforma())) return { erro: "Sem permissão." };
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { erro: "Segmento inválido." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("segmentos").delete().eq("id", id.data);
  if (error) {
    if (error.code === "23503") {
      return {
        erro: "Este segmento está em uso por organizações. Desmarque “Ativo” em vez de excluir.",
      };
    }
    console.error("[admin] excluir segmento:", error.code, error.message);
    return { erro: "Não foi possível excluir. Tente de novo em instantes." };
  }
  redirect("/admin/segmentos");
}
