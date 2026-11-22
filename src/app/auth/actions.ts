"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { caminhoSeguro } from "@/lib/caminho";
import { criarClienteServidor } from "@/lib/supabase/server";

export type EstadoFormulario = {
  erro?: string;
  mensagem?: string;
  /** Valores a devolver ao formulário quando há erro. */
  valores?: Record<string, string>;
};

const email = z.string().trim().toLowerCase().pipe(z.email("Informe um e-mail válido."));
const senhaNova = z
  .string()
  .min(8, "A senha precisa ter pelo menos 8 caracteres.")
  .max(72, "A senha pode ter no máximo 72 caracteres.");

function primeiroErro(erro: z.ZodError): string {
  return erro.issues[0]?.message ?? "Confira os campos e tente de novo.";
}

function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor : "";
}

/** Endereço público do app, para montar os links enviados por e-mail. */
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

function traduzirErro(erro: { code?: string; message?: string }): string {
  switch (erro.code) {
    case "invalid_credentials":
      return "E-mail ou senha incorretos.";
    case "email_not_confirmed":
      return "Confirme seu e-mail antes de entrar. Procure o link que enviamos para sua caixa de entrada.";
    case "user_already_exists":
    case "email_exists":
      return "Já existe uma conta com este e-mail. Entre ou recupere a senha.";
    case "weak_password":
      return "Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.";
    case "same_password":
      return "A nova senha precisa ser diferente da atual.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.";
    case "email_address_invalid":
      return "Este e-mail não é aceito. Confira o endereço.";
    case "signup_disabled":
      return "O cadastro está desativado no momento.";
    case "provider_disabled":
    case "validation_failed":
      return "O login com Google ainda não foi configurado. Use e-mail e senha.";
    default:
      // Erro não previsto: fica registrado no log do servidor para diagnóstico.
      console.error("[auth] erro não mapeado:", erro.code, erro.message);
      return "Não foi possível concluir. Tente de novo em instantes.";
  }
}

export async function entrar(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const dados = z
    .object({ email, senha: z.string().min(1, "Informe a senha.") })
    .safeParse({ email: texto(formData, "email"), senha: texto(formData, "senha") });
  const valores = { email: texto(formData, "email") };
  if (!dados.success) return { erro: primeiroErro(dados.error), valores };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({
    email: dados.data.email,
    password: dados.data.senha,
  });
  if (error) return { erro: traduzirErro(error), valores };

  redirect(caminhoSeguro(formData.get("proximo")));
}

export async function cadastrar(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const valores = { nome: texto(formData, "nome"), email: texto(formData, "email") };
  const dados = z
    .object({
      nome: z.string().trim().min(2, "Informe seu nome.").max(120),
      email,
      senha: senhaNova,
      aceite: z.literal("on", {
        error: "Para criar a conta é preciso aceitar os Termos de Uso e a Política de Privacidade.",
      }),
    })
    .safeParse({
      ...valores,
      senha: texto(formData, "senha"),
      aceite: texto(formData, "aceite"),
    });
  if (!dados.success) return { erro: primeiroErro(dados.error), valores };

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.auth.signUp({
    email: dados.data.email,
    password: dados.data.senha,
    options: {
      emailRedirectTo: `${await origem()}/auth/callback?next=/oportunidades`,
      data: { nome: dados.data.nome, aceite_termos_em: new Date().toISOString() },
    },
  });
  if (error) return { erro: traduzirErro(error), valores };

  // Com confirmação de e-mail desligada no Supabase, a sessão já vem pronta.
  if (data.session) redirect("/oportunidades");

  return {
    mensagem: `Enviamos um link de confirmação para ${dados.data.email}. Abra o e-mail e clique no link para ativar a conta.`,
  };
}

export async function entrarComGoogle(formData: FormData): Promise<void> {
  const proximo = caminhoSeguro(formData.get("proximo"));
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${await origem()}/auth/callback?next=${encodeURIComponent(proximo)}`,
    },
  });
  if (error || !data.url) redirect("/entrar?aviso=google");
  redirect(data.url);
}

export async function recuperarSenha(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const valores = { email: texto(formData, "email") };
  const dados = email.safeParse(valores.email);
  if (!dados.success) return { erro: primeiroErro(dados.error), valores };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.resetPasswordForEmail(dados.data, {
    redirectTo: `${await origem()}/auth/callback?next=/redefinir-senha`,
  });
  if (error?.code?.startsWith("over_")) return { erro: traduzirErro(error), valores };

  // Mesma resposta exista ou não a conta, para não revelar quem é cliente.
  return {
    mensagem: `Se existir uma conta com ${dados.data}, enviamos um link para criar uma nova senha.`,
  };
}

export async function redefinirSenha(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const dados = senhaNova.safeParse(texto(formData, "senha"));
  if (!dados.success) return { erro: primeiroErro(dados.error) };
  if (texto(formData, "confirmacao") !== dados.data) {
    return { erro: "As duas senhas não são iguais." };
  }

  const supabase = await criarClienteServidor();
  const { data: sessao } = await supabase.auth.getClaims();
  if (!sessao?.claims) {
    return { erro: "O link expirou. Peça um novo em “Esqueci minha senha”." };
  }
  const { error } = await supabase.auth.updateUser({ password: dados.data });
  if (error) return { erro: traduzirErro(error) };

  redirect("/oportunidades");
}

export async function sair(): Promise<void> {
  const supabase = await criarClienteServidor();
  await supabase.auth.signOut();
  redirect("/entrar");
}
