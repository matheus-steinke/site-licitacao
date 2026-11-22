import { createBrowserClient } from "@supabase/ssr";

import { supabaseEnv } from "./env";
import type { Database } from "./tipos";

/**
 * Cliente Supabase do navegador, com a sessão do usuário (respeita RLS).
 * Usado só onde o arquivo precisa ir direto do navegador para o Storage.
 */
export function criarClienteNavegador() {
  const { url, chave } = supabaseEnv();
  return createBrowserClient<Database>(url, chave);
}
