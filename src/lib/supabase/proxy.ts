import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { supabaseEnv } from "./env";

const ROTAS_SO_VISITANTE = ["/entrar", "/cadastrar", "/recuperar-senha"];
const ROTAS_LIVRES = ["/termos", "/privacidade", "/auth"];

function comecaCom(pathname: string, rotas: string[]) {
  return rotas.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

/**
 * Renova a sessão do Supabase a cada requisição e faz o redirecionamento
 * básico de login. É uma checagem otimista: a proteção real dos dados é o RLS
 * e a verificação em cada página/ação.
 */
export async function atualizarSessao(request: NextRequest) {
  let resposta = NextResponse.next({ request });
  const { url, chave } = supabaseEnv();

  const supabase = createServerClient(url, chave, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        resposta = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          resposta.cookies.set(name, value, options);
        }
        for (const [chaveHeader, valor] of Object.entries(headers ?? {})) {
          resposta.headers.set(chaveHeader, valor);
        }
      },
    },
  });

  // Não coloque código entre criar o cliente e getClaims(): é esta chamada
  // que renova o token quando ele expira.
  const { data } = await supabase.auth.getClaims();
  const logado = Boolean(data?.claims);
  const { pathname, search } = request.nextUrl;

  const redirecionar = (destino: URL) => {
    const redirecionamento = NextResponse.redirect(destino);
    for (const cookie of resposta.cookies.getAll()) {
      redirecionamento.cookies.set(cookie);
    }
    return redirecionamento;
  };

  if (!logado && !comecaCom(pathname, [...ROTAS_SO_VISITANTE, ...ROTAS_LIVRES])) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/entrar";
    destino.search = "";
    if (pathname !== "/") {
      destino.searchParams.set("proximo", `${pathname}${search}`);
    }
    return redirecionar(destino);
  }

  if (logado && (pathname === "/" || comecaCom(pathname, ROTAS_SO_VISITANTE))) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/oportunidades";
    destino.search = "";
    return redirecionar(destino);
  }

  return resposta;
}
