"use server";

import { randomBytes } from "node:crypto";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { EstadoFormulario } from "@/lib/estado-formulario";
import {
  COOKIE_DO_ESTADO,
  origemDoApp,
  resumirSincronizacao,
  RETORNO_DO_GOOGLE,
  sincronizarPeloBotao,
} from "@/lib/integracoes/app";
import { decifrar } from "@/lib/integracoes/cifra";
import { credenciaisDoGoogle, segredoDaCifra } from "@/lib/integracoes/configuracao";
import { renovarAcesso, revogar, urlDeAutorizacao } from "@/lib/integracoes/google/oauth";
import { criarServicoGoogle } from "@/lib/integracoes/google/servico";
import { obterOrganizacao } from "@/lib/organizacao";
import { criarClienteServidor } from "@/lib/supabase/server";

const SEM_PERMISSAO = "Só o responsável pela empresa pode fazer isso.";
const SEM_EMPRESA = "Sua sessão expirou ou você não faz parte de uma empresa. Recarregue a página.";
const FALHA = "Não foi possível concluir. Tente de novo em instantes.";

/** Leva o responsável pela empresa à tela de consentimento do Google. */
export async function conectarGoogle(): Promise<void> {
  const atual = await obterOrganizacao();
  const app = credenciaisDoGoogle();
  if (!atual?.ehDono) redirect("/integracoes?erro=permissao");
  if (!app) redirect("/integracoes?erro=configuracao");

  const estado = randomBytes(24).toString("base64url");
  const origem = await origemDoApp();
  (await cookies()).set(COOKIE_DO_ESTADO, `${estado}.${atual.org.id}`, {
    httpOnly: true,
    secure: origem.startsWith("https://"),
    sameSite: "lax",
    maxAge: 600,
    path: "/integracoes",
  });
  redirect(urlDeAutorizacao(app.clientId, `${origem}${RETORNO_DO_GOOGLE}`, estado));
}

const preferencias = z.object({
  agenda_ativa: z.boolean(),
  agenda_id: z.string().trim().max(250),
  drive_ativo: z.boolean(),
  pasta_raiz_nome: z.string().trim().min(1).max(100),
  automatico: z.boolean(),
});

/** Preferências da integração com o Google (só o responsável). */
export async function salvarPreferenciasDoGoogle(_anterior: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const dados = preferencias.safeParse({
    agenda_ativa: formData.get("agenda_ativa") === "on",
    agenda_id: String(formData.get("agenda_id") ?? ""),
    drive_ativo: formData.get("drive_ativo") === "on",
    pasta_raiz_nome: String(formData.get("pasta_raiz_nome") ?? ""),
    automatico: formData.get("automatico") === "on",
  });
  if (!dados.success) return { erro: "Informe o nome da pasta principal (até 100 letras)." };
  const atual = await obterOrganizacao();
  if (!atual?.ehDono) return { erro: SEM_PERMISSAO };

  const supabase = await criarClienteServidor();
  const { data: antes } = await supabase
    .from("integracoes")
    .select("credenciais, pasta_raiz_id, pasta_raiz_nome")
    .eq("org_id", atual.org.id)
    .eq("provedor", "google")
    .maybeSingle();
  const { error } = await supabase.rpc("integracao_configurar", {
    p_org: atual.org.id,
    p_provedor: "google",
    p_agenda_ativa: dados.data.agenda_ativa,
    p_agenda_id: dados.data.agenda_id,
    p_drive_ativo: dados.data.drive_ativo,
    p_pasta_raiz_nome: dados.data.pasta_raiz_nome,
    p_automatico: dados.data.automatico,
  });
  if (error) {
    console.error("[integracoes] preferências:", error.message);
    return { erro: FALHA };
  }

  // A pasta principal já existe no Drive e o nome mudou: renomeia lá também.
  let aviso = "";
  const app = credenciaisDoGoogle();
  if (app && antes?.pasta_raiz_id && antes.pasta_raiz_nome !== dados.data.pasta_raiz_nome) {
    try {
      const acesso = await renovarAcesso(app, decifrar(antes.credenciais, segredoDaCifra(app)));
      await criarServicoGoogle(acesso).renomear(antes.pasta_raiz_id, dados.data.pasta_raiz_nome);
    } catch (erro) {
      console.error("[integracoes] renomear a pasta:", erro instanceof Error ? erro.message : erro);
      aviso = " Não consegui renomear a pasta que já existe no Drive; renomeie por lá, se quiser.";
    }
  }
  refresh();
  return { mensagem: `Preferências salvas.${aviso}` };
}

export type ResultadoSimples = { ok: true; mensagem: string } | { ok: false; erro: string };

/** Apaga as credenciais e pede ao Google para invalidar o acesso. Eventos e pastas ficam. */
export async function desconectarGoogle(): Promise<ResultadoSimples> {
  const atual = await obterOrganizacao();
  if (!atual?.ehDono) return { ok: false, erro: SEM_PERMISSAO };

  const supabase = await criarClienteServidor();
  const { data: integracao } = await supabase
    .from("integracoes")
    .select("credenciais")
    .eq("org_id", atual.org.id)
    .eq("provedor", "google")
    .maybeSingle();
  const { error } = await supabase.rpc("integracao_desconectar", { p_org: atual.org.id, p_provedor: "google" });
  if (error) {
    console.error("[integracoes] desconectar:", error.message);
    return { ok: false, erro: FALHA };
  }
  const app = credenciaisDoGoogle();
  if (app && integracao) {
    try {
      await revogar(decifrar(integracao.credenciais, segredoDaCifra(app)));
    } catch {
      // Credenciais ilegíveis: não há o que revogar.
    }
  }
  refresh();
  return { ok: true, mensagem: "Google desconectado. Os eventos e as pastas já criados continuam na sua conta." };
}

const idDaOportunidade = z.uuid();

/** Botão "Sincronizar" da página da oportunidade: cria ou atualiza o evento, as pastas e os arquivos. */
export async function sincronizarComGoogle(oportunidadeId: string): Promise<ResultadoSimples> {
  const id = idDaOportunidade.safeParse(oportunidadeId);
  if (!id.success) return { ok: false, erro: "Dados inválidos. Recarregue a página e tente de novo." };
  const atual = await obterOrganizacao();
  if (!atual) return { ok: false, erro: SEM_EMPRESA };
  try {
    const r = await sincronizarPeloBotao(atual.org.id, id.data);
    refresh();
    if (!r) return { ok: false, erro: "A integração com o Google não está configurada neste servidor." };
    const resumo = resumirSincronizacao(r);
    if (resumo?.falhou) return { ok: false, erro: resumo.texto };
    return { ok: true, mensagem: resumo?.texto ?? "Já estava tudo em dia no Google." };
  } catch (erro) {
    console.error("[integracoes] sincronizar pelo botão:", erro instanceof Error ? erro.message : erro);
    return { ok: false, erro: "Não foi possível falar com o Google agora. Tente de novo em instantes." };
  }
}
