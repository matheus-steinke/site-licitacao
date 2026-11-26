"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { EstadoFormulario } from "@/lib/estado-formulario";
import { obterUsuario } from "@/lib/auth";
import { enviarConvite, enviarEmailDeTeste } from "@/lib/email/app";
import { origemDoApp, prepararRevogacaoDoGoogle } from "@/lib/integracoes/app";
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

const limites = z
  .object({
    compativel: z.coerce.number().int().min(1).max(100),
    verificar: z.coerce.number().int().min(1).max(100),
  })
  .refine((v) => v.verificar <= v.compativel, {
    message: 'O limite de "verificar" não pode ser maior que o de "compatível".',
  });

/** Limites do score da triagem (só o responsável). */
export async function atualizarLimitesDaTriagem(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const valores = {
    compativel: String(formData.get("compativel") ?? ""),
    verificar: String(formData.get("verificar") ?? ""),
  };
  const dados = limites.safeParse(valores);
  if (!dados.success) {
    const mensagem = dados.error.issues[0]?.message ?? "";
    return {
      erro: mensagem.includes("verificar") ? mensagem : "Informe números inteiros de 1 a 100.",
      valores,
    };
  }
  const atual = await obterOrganizacao();
  if (!atual?.ehDono) return { erro: SEM_PERMISSAO, valores };

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("organizacoes")
    .update({ score_compativel: dados.data.compativel, score_verificar: dados.data.verificar })
    .eq("id", atual.org.id);
  if (error) {
    console.error("[configuracoes] limites da triagem:", error.message);
    return { erro: FALHA, valores };
  }
  refresh();
  return { mensagem: "Limites salvos. As oportunidades são recalculadas na próxima vez que você abrir a tela." };
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
  const link = `${await origemDoApp()}/cadastrar?email=${encodeURIComponent(email.data)}`;
  const { data: eu } = await supabase.from("membros").select("nome").eq("user_id", usuario.id).maybeSingle();
  const envio = await enviarConvite({
    empresa: atual.org.razao_social,
    convidadoPor: eu?.nome ?? usuario.nome ?? null,
    emailConvidado: email.data,
    link,
  });
  if (envio.enviado) {
    return {
      mensagem: `Convite enviado para ${email.data}. Se a pessoa não achar o e-mail, mande o link abaixo: ao se cadastrar (ou entrar) com esse e-mail, ela vê o convite.`,
      valores: { link },
    };
  }
  const porque =
    envio.motivo === "nao_configurado"
      ? "O envio de e-mails ainda não está configurado neste servidor."
      : `Não foi possível enviar o e-mail. ${envio.erro ?? ""}`.trim();
  return {
    mensagem: `Convite criado para ${email.data}. ${porque} Envie o link abaixo para a pessoa: ao se cadastrar (ou entrar) com esse e-mail, ela vê o convite.`,
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

// ---------------------------------------------------------------------------
// Notificações (e-mail diário)
// ---------------------------------------------------------------------------
const hora = z.coerce.number().int().min(0).max(23);

/**
 * O responsável liga ou desliga o e-mail diário da empresa e escolhe a hora; cada pessoa decide
 * se quer receber. Um formulário só: os campos da empresa são ignorados para quem não é o
 * responsável (e o banco também recusa).
 */
export async function atualizarNotificacoes(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const usuario = await obterUsuario();
  const atual = await obterOrganizacao();
  if (!usuario || !atual) return { erro: "Sua sessão expirou. Recarregue a página." };

  const supabase = await criarClienteServidor();
  if (atual.ehDono) {
    const horaEscolhida = hora.safeParse(formData.get("hora"));
    if (!horaEscolhida.success) return { erro: "Escolha a hora do envio." };
    const { error } = await supabase
      .from("organizacoes")
      .update({ email_diario: formData.get("ligado") === "on", email_diario_hora: horaEscolhida.data })
      .eq("id", atual.org.id);
    if (error) {
      console.error("[configuracoes] notificações da empresa:", error.message);
      return { erro: FALHA };
    }
  }
  const { error } = await supabase
    .from("membros")
    .update({ recebe_email_diario: formData.get("receber") === "on" })
    .eq("org_id", atual.org.id)
    .eq("user_id", usuario.id);
  if (error) {
    console.error("[configuracoes] preferência de e-mail:", error.message);
    return { erro: FALHA };
  }
  refresh();
  return { mensagem: "Notificações salvas." };
}

export type ResultadoSimples = { ok: true; mensagem: string } | { ok: false; erro: string };

/** Manda para quem clicou um e-mail diário montado com as oportunidades novas de agora. */
export async function enviarTesteDoEmailDiario(): Promise<ResultadoSimples> {
  const usuario = await obterUsuario();
  const atual = await obterOrganizacao();
  if (!usuario?.email || !atual) return { ok: false, erro: "Sua sessão expirou. Recarregue a página." };
  const envio = await enviarEmailDeTeste({
    orgId: atual.org.id,
    empresa: atual.org.razao_social,
    para: usuario.email,
    site: await origemDoApp(),
  });
  if (envio.enviado) return { ok: true, mensagem: `E-mail de teste enviado para ${usuario.email}. Confira também a caixa de spam.` };
  if (envio.motivo === "nao_configurado") return { ok: false, erro: "O envio de e-mails ainda não está configurado neste servidor." };
  return { ok: false, erro: envio.erro ?? FALHA };
}

// ---------------------------------------------------------------------------
// Excluir a conta (LGPD)
// ---------------------------------------------------------------------------
const BUCKET_DOS_PRODUTOS = "produtos";

/** Apaga do Storage os arquivos da empresa: os do cadastro e o que mais houver na pasta dela. */
async function apagarArquivosDaEmpresa(orgId: string): Promise<void> {
  const supabase = await criarClienteServidor();
  const bucket = supabase.storage.from(BUCKET_DOS_PRODUTOS);
  const caminhos = new Set<string>();

  const { data: cadastrados } = await supabase.from("produto_arquivos").select("caminho").eq("org_id", orgId);
  for (const arquivo of cadastrados ?? []) caminhos.add(arquivo.caminho);

  // A pasta da empresa tem uma subpasta por produto.
  const { data: pastas } = await bucket.list(orgId, { limit: 1000 });
  for (let i = 0; i < (pastas ?? []).length; i += 10) {
    const grupo = (pastas ?? []).slice(i, i + 10);
    const listas = await Promise.all(grupo.map((pasta) => bucket.list(`${orgId}/${pasta.name}`, { limit: 1000 })));
    listas.forEach((lista, posicao) => {
      for (const arquivo of lista.data ?? []) caminhos.add(`${orgId}/${grupo[posicao].name}/${arquivo.name}`);
    });
  }

  const todos = [...caminhos];
  for (let i = 0; i < todos.length; i += 100) {
    const { error } = await bucket.remove(todos.slice(i, i + 100));
    if (error) console.error("[configuracoes] excluir conta, storage:", error.message);
  }
}

/**
 * Exclui a conta de quem está logado. O responsável leva junto a empresa e tudo o que é dela;
 * um membro comum só sai e tem o próprio login apagado. Não há como desfazer.
 */
export async function excluirConta(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const usuario = await obterUsuario();
  if (!usuario) return { erro: "Sua sessão expirou. Recarregue a página." };
  if (String(formData.get("confirmacao") ?? "").trim() !== "EXCLUIR") {
    return { erro: "Para confirmar, digite EXCLUIR (em maiúsculas)." };
  }

  const atual = await obterOrganizacao();
  let revogarGoogle = async () => {};
  if (atual?.ehDono) {
    revogarGoogle = await prepararRevogacaoDoGoogle(atual.org.id);
    await apagarArquivosDaEmpresa(atual.org.id);
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("excluir_conta", { p_confirmacao: "EXCLUIR" });
  if (error) {
    console.error("[configuracoes] excluir conta:", error.code, error.message);
    return { erro: "Não foi possível excluir a conta agora. Tente de novo em instantes." };
  }
  await revogarGoogle();
  // O login já não existe: só falta limpar os cookies da sessão neste navegador.
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  redirect("/entrar?aviso=conta-excluida");
}
