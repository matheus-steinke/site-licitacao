import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { caminhoSeguro } from "@/lib/caminho";
import { criarClienteServidor } from "@/lib/supabase/server";

const TIPOS: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/**
 * Confirmação por token (funciona mesmo abrindo o e-mail em outro aparelho).
 * Usada quando os modelos de e-mail do Supabase apontam para
 * /auth/confirm?token_hash=...&type=... (veja o README).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const tipo = searchParams.get("type") as EmailOtpType | null;
  const proximo = caminhoSeguro(
    searchParams.get("next"),
    tipo === "recovery" ? "/redefinir-senha" : "/oportunidades",
  );

  if (tokenHash && tipo && TIPOS.includes(tipo)) {
    const supabase = await criarClienteServidor();
    const { error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${proximo}`);
  }

  return NextResponse.redirect(`${origin}/entrar?aviso=link`);
}
