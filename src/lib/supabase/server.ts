import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";

import { supabaseEnv } from "./env";
import type { Database } from "./tipos";

/** Cliente Supabase com a sessão do usuário (respeita RLS). Use em Server Components, actions e rotas. */
export async function criarClienteServidor() {
  // Sessão e dados do cliente são sempre da requisição atual: nada disso entra
  // em pré-renderização nem em cache (o cliente do Supabase lê o relógio para
  // validar o token, o que o Next não permite fora de uma requisição real).
  await connection();
  const cookieStore = await cookies();
  const { url, chave } = supabaseEnv();

  return createServerClient<Database>(url, chave, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components não podem gravar cookies; o proxy renova a sessão.
        }
      },
    },
  });
}
