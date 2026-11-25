// Cliente das APIs públicas do PNCP: pausa entre chamadas, tempo limite e retentativa.
// As APIs caem com frequência (503, resposta vazia, timeout), então toda chamada
// passa por aqui.

export const BASE_PNCP = "https://pncp.gov.br";

/** Quantos números de controle cabem numa busca (conferido na API real com 25). */
export const MAXIMO_DE_CONTROLES_POR_BUSCA = 20;

export class ErroPncp extends Error {
  constructor(
    mensagem: string,
    readonly url: string,
    readonly status?: number,
  ) {
    super(mensagem);
  }
}

export type OpcoesCliente = {
  /** Pausa mínima entre o início de duas chamadas, em ms. */
  pausaMs?: number;
  /** Tempo limite de cada tentativa, em ms. */
  timeoutMs?: number;
  /** Folga do limite duro sobre o tempo limite, em ms. */
  folgaDoLimiteMs?: number;
  /** Tentativas por chamada (a primeira conta) para tempo esgotado, 429 e 5xx. */
  tentativas?: number;
  /**
   * Tentativas quando a conexão é derrubada na hora (sem resposta HTTP). O PNCP faz isso
   * de forma aleatória, em até metade das chamadas nos dias ruins; como a queda é rápida,
   * vale insistir mais vezes, com espera curta.
   */
  tentativasEmQueda?: number;
  /** Espera antes da 2ª tentativa; dobra a cada nova tentativa. */
  esperaInicialMs?: number;
  /**
   * Pausa mínima entre chamadas à API de consulta (/api/consulta/): detalhe e plano B. Ela tem
   * um limite de requisições bem mais baixo que o das outras e responde 429 ao ser atropelada.
   */
  pausaConsultaMs?: number;
  /** Espera depois de um 429 (limite de requisições); dobra a cada nova tentativa. */
  esperaNo429Ms?: number;
  fetch?: typeof fetch;
  dormir?: (ms: number) => Promise<void>;
  /** Chamado a cada falha (inclusive as que serão tentadas de novo). */
  aoFalhar?: (falha: { url: string; status?: number; mensagem: string; tentativa: number; definitiva: boolean }) => void;
};

const dormirPadrao = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Erros que valem nova tentativa: rede, tempo limite, 408, 429 e 5xx. */
function valeTentarDeNovo(status: number | undefined): boolean {
  return status === undefined || status === 408 || status === 429 || status >= 500;
}

/** "fetch failed" sozinho não diz nada: junta o motivo real (ECONNRESET, ETIMEDOUT...). */
function mensagemComCausa(erro: Error): string {
  const causa = (erro as { cause?: { code?: string; message?: string } }).cause;
  const detalhe = causa?.code ?? causa?.message;
  return detalhe ? `${erro.message} (${detalhe})` : erro.message;
}

/** Rejeita se a tarefa não terminar no prazo. */
function comLimite<T>(ms: number, tarefa: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const relogio = setTimeout(() => reject(new Error("tempo esgotado")), ms);
    tarefa().then(
      (valor) => {
        clearTimeout(relogio);
        resolve(valor);
      },
      (erro) => {
        clearTimeout(relogio);
        reject(erro);
      },
    );
  });
}

export type ClientePncp = ReturnType<typeof criarClientePncp>;

export function criarClientePncp(opcoes: OpcoesCliente = {}) {
  const pausaMs = opcoes.pausaMs ?? 300;
  const timeoutMs = opcoes.timeoutMs ?? 30_000;
  const folgaDoLimiteMs = opcoes.folgaDoLimiteMs ?? 5000;
  const tentativas = opcoes.tentativas ?? 4;
  const tentativasEmQueda = Math.max(opcoes.tentativasEmQueda ?? 10, tentativas);
  const esperaInicialMs = opcoes.esperaInicialMs ?? 1500;
  const pausaConsultaMs = Math.max(opcoes.pausaConsultaMs ?? 1200, pausaMs);
  const esperaNo429Ms = Math.max(opcoes.esperaNo429Ms ?? 5000, esperaInicialMs);
  const buscar = opcoes.fetch ?? fetch;
  const dormir = opcoes.dormir ?? dormirPadrao;

  let proximaLiberada = 0;
  let proximaConsultaLiberada = 0;
  let chamadas = 0;

  /** Garante a pausa entre chamadas, mesmo com várias em paralelo. A consulta tem fila própria, mais lenta. */
  async function aguardarVez(consulta: boolean) {
    const agora = Date.now();
    const minhaVez = Math.max(agora, proximaLiberada, consulta ? proximaConsultaLiberada : 0);
    proximaLiberada = minhaVez + pausaMs;
    if (consulta) proximaConsultaLiberada = minhaVez + pausaConsultaMs;
    if (minhaVez > agora) await dormir(minhaVez - agora);
  }

  async function obterJson<T>(caminho: string): Promise<T> {
    const url = caminho.startsWith("http") ? caminho : `${BASE_PNCP}${caminho}`;
    const consulta = url.includes("/api/consulta/");
    let ultimoErro: ErroPncp | undefined;

    // Dois limites: um para quedas de conexão (rápidas, aleatórias) e outro para as
    // demais falhas (lentas: tempo esgotado, 429, 5xx).
    let quedas = 0;
    let outrasFalhas = 0;
    for (let tentativa = 1; ; tentativa++) {
      await aguardarVez(consulta);
      chamadas++;
      let status: number | undefined;
      try {
        // Além do tempo limite da requisição, um limite duro: garante que nenhuma
        // chamada fique pendurada para sempre, aconteça o que acontecer na conexão.
        const { resposta, texto } = await comLimite(timeoutMs + folgaDoLimiteMs, async () => {
          const r = await buscar(url, {
            headers: {
              Accept: "application/json",
              "User-Agent": "Mozilla/5.0 (compatible; coletor-licitacoes/1.0)",
            },
            signal: AbortSignal.timeout(timeoutMs),
          });
          return { resposta: r, texto: r.status === 204 ? "" : await r.text() };
        });
        status = resposta.status;
        // 204 = consulta válida sem resultados.
        if (status === 204) return undefined as T;
        if (!resposta.ok) throw new ErroPncp(`HTTP ${status}`, url, status);
        if (!texto.trim()) return undefined as T;
        try {
          return JSON.parse(texto) as T;
        } catch {
          throw new ErroPncp("resposta não é JSON", url, status);
        }
      } catch (erro) {
        const mensagem =
          erro instanceof ErroPncp
            ? erro.message
            : erro instanceof Error && (erro.name === "TimeoutError" || erro.message === "tempo esgotado")
              ? `sem resposta em ${timeoutMs / 1000}s`
              : erro instanceof Error
                ? mensagemComCausa(erro)
                : String(erro);
        // Queda de conexão: nenhuma resposta HTTP e não foi tempo esgotado.
        const queda = status === undefined && !mensagem.startsWith("sem resposta em");
        let repetir: boolean;
        let espera: number;
        if (queda) {
          quedas++;
          repetir = quedas < tentativasEmQueda;
          espera = Math.min(Math.round(esperaInicialMs / 3) * 2 ** (quedas - 1), 4000);
        } else {
          outrasFalhas++;
          // "resposta não é JSON" com status 200 costuma ser página de erro do balanceador.
          repetir = outrasFalhas < tentativas && (valeTentarDeNovo(status) || mensagem === "resposta não é JSON");
          // Limite de requisições: insistir logo só mantém o bloqueio; espera bem mais.
          espera = (status === 429 ? esperaNo429Ms : esperaInicialMs) * 2 ** (outrasFalhas - 1);
        }
        ultimoErro = new ErroPncp(mensagem, url, status);
        opcoes.aoFalhar?.({ url, status, mensagem, tentativa, definitiva: !repetir });
        if (!repetir) break;
        await dormir(espera);
      }
    }
    throw ultimoErro ?? new ErroPncp("falha desconhecida", url);
  }

  return {
    obterJson,
    /** Total de requisições feitas (contando as repetidas). */
    get chamadas() {
      return chamadas;
    },

    /** Busca textual do portal: editais recebendo proposta que citam o termo. */
    buscar(termo: string, pagina: number, modalidades: number[], tamanho = 100) {
      const parametros = new URLSearchParams({
        q: `"${termo}"`,
        tipos_documento: "edital",
        ordenacao: "-data",
        pagina: String(pagina),
        tam_pagina: String(tamanho),
        status: "recebendo_proposta",
        modalidades: modalidades.join("|"),
      });
      return obterJson<RespostaBusca | undefined>(`/api/search/?${parametros}`);
    },

    /**
     * A mesma busca, por números de controle e em qualquer situação: acha também as suspensas,
     * revogadas e anuladas, que saem da busca de "recebendo proposta". Uma chamada confere
     * vários controles ("A" OR "B" OR ...; no máximo MAXIMO_DE_CONTROLES_POR_BUSCA). O que não
     * volta no resultado o PNCP não conhece (contratação excluída, por exemplo).
     */
    async buscarPorControles(controles: string[]): Promise<Map<string, ItemBusca>> {
      if (controles.length > MAXIMO_DE_CONTROLES_POR_BUSCA) {
        throw new Error(`No máximo ${MAXIMO_DE_CONTROLES_POR_BUSCA} controles por busca.`);
      }
      const achadas = new Map<string, ItemBusca>();
      if (controles.length === 0) return achadas;
      const parametros = new URLSearchParams({
        q: controles.map((controle) => `"${controle}"`).join(" OR "),
        tipos_documento: "edital",
        ordenacao: "-data",
        pagina: "1",
        tam_pagina: "100",
        status: "todos",
      });
      const resposta = await obterJson<RespostaBusca | undefined>(`/api/search/?${parametros}`);
      const pedidos = new Set(controles);
      // Só vale o controle exato: outro edital pode citar o número no texto.
      for (const item of resposta?.items ?? []) {
        if (pedidos.has(item.numero_controle_pncp)) achadas.set(item.numero_controle_pncp, item);
      }
      return achadas;
    },

    /** Plano B: todas as contratações com proposta aberta até a data (sem busca por texto). */
    listarPropostasAbertas(modalidade: number, dataFinal: string, pagina: number) {
      const parametros = new URLSearchParams({
        dataFinal,
        codigoModalidadeContratacao: String(modalidade),
        pagina: String(pagina),
        tamanhoPagina: "50",
      });
      return obterJson<RespostaConsulta | undefined>(`/api/consulta/v1/contratacoes/proposta?${parametros}`);
    },

    detalhe(cnpj: string, ano: number, sequencial: number) {
      return obterJson<ContratacaoPncp | undefined>(`/api/consulta/v1/orgaos/${cnpj}/compras/${ano}/${sequencial}`);
    },

    /** Todos os itens da compra (pagina de 500 em 500). */
    async itens(cnpj: string, ano: number, sequencial: number): Promise<ItemPncp[]> {
      const todos: ItemPncp[] = [];
      for (let pagina = 1; pagina <= 20; pagina++) {
        const lote = await obterJson<ItemPncp[] | undefined>(
          `/api/pncp/v1/orgaos/${cnpj}/compras/${ano}/${sequencial}/itens?pagina=${pagina}&tamanhoPagina=500`,
        );
        if (!Array.isArray(lote) || lote.length === 0) break;
        todos.push(...lote);
        if (lote.length < 500) break;
      }
      return todos;
    },

    async arquivos(cnpj: string, ano: number, sequencial: number): Promise<ArquivoPncp[]> {
      const lista = await obterJson<ArquivoPncp[] | undefined>(
        `/api/pncp/v1/orgaos/${cnpj}/compras/${ano}/${sequencial}/arquivos`,
      );
      return Array.isArray(lista) ? lista : [];
    },
  };
}

// ---------------------------------------------------------------------------
// Formato das respostas (só os campos que usamos; conferidos na API real)
// ---------------------------------------------------------------------------
export type ItemBusca = {
  numero_controle_pncp: string;
  orgao_cnpj: string;
  orgao_nome: string | null;
  ano: string;
  numero_sequencial: string;
  numero: string | null;
  title: string | null;
  description: string | null;
  unidade_codigo: string | null;
  unidade_nome: string | null;
  esfera_nome: string | null;
  poder_nome: string | null;
  municipio_nome: string | null;
  codigo_ibge: string | null;
  uf: string | null;
  modalidade_licitacao_id: string | null;
  modalidade_licitacao_nome: string | null;
  situacao_id: string | null;
  data_publicacao_pncp: string | null;
  data_atualizacao_pncp: string | null;
  data_inicio_vigencia: string | null;
  data_fim_vigencia: string | null;
  cancelado: boolean | null;
  srp: boolean | null;
  modo_disputa_nome: string | null;
  valor_total_estimado: number | null;
  link_sistema_origem: string | null;
};

export type RespostaBusca = { items: ItemBusca[]; total: number };

export type ContratacaoPncp = {
  numeroControlePNCP: string;
  orgaoEntidade: { cnpj: string; razaoSocial: string; poderId?: string | null; esferaId?: string | null };
  unidadeOrgao?: {
    ufSigla?: string | null;
    municipioNome?: string | null;
    codigoIbge?: string | null;
    codigoUnidade?: string | null;
    nomeUnidade?: string | null;
  } | null;
  anoCompra: number;
  sequencialCompra: number;
  numeroCompra?: string | null;
  processo?: string | null;
  objetoCompra?: string | null;
  modalidadeId: number;
  modalidadeNome?: string | null;
  modoDisputaNome?: string | null;
  situacaoCompraId?: number | null;
  dataPublicacaoPncp?: string | null;
  dataAberturaProposta?: string | null;
  dataEncerramentoProposta?: string | null;
  dataAtualizacaoGlobal?: string | null;
  dataAtualizacao?: string | null;
  valorTotalEstimado?: number | null;
  srp?: boolean | null;
  linkSistemaOrigem?: string | null;
};

export type RespostaConsulta = {
  data: ContratacaoPncp[];
  totalRegistros: number;
  totalPaginas: number;
  numeroPagina: number;
  paginasRestantes: number;
  empty: boolean;
};

/** Item da compra (campos conferidos na API real; não há campo de lote/grupo). */
export type ItemPncp = {
  numeroItem: number;
  descricao?: string | null;
  quantidade?: number | null;
  unidadeMedida?: string | null;
  valorUnitarioEstimado?: number | null;
  valorTotal?: number | null;
  tipoBeneficio?: number | null;
  tipoBeneficioNome?: string | null;
  situacaoCompraItemNome?: string | null;
  informacaoComplementar?: string | null;
  [campo: string]: unknown;
};

export type ArquivoPncp = {
  sequencialDocumento: number;
  titulo?: string | null;
  tipoDocumentoNome?: string | null;
  tipoDocumentoDescricao?: string | null;
  url?: string | null;
  uri?: string | null;
  dataPublicacaoPncp?: string | null;
  statusAtivo?: boolean | null;
};
