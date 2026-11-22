// Cliente das APIs públicas do PNCP: pausa entre chamadas, tempo limite e retentativa.
// As APIs caem com frequência (503, resposta vazia, timeout), então toda chamada
// passa por aqui.

export const BASE_PNCP = "https://pncp.gov.br";

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
  /** Tentativas por chamada (a primeira conta). */
  tentativas?: number;
  /** Espera antes da 2ª tentativa; dobra a cada nova tentativa. */
  esperaInicialMs?: number;
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

export type ClientePncp = ReturnType<typeof criarClientePncp>;

export function criarClientePncp(opcoes: OpcoesCliente = {}) {
  const pausaMs = opcoes.pausaMs ?? 300;
  const timeoutMs = opcoes.timeoutMs ?? 30_000;
  const tentativas = opcoes.tentativas ?? 4;
  const esperaInicialMs = opcoes.esperaInicialMs ?? 1500;
  const buscar = opcoes.fetch ?? fetch;
  const dormir = opcoes.dormir ?? dormirPadrao;

  let proximaLiberada = 0;
  let chamadas = 0;

  /** Garante a pausa entre chamadas, mesmo com várias em paralelo. */
  async function aguardarVez() {
    const agora = Date.now();
    const minhaVez = Math.max(agora, proximaLiberada);
    proximaLiberada = minhaVez + pausaMs;
    if (minhaVez > agora) await dormir(minhaVez - agora);
  }

  async function obterJson<T>(caminho: string): Promise<T> {
    const url = caminho.startsWith("http") ? caminho : `${BASE_PNCP}${caminho}`;
    let ultimoErro: ErroPncp | undefined;

    for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
      await aguardarVez();
      chamadas++;
      let status: number | undefined;
      try {
        const resposta = await buscar(url, {
          headers: {
            Accept: "application/json",
            "User-Agent": "Mozilla/5.0 (compatible; coletor-licitacoes/1.0)",
          },
          signal: AbortSignal.timeout(timeoutMs),
        });
        status = resposta.status;
        // 204 = consulta válida sem resultados.
        if (status === 204) return undefined as T;
        if (!resposta.ok) throw new ErroPncp(`HTTP ${status}`, url, status);
        const texto = await resposta.text();
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
            : erro instanceof Error && erro.name === "TimeoutError"
              ? `sem resposta em ${timeoutMs / 1000}s`
              : erro instanceof Error
                ? erro.message
                : String(erro);
        // "resposta não é JSON" com status 200 costuma ser página de erro do balanceador.
        const repetir = tentativa < tentativas && (valeTentarDeNovo(status) || mensagem === "resposta não é JSON");
        ultimoErro = new ErroPncp(mensagem, url, status);
        opcoes.aoFalhar?.({ url, status, mensagem, tentativa, definitiva: !repetir });
        if (!repetir) break;
        await dormir(esperaInicialMs * 2 ** (tentativa - 1));
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

/** Item da compra. Os nomes de lote/grupo variam; ver mapear.ts. */
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
