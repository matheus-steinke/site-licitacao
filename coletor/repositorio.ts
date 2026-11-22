// Onde o coletor lê e grava. A implementação real usa o Supabase com a chave
// de serviço; os testes e o modo "simular" usam a versão em memória.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { SegmentoBruto } from "../src/lib/texto/segmentos";
import type { Database } from "../src/lib/supabase/tipos";
import type { ArquivoColetado, CompraColetada, ItemColetado } from "./mapear";

export type CompraConhecida = {
  controle_pncp: string;
  area_saude: boolean | null;
  itens_coletados_em: string | null;
  tentativas_itens: number;
};

export type CompraParaVerificar = { controle_pncp: string; orgao_cnpj: string; ano: number; sequencial: number };

export type ClassificacaoDaCompra = { area_saude: boolean; segmento_ids: string[] };
export type ItemComSegmentos = ItemColetado & { segmento_ids: string[] };

export type Gravacao = {
  compra: CompraColetada;
  /** Presente quando os itens foram baixados nesta rodada. */
  classificacao?: ClassificacaoDaCompra;
  itens?: ItemComSegmentos[];
  arquivos?: ArquivoColetado[];
  /** A tentativa de baixar os itens falhou (conta para o diagnóstico). */
  falhaItens?: boolean;
};

export type ResultadoGravacao = { resultado: "nova" | "atualizada" | "igual"; alteracoes: number };

export type TotaisDaRodada = {
  status: "sucesso" | "parcial" | "erro";
  fonte: "busca" | "plano_b" | null;
  termos_buscados: number;
  compras_encontradas: number;
  compras_novas: number;
  compras_atualizadas: number;
  compras_descartadas: number;
  compras_pendentes: number;
  alteracoes: number;
  erros: number;
  mensagem: string | null;
};

export type ErroDaRodada = { etapa: string; url?: string; status_http?: number; mensagem: string };

export interface Repositorio {
  listarSegmentosAtivos(): Promise<SegmentoBruto[]>;
  iniciarRodada(origem: "agendado" | "manual"): Promise<string>;
  registrarErro(rodadaId: string, erro: ErroDaRodada): Promise<void>;
  /** Grava os números parciais e em que fase a rodada está (para acompanhar pelo painel). */
  registrarAndamento(rodadaId: string, parcial: TotaisDaRodada, fase: string): Promise<void>;
  finalizarRodada(rodadaId: string, totais: TotaisDaRodada): Promise<void>;
  buscarConhecidas(controles: string[]): Promise<Map<string, CompraConhecida>>;
  gravarCompra(gravacao: Gravacao): Promise<ResultadoGravacao>;
  /** Compras da saúde com disputa a partir de `desde` que não foram conferidas depois de `antesDe`. */
  listarParaVerificar(desde: string, antesDe: string, limite: number): Promise<CompraParaVerificar[]>;
  /** Compras com itens pendentes e disputa a partir de `desde`, não conferidas depois de `antesDe`. */
  listarPendentes(desde: string, antesDe: string, limite: number): Promise<CompraParaVerificar[]>;
}

/**
 * Deixa uma mensagem de erro curta e numa linha só. Quando o Supabase está
 * instável, a "mensagem" chega como uma página HTML inteira da rede dele.
 */
export function resumirErro(mensagem: string): string {
  const titulo = /<title>([^<]*)<\/title>/i.exec(mensagem)?.[1];
  const texto = titulo ? `resposta HTML: ${titulo}` : mensagem;
  return texto.replace(/\s+/g, " ").trim().slice(0, 300);
}

type RespostaDoBanco<T> = { data: T; error: { message: string; code?: string } | null; status?: number };

/** Falha passageira: rede, tempo limite, 5xx ou página de erro no lugar do JSON. */
export function falhaPassageira(resposta: { error: { message: string } | null; status?: number }): boolean {
  if (!resposta.error) return false;
  const status = resposta.status ?? 0;
  return (
    status === 0 ||
    status === 408 ||
    status === 429 ||
    status >= 500 ||
    /<html|<!doctype|fetch failed|timed? ?out|ECONNRESET|socket hang up/i.test(resposta.error.message)
  );
}

/** Repete a operação no banco quando a falha é passageira (até 4 tentativas). */
export async function tentarNoBanco<T>(
  operacao: () => PromiseLike<RespostaDoBanco<T>>,
  dormir: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  tentativas = 4,
): Promise<RespostaDoBanco<T>> {
  let resposta: RespostaDoBanco<T> | undefined;
  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      resposta = await operacao();
    } catch (erro) {
      // O cliente do Supabase costuma devolver o erro, mas falhas de rede podem estourar.
      resposta = { data: null as T, error: { message: erro instanceof Error ? erro.message : String(erro) }, status: 0 };
    }
    if (!falhaPassageira(resposta) || tentativa === tentativas) break;
    await dormir(1000 * 2 ** (tentativa - 1));
  }
  return resposta!;
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------
export function criarRepositorioSupabase(url: string, chaveDeServico: string): Repositorio {
  const supabase: SupabaseClient<Database> = createClient<Database>(url, chaveDeServico, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const falhar = (acao: string, mensagem: string): never => {
    throw new Error(`Banco (${acao}): ${resumirErro(mensagem)}`);
  };

  async function listarCompras(
    filtro: "saude" | "pendentes",
    desde: string,
    antesDe: string,
    limite: number,
  ): Promise<CompraParaVerificar[]> {
    let consulta = supabase
      .from("compras")
      .select("controle_pncp, orgao_cnpj, ano, sequencial")
      .eq("exemplo", false)
      .gte("data_disputa", desde)
      .or(`verificado_em.is.null,verificado_em.lt.${antesDe}`);
    consulta = filtro === "saude" ? consulta.eq("area_saude", true) : consulta.is("area_saude", null);
    const { data, error } = await tentarNoBanco(() =>
      consulta.order("verificado_em", { ascending: true, nullsFirst: true }).limit(limite),
    );
    if (error) falhar("listar compras", error.message);
    return data ?? [];
  }

  return {
    async listarSegmentosAtivos() {
      const { data, error } = await tentarNoBanco(() =>
        supabase
          .from("segmentos")
          .select("id, nome, palavras_chave, sinonimos, exclusoes")
          .eq("ativo", true)
          .order("ordem"),
      );
      if (error) falhar("segmentos", error.message);
      return data ?? [];
    },

    async iniciarRodada(origem) {
      const { data, error } = await tentarNoBanco(() =>
        supabase.from("coletor_rodadas").insert({ origem }).select("id").single(),
      );
      if (error || !data) return falhar("iniciar rodada", error?.message ?? "sem resposta");
      return data.id;
    },

    async registrarErro(rodadaId, erro) {
      const { error } = await tentarNoBanco(() =>
        supabase.from("coletor_erros").insert({
          rodada_id: rodadaId,
          etapa: erro.etapa,
          url: erro.url ?? null,
          status_http: erro.status_http ?? null,
          mensagem: resumirErro(erro.mensagem),
        }),
      );
      // Falhar ao registrar um erro não pode derrubar a rodada.
      if (error) console.error("não consegui registrar o erro:", resumirErro(error.message));
    },

    async registrarAndamento(rodadaId, parcial, fase) {
      // O status continua "em_andamento" até a rodada terminar.
      const { error } = await tentarNoBanco(() =>
        supabase
          .from("coletor_rodadas")
          .update({ ...parcial, status: "em_andamento", mensagem: `Em andamento: ${fase}` })
          .eq("id", rodadaId),
      );
      // O andamento é só informativo: não pode derrubar a rodada.
      if (error) console.error("não consegui registrar o andamento:", resumirErro(error.message));
    },

    async finalizarRodada(rodadaId, totais) {
      const { error } = await tentarNoBanco(() =>
        supabase
          .from("coletor_rodadas")
          .update({
            ...totais,
            mensagem: totais.mensagem ? totais.mensagem.slice(0, 1000) : null,
            finalizado_em: new Date().toISOString(),
          })
          .eq("id", rodadaId),
      );
      if (error) falhar("finalizar rodada", error.message);
    },

    async buscarConhecidas(controles) {
      const mapa = new Map<string, CompraConhecida>();
      for (let i = 0; i < controles.length; i += 100) {
        const lote = controles.slice(i, i + 100);
        const { data, error } = await tentarNoBanco(() =>
          supabase
            .from("compras")
            .select("controle_pncp, area_saude, itens_coletados_em, tentativas_itens")
            .in("controle_pncp", lote),
        );
        if (error) falhar("compras conhecidas", error.message);
        for (const compra of data ?? []) mapa.set(compra.controle_pncp, compra);
      }
      return mapa;
    },

    async gravarCompra({ compra, classificacao, itens, arquivos, falhaItens }) {
      // Gravar de novo a mesma compra dá o mesmo resultado, então repetir é seguro.
      const { data, error } = await tentarNoBanco(() =>
        supabase.rpc("coletor_gravar_compra", {
          p_compra: { ...compra, ...classificacao, falha_itens: falhaItens ?? false },
          p_itens: itens ?? null,
          p_arquivos: arquivos ?? null,
        }),
      );
      if (error) falhar(`gravar ${compra.controle_pncp}`, error.message);
      return data as ResultadoGravacao;
    },

    listarParaVerificar: (desde, antesDe, limite) => listarCompras("saude", desde, antesDe, limite),
    listarPendentes: (desde, antesDe, limite) => listarCompras("pendentes", desde, antesDe, limite),
  };
}

// ---------------------------------------------------------------------------
// Memória (testes e modo "simular")
// ---------------------------------------------------------------------------
export type CompraEmMemoria = {
  compra: CompraColetada;
  area_saude: boolean | null;
  segmento_ids: string[];
  itens: ItemComSegmentos[];
  arquivos: ArquivoColetado[];
  itens_coletados_em: string | null;
  tentativas_itens: number;
  verificado_em: string | null;
};

export function criarRepositorioMemoria(segmentos: SegmentoBruto[], agora: () => Date = () => new Date()) {
  const compras = new Map<string, CompraEmMemoria>();
  const rodadas: (TotaisDaRodada | { status: "em_andamento" })[] = [];
  const fases: string[] = [];
  const erros: ErroDaRodada[] = [];
  const alteracoes: { controle_pncp: string; campo: string; de: unknown; para: unknown }[] = [];

  const listar = (saude: boolean, desde: string, antesDe: string, limite: number) =>
    [...compras.values()]
      .filter((c) => (saude ? c.area_saude === true : c.area_saude === null))
      .filter((c) => (c.compra.data_disputa ?? "") >= desde)
      .filter((c) => c.verificado_em === null || c.verificado_em < antesDe)
      .slice(0, limite)
      .map((c) => ({
        controle_pncp: c.compra.controle_pncp,
        orgao_cnpj: c.compra.orgao_cnpj,
        ano: c.compra.ano,
        sequencial: c.compra.sequencial,
      }));

  const repositorio: Repositorio = {
    async listarSegmentosAtivos() {
      return segmentos;
    },
    async iniciarRodada() {
      rodadas.push({ status: "em_andamento" });
      return String(rodadas.length - 1);
    },
    async registrarErro(_rodadaId, erro) {
      erros.push(erro);
    },
    async registrarAndamento(_rodadaId, _parcial, fase) {
      fases.push(fase);
    },
    async finalizarRodada(rodadaId, totais) {
      rodadas[Number(rodadaId)] = totais;
    },
    async buscarConhecidas(controles) {
      const mapa = new Map<string, CompraConhecida>();
      for (const controle of controles) {
        const c = compras.get(controle);
        if (c) {
          mapa.set(controle, {
            controle_pncp: controle,
            area_saude: c.area_saude,
            itens_coletados_em: c.itens_coletados_em,
            tentativas_itens: c.tentativas_itens,
          });
        }
      }
      return mapa;
    },
    async gravarCompra({ compra, classificacao, itens, arquivos, falhaItens }) {
      const momento = agora().toISOString();
      const antiga = compras.get(compra.controle_pncp);
      if (!antiga) {
        compras.set(compra.controle_pncp, {
          compra,
          area_saude: itens ? (classificacao?.area_saude ?? false) : null,
          segmento_ids: itens ? (classificacao?.segmento_ids ?? []) : [],
          itens: itens ?? [],
          arquivos: arquivos ?? [],
          itens_coletados_em: itens ? momento : null,
          tentativas_itens: falhaItens ? 1 : 0,
          verificado_em: momento,
        });
        return { resultado: "nova", alteracoes: 0 };
      }

      let mudancas = 0;
      for (const campo of ["situacao_id", "data_disputa"] as const) {
        const novo = compra[campo];
        if (novo !== null && novo !== antiga.compra[campo]) {
          alteracoes.push({ controle_pncp: compra.controle_pncp, campo, de: antiga.compra[campo], para: novo });
          mudancas++;
        }
      }
      // Como no banco: campo ausente (null) não apaga o que já existe.
      const mesclada = { ...antiga.compra };
      for (const [campo, valor] of Object.entries(compra)) {
        if (valor !== null) (mesclada as Record<string, unknown>)[campo] = valor;
      }
      antiga.compra = mesclada;
      if (itens) {
        antiga.itens = itens;
        antiga.area_saude = classificacao?.area_saude ?? false;
        antiga.segmento_ids = classificacao?.segmento_ids ?? [];
        antiga.itens_coletados_em = momento;
      }
      if (arquivos) antiga.arquivos = arquivos;
      if (falhaItens) antiga.tentativas_itens++;
      antiga.verificado_em = momento;
      return { resultado: mudancas > 0 || itens ? "atualizada" : "igual", alteracoes: mudancas };
    },
    listarParaVerificar: async (desde, antesDe, limite) => listar(true, desde, antesDe, limite),
    listarPendentes: async (desde, antesDe, limite) => listar(false, desde, antesDe, limite),
  };

  return { repositorio, compras, rodadas, erros, alteracoes, fases };
}
