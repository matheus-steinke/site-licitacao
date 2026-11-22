import { NextResponse, type NextRequest } from "next/server";

import { caminhoSeguro } from "@/lib/caminho";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Volta do Supabase depois de: login com Google, confirmação de e-mail e
 * link de recuperação de senha. Troca o código por uma sessão.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const codigo = searchParams.get("code");
  const proximo = caminhoSeguro(searchParams.get("next"));

  if (codigo) {
    const supabase = await criarClienteServidor();
    const { error } = await supabase.auth.exchangeCodeForSession(codigo);
    if (!error) return NextResponse.redirect(`${origin}${proximo}`);
  }

  // Link aberto em outro navegador/aparelho ou já usado: o e-mail já foi
  // confirmado pelo Supabase, então basta entrar com a senha.
  return NextResponse.redirect(`${origin}/entrar?aviso=link`);
}
