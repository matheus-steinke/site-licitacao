import { NextResponse, type NextRequest } from "next/server";

import { COOKIE_DO_ESTADO, origemDoApp, RETORNO_DO_GOOGLE } from "@/lib/integracoes/app";
import { cifrar } from "@/lib/integracoes/cifra";
import { credenciaisDoGoogle, segredoDaCifra } from "@/lib/integracoes/configuracao";
import { trocarCodigo } from "@/lib/integracoes/google/oauth";
import { obterOrganizacao } from "@/lib/organizacao";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Volta do Google depois do consentimento. Confere o "estado" (para garantir que o pedido saiu
 * deste navegador e desta empresa), troca o código pelo token de atualização, cifra e grava.
 */
export async function GET(request: NextRequest) {
  const origem = await origemDoApp();
  const voltar = (parametro: string) => {
    const resposta = NextResponse.redirect(`${origem}/integracoes?${parametro}`);
    resposta.cookies.set(COOKIE_DO_ESTADO, "", { maxAge: 0, path: "/integracoes" });
    return resposta;
  };

  const { searchParams } = new URL(request.url);
  // O usuário clicou em "Cancelar" na tela do Google.
  if (searchParams.get("error")) return voltar("erro=cancelado");

  const codigo = searchParams.get("code");
  const estado = searchParams.get("state");
  const [estadoGuardado, orgGuardada] = (request.cookies.get(COOKIE_DO_ESTADO)?.value ?? "").split(".");
  if (!codigo || !estado || !estadoGuardado || estado !== estadoGuardado) return voltar("erro=estado");

  const app = credenciaisDoGoogle();
  if (!app) return voltar("erro=configuracao");
  const atual = await obterOrganizacao();
  if (!atual?.ehDono || atual.org.id !== orgGuardada) return voltar("erro=permissao");

  try {
    const conta = await trocarCodigo(app, codigo, `${origem}${RETORNO_DO_GOOGLE}`);
    const supabase = await criarClienteServidor();
    const { error } = await supabase.rpc("integracao_conectar", {
      p_org: atual.org.id,
      p_provedor: "google",
      p_conta: conta.email ?? "",
      p_credenciais: cifrar(conta.refreshToken, segredoDaCifra(app)),
      p_escopos: conta.escopos,
    });
    if (error) throw new Error(error.message);
    return voltar("ok=conectado");
  } catch (erro) {
    console.error("[integracoes] retorno do Google:", erro instanceof Error ? erro.message : erro);
    return voltar("erro=google");
  }
}
