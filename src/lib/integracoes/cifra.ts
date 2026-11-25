// Cifra das credenciais das integrações (token de atualização do OAuth) antes de irem para o
// banco. AES-256-GCM com chave derivada do segredo do servidor: quem lê a tabela vê só o
// texto cifrado.

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const VERSAO = "v1";

function chave(segredo: string): Buffer {
  if (segredo.length < 16) throw new Error("Segredo curto demais para cifrar as credenciais.");
  return Buffer.from(hkdfSync("sha256", segredo, "licitacao-integracoes", "credenciais-v1", 32));
}

/** Devolve "v1.<iv>.<etiqueta>.<cifrado>", tudo em base64url. Cada chamada usa um IV novo. */
export function cifrar(texto: string, segredo: string): string {
  const iv = randomBytes(12);
  const cifra = createCipheriv("aes-256-gcm", chave(segredo), iv);
  const cifrado = Buffer.concat([cifra.update(texto, "utf8"), cifra.final()]);
  return [VERSAO, iv.toString("base64url"), cifra.getAuthTag().toString("base64url"), cifrado.toString("base64url")].join(".");
}

/** Lança erro se o texto foi alterado ou se o segredo não é o mesmo que cifrou. */
export function decifrar(cifrado: string, segredo: string): string {
  const [versao, iv, etiqueta, dados] = cifrado.split(".");
  if (versao !== VERSAO || !iv || !etiqueta || dados === undefined) throw new Error("Credenciais em formato desconhecido.");
  const decifra = createDecipheriv("aes-256-gcm", chave(segredo), Buffer.from(iv, "base64url"));
  decifra.setAuthTag(Buffer.from(etiqueta, "base64url"));
  return Buffer.concat([decifra.update(Buffer.from(dados, "base64url")), decifra.final()]).toString("utf8");
}
