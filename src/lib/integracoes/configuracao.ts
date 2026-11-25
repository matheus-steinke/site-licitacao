// Liga a sincronização ao mundo real: credenciais do app no Google (variáveis de ambiente),
// decifragem do token guardado e download dos arquivos do PNCP.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../supabase/tipos";
import { criarArmazenamento } from "./armazenamento";
import { baixarArquivo } from "./arquivos";
import { decifrar } from "./cifra";
import { ErroDeAcesso, renovarAcesso, type CredenciaisDoApp } from "./google/oauth";
import { criarServicoGoogle } from "./google/servico";
import type { Dependencias } from "./sincronizar";

/** GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET. null = a integração não foi configurada no servidor. */
export function credenciaisDoGoogle(ambiente: Record<string, string | undefined> = process.env): CredenciaisDoApp | null {
  const clientId = (ambiente.GOOGLE_CLIENT_ID ?? "").trim();
  const clientSecret = (ambiente.GOOGLE_CLIENT_SECRET ?? "").trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** O token de atualização é cifrado com uma chave derivada do segredo do app no Google. */
export const segredoDaCifra = (app: CredenciaisDoApp) => app.clientSecret;

/** Só baixa arquivos do próprio PNCP. */
export function urlDoPncp(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "pncp.gov.br" || u.hostname.endsWith(".pncp.gov.br"));
  } catch {
    return false;
  }
}

export function criarDependencias(
  supabase: SupabaseClient<Database>,
  app: CredenciaisDoApp,
  opcoes: { linkDoApp?: (oportunidadeId: string) => string | null; limiteDoArquivoBytes?: number } = {},
): Dependencias {
  return {
    armazenamento: criarArmazenamento(supabase),
    abrirGoogle: async (integracao) => {
      let token: string;
      try {
        token = decifrar(integracao.credenciais, segredoDaCifra(app));
      } catch {
        // O segredo do app mudou desde a conexão: o token guardado não serve mais.
        throw new ErroDeAcesso("As credenciais guardadas não podem mais ser lidas.");
      }
      return criarServicoGoogle(await renovarAcesso(app, token));
    },
    baixar: async (arquivo, limite) => {
      if (!urlDoPncp(arquivo.url)) throw new Error("O endereço do arquivo não é do PNCP.");
      return baixarArquivo(arquivo.url, arquivo.titulo, arquivo.sequencial, limite);
    },
    linkDoApp: opcoes.linkDoApp,
    limiteDoArquivoBytes: opcoes.limiteDoArquivoBytes,
  };
}
