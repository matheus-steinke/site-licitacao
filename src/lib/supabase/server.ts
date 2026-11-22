import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { supabaseEnv } from "./env";
import type { Database } from "./tipos";

/** Cliente Supabase com a sessão do usuário (respeita RLS). Use em Server Components, actions e rotas. */
export async function criarClienteServidor() {
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
