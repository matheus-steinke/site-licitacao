import "server-only";

import { headers } from "next/headers";
import { after } from "next/server";

import { criarClienteServidor } from "@/lib/supabase/server";

import { criarArmazenamento } from "./armazenamento";
import { decifrar } from "./cifra";
import { credenciaisDoGoogle, criarDependencias, segredoDaCifra } from "./configuracao";
import { ESCOPO_AGENDA, ESCOPO_DRIVE, revogar } from "./google/oauth";
import {
  sincronizarOportunidade,
  type ArquivoNoDrive,
  type ResultadoDaSincronizacao,
  type Vinculo,
} from "./sincronizar";

/** Arquivos maiores que isto ficam para o coletor, que tem mais memória e tempo. */
const LIMITE_DO_ARQUIVO_NO_APP = 25 * 1_048_576;
/** Tempo que o app gasta enviando arquivos depois de responder ao usuário. */
const TEMPO_PARA_ARQUIVOS_MS = 45_000;

/** Endereço público do app (para os links de retorno do Google e os links nos eventos). */
export async function origemDoApp(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const cabecalhos = await headers();
  const host = cabecalhos.get("x-forwarded-host") ?? cabecalhos.get("host") ?? "localhost:3000";
  const protocolo = cabecalhos.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocolo}://${host}`;
}

export const RETORNO_DO_GOOGLE = "/integracoes/google/retorno";
/** Guarda o "estado" do OAuth por 10 minutos, para conferir na volta do Google. */
export const COOKIE_DO_ESTADO = "google_oauth_estado";

async function dependencias() {
  const app = credenciaisDoGoogle();
  if (!app) return null;
  const [supabase, origem] = await Promise.all([criarClienteServidor(), origemDoApp()]);
  return criarDependencias(supabase, app, {
    linkDoApp: (oportunidadeId) => `${origem}/oportunidades/${oportunidadeId}`,
    limiteDoArquivoBytes: LIMITE_DO_ARQUIVO_NO_APP,
  });
}

/**
 * Para a exclusão da conta: lê o acesso ao Google antes de a empresa ser apagada e devolve a
 * função que pede ao Google para invalidá-lo. Eventos e pastas já criados ficam na conta do
 * Google do cliente. Nunca lança erro.
 */
export async function prepararRevogacaoDoGoogle(orgId: string): Promise<() => Promise<void>> {
  const nada = async () => {};
  try {
    const app = credenciaisDoGoogle();
    if (!app) return nada;
    const supabase = await criarClienteServidor();
    const { data } = await supabase.from("integracoes").select("credenciais").eq("org_id", orgId).eq("provedor", "google").maybeSingle();
    if (!data) return nada;
    const token = decifrar(data.credenciais, segredoDaCifra(app));
    return async () => {
      try {
        await revogar(token);
      } catch (erro) {
        console.error("[integracoes] revogar ao excluir a conta:", erro instanceof Error ? erro.message : erro);
      }
    };
  } catch {
    // Credenciais ilegíveis: não há o que revogar.
    return nada;
  }
}

/** Frase curta para o aviso na tela, ou null se não houve nada a dizer. */
export function resumirSincronizacao(r: ResultadoDaSincronizacao): { texto: string; falhou: boolean } | null {
  if (r.erroDeAcesso) return { texto: r.erroDeAcesso, falhou: true };
  if (r.erros.length > 0) return { texto: `O Google respondeu com erro. ${r.erros.join(" ")}`, falhou: true };
  const feitos: string[] = [];
  if (r.evento === "criado") feitos.push("evento criado na agenda");
  if (r.evento === "atualizado") feitos.push("evento atualizado na agenda");
  if (r.evento === "removido") feitos.push("evento removido da agenda");
  if (r.pasta === "criada") feitos.push("pastas criadas no Drive");
  if (r.arquivos.enviados > 0) feitos.push(`${r.arquivos.enviados} arquivo(s) do edital enviado(s)`);
  if (r.arquivos.pendentes > 0) feitos.push("os arquivos do edital estão sendo enviados");
  if (feitos.length === 0) return null;
  const frase = feitos.join("; ");
  return { texto: `Google: ${frase}.`, falhou: false };
}

/**
 * Depois de aprovar, desfazer ou descartar: cria ou remove o evento e as pastas na hora, e deixa
 * o envio dos arquivos do edital para depois da resposta. Nunca lança erro: a decisão do
 * usuário já foi gravada.
 */
export async function sincronizarAposDecisao(orgId: string, oportunidadeId: string): Promise<ReturnType<typeof resumirSincronizacao>> {
  try {
    const deps = await dependencias();
    if (!deps) return null;
    const r = await sincronizarOportunidade(deps, orgId, oportunidadeId, { semArquivos: true });
    if (r.arquivos.pendentes > 0 && !r.erroDeAcesso) {
      after(async () => {
        try {
          await sincronizarOportunidade(deps, orgId, oportunidadeId, { prazo: Date.now() + TEMPO_PARA_ARQUIVOS_MS });
        } catch (erro) {
          console.error("[integracoes] envio dos arquivos:", erro instanceof Error ? erro.message : erro);
        }
      });
    }
    return resumirSincronizacao(r);
  } catch (erro) {
    console.error("[integracoes] sincronizar:", erro instanceof Error ? erro.message : erro);
    return { texto: "Não foi possível falar com o Google agora. Use o botão Sincronizar na página da licitação.", falhou: true };
  }
}

/** Botão "Sincronizar": faz tudo, inclusive os arquivos, dentro do tempo da requisição. */
export async function sincronizarPeloBotao(orgId: string, oportunidadeId: string): Promise<ResultadoDaSincronizacao | null> {
  const deps = await dependencias();
  if (!deps) return null;
  return sincronizarOportunidade(deps, orgId, oportunidadeId, { manual: true, prazo: Date.now() + TEMPO_PARA_ARQUIVOS_MS });
}

export type PainelDoGoogle = {
  /** As variáveis GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET existem no servidor. */
  configurado: boolean;
  conectado: boolean;
  conta: string | null;
  erroDaConta: string | null;
  agenda: boolean;
  drive: boolean;
  evento: Vinculo | null;
  pasta: Vinculo | null;
  arquivos: { enviados: number; total: number; falhas: { nome: string; erro: string }[] };
};

/** O que mostrar sobre o Google na página de uma oportunidade. */
export async function carregarPainelDoGoogle(orgId: string, oportunidadeId: string, totalDeArquivos: number): Promise<PainelDoGoogle> {
  const armazenamento = criarArmazenamento(await criarClienteServidor());
  const [integracao, vinculos] = await Promise.all([
    armazenamento.carregarIntegracao(orgId),
    armazenamento.listarVinculos(orgId, oportunidadeId),
  ]);
  const pasta = vinculos.find((v) => v.tipo === "pasta") ?? null;
  const estados = Object.values((pasta?.dados.arquivos ?? {}) as Record<string, ArquivoNoDrive>);
  return {
    configurado: credenciaisDoGoogle() !== null,
    conectado: integracao !== null,
    conta: integracao?.conta ?? null,
    erroDaConta: integracao?.erro ?? null,
    agenda: !!integracao && integracao.agendaAtiva && integracao.escopos.includes(ESCOPO_AGENDA),
    drive: !!integracao && integracao.driveAtivo && integracao.escopos.includes(ESCOPO_DRIVE),
    evento: vinculos.find((v) => v.tipo === "evento") ?? null,
    pasta,
    arquivos: {
      enviados: estados.filter((e) => e.id).length,
      total: totalDeArquivos,
      falhas: estados.filter((e) => !e.id && e.erro && (e.grande || (e.tentativas ?? 0) >= 3)).map((e) => ({ nome: e.nome ?? "arquivo", erro: e.erro ?? "" })),
    },
  };
}
