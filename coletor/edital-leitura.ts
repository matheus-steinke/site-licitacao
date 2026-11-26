// Leitura dos editais, depois da coleta: para cada licitação aberta com arquivo novo, baixa o
// edital e o termo de referência do PNCP, extrai o texto, aplica as regras (src/lib/edital) e
// grava só os alertas e os trechos. Sem banco nem rede de verdade aqui: tudo chega por
// dependências, para os testes.

import { lerEdital, VERSAO_DAS_REGRAS, type DocumentoDoEdital, type LeituraDoEdital } from "../src/lib/edital/regras";
import { letras, PdftotextAusente, type TextoExtraido } from "./edital-texto";

export type ArquivoDoEdital = { sequencial: number; titulo: string | null; tipo: string | null; url: string };
export type EditalPendente = { compra_id: string; controle_pncp: string; assinatura: string; arquivos: ArquivoDoEdital[] };

export type LeituraParaGravar = LeituraDoEdital & {
  compraId: string;
  status: "lido" | "sem_texto" | "erro";
  assinatura: string;
  versao: number;
  arquivosLidos: number;
  arquivosTotal: number;
  erro: string | null;
};

export type RepositorioDeEditais = {
  pendentes(versao: number, limite: number): Promise<{ restantes: number; compras: EditalPendente[] }>;
  gravar(leitura: LeituraParaGravar): Promise<void>;
};

/** Falha ao baixar um arquivo. Transitória = o PNCP pode responder na próxima rodada. */
export class FalhaDeDownload extends Error {
  constructor(
    mensagem: string,
    readonly transitoria: boolean,
  ) {
    super(mensagem);
  }
}

export const LIMITE_DO_ARQUIVO = 40 * 1_048_576;
/** Quantos arquivos se leem por licitação (há órgão que publica dezenas de anexos). */
export const MAXIMO_DE_ARQUIVOS = 8;
/** Abaixo disso, o documento é imagem digitalizada ou está vazio. */
export const MINIMO_DE_LETRAS = 200;
/** Licitações seguidas sem nenhum arquivo baixado (por falha do PNCP) até parar a rodada. */
export const FALHAS_PARA_PARAR = 3;

const PRINCIPAIS = ["Edital", "Termo de Referência", "Aviso de Contratação Direta"];

/** Edital, termo de referência e aviso de contratação direta; sem nenhum deles, o que houver. */
export function escolherArquivos(arquivos: ArquivoDoEdital[]): ArquivoDoEdital[] {
  const ordem = (a: ArquivoDoEdital) => {
    const posicao = PRINCIPAIS.indexOf(a.tipo ?? "");
    return posicao < 0 ? PRINCIPAIS.length : posicao;
  };
  const principais = arquivos.filter((a) => ordem(a) < PRINCIPAIS.length);
  return [...(principais.length > 0 ? principais : arquivos)]
    .sort((a, b) => ordem(a) - ordem(b) || a.sequencial - b.sequencial)
    .slice(0, MAXIMO_DE_ARQUIVOS);
}

/** Só baixa do próprio PNCP: o endereço vem de dados de fora. */
export function enderecoDoPncp(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && (hostname === "pncp.gov.br" || hostname.endsWith(".pncp.gov.br"));
  } catch {
    return false;
  }
}

export type OpcoesDoDownload = {
  buscar?: typeof fetch;
  pausa?: (ms: number) => Promise<void>;
  tentativas?: number;
  esperaMs?: number;
  limiteBytes?: number;
};

const esperar = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));

/** Baixa um arquivo do PNCP para a memória, com novas tentativas quando o portal falha. */
export function criarDownload(opcoes: OpcoesDoDownload = {}) {
  const buscar = opcoes.buscar ?? fetch;
  const pausa = opcoes.pausa ?? esperar;
  const tentativas = opcoes.tentativas ?? 3;
  const esperaMs = opcoes.esperaMs ?? 3000;
  const limite = opcoes.limiteBytes ?? LIMITE_DO_ARQUIVO;

  return async function baixar(url: string): Promise<Uint8Array> {
    if (!enderecoDoPncp(url)) throw new FalhaDeDownload("O endereço do arquivo não é do PNCP.", false);
    let ultima = "sem resposta";
    for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
      if (tentativa > 1) await pausa(esperaMs * (tentativa - 1));
      let resposta: Response;
      try {
        resposta = await buscar(url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; coletor-licitacoes/1.0)" },
          signal: AbortSignal.timeout(120_000),
        });
      } catch (erro) {
        ultima = erro instanceof Error ? erro.message : String(erro);
        continue;
      }
      if (resposta.status === 429 || resposta.status >= 500) {
        ultima = `HTTP ${resposta.status}`;
        await resposta.body?.cancel().catch(() => {});
        continue;
      }
      if (!resposta.ok || !resposta.body) {
        await resposta.body?.cancel().catch(() => {});
        throw new FalhaDeDownload(`O PNCP respondeu HTTP ${resposta.status}.`, false);
      }
      if (Number(resposta.headers.get("content-length")) > limite) {
        await resposta.body.cancel().catch(() => {});
        throw new FalhaDeDownload(`Arquivo com mais de ${Math.round(limite / 1_048_576)} MB.`, false);
      }
      try {
        const pedacos: Uint8Array[] = [];
        let total = 0;
        const leitor = resposta.body.getReader();
        for (;;) {
          const { done, value } = await leitor.read();
          if (done) break;
          total += value.byteLength;
          if (total > limite) {
            await leitor.cancel().catch(() => {});
            throw new FalhaDeDownload(`Arquivo com mais de ${Math.round(limite / 1_048_576)} MB.`, false);
          }
          pedacos.push(value);
        }
        return Buffer.concat(pedacos);
      } catch (erro) {
        if (erro instanceof FalhaDeDownload) throw erro;
        ultima = erro instanceof Error ? erro.message : String(erro);
      }
    }
    throw new FalhaDeDownload(`O PNCP não entregou o arquivo (${ultima}).`, true);
  };
}

export type Dependencias = {
  repositorio: RepositorioDeEditais;
  baixar: (url: string) => Promise<Uint8Array>;
  extrair: (conteudo: Uint8Array) => Promise<TextoExtraido>;
  agora?: () => number;
  pausa?: (ms: number) => Promise<void>;
  registrar?: (mensagem: string) => void;
};

export type OpcoesDaLeitura = {
  /** Tempo total do passo; o que não couber fica para a próxima rodada. */
  tempoMaximoMs?: number;
  maxCompras?: number;
  /** Pausa entre um download e outro, para não pesar no PNCP. */
  pausaMs?: number;
  lote?: number;
};

export type ResumoDaLeitura = {
  lidas: number;
  comExigencia: number;
  comCitacao: number;
  semTexto: number;
  erros: number;
  restantes: number;
  /** Por que parou antes de acabar, quando parou. */
  interrompida: string | null;
};

type Resultado = { leitura: LeituraParaGravar; soFalhaTransitoria: boolean };

async function lerUma(pendente: EditalPendente, deps: Dependencias, pausaMs: number): Promise<Resultado> {
  const pausa = deps.pausa ?? esperar;
  const escolhidos = escolherArquivos(pendente.arquivos);
  const documentos: DocumentoDoEdital[] = [];
  const falhas: string[] = [];
  let baixados = 0;
  let transitorias = 0;

  for (const [indice, arquivo] of escolhidos.entries()) {
    if (indice > 0) await pausa(pausaMs);
    let conteudo: Uint8Array;
    try {
      conteudo = await deps.baixar(arquivo.url);
    } catch (erro) {
      if (!(erro instanceof FalhaDeDownload)) throw erro;
      if (erro.transitoria) transitorias++;
      falhas.push(erro.message);
      continue;
    }
    baixados++;
    try {
      const { texto } = await deps.extrair(conteudo);
      if (letras(texto) >= MINIMO_DE_LETRAS) {
        documentos.push({ titulo: (arquivo.titulo ?? arquivo.tipo ?? `Arquivo ${arquivo.sequencial}`).slice(0, 120), texto });
      }
    } catch (erro) {
      if (erro instanceof PdftotextAusente) throw erro;
      falhas.push(`Não foi possível ler o arquivo ${arquivo.sequencial}: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  }

  const base = {
    compraId: pendente.compra_id,
    assinatura: pendente.assinatura,
    versao: VERSAO_DAS_REGRAS,
    arquivosTotal: escolhidos.length,
  };
  const erro =
    falhas.length > 0 ? `${falhas.length} de ${escolhidos.length} arquivo(s) com falha. ${[...new Set(falhas)].slice(0, 3).join(" ")}` : null;
  if (documentos.length > 0) {
    return {
      leitura: { ...base, status: "lido", ...lerEdital(documentos), arquivosLidos: documentos.length, erro },
      soFalhaTransitoria: false,
    };
  }
  if (baixados === 0) {
    return {
      leitura: { ...base, status: "erro", alertas: [], trechos: [], arquivosLidos: 0, erro: erro ?? "Nenhum arquivo para ler." },
      soFalhaTransitoria: escolhidos.length > 0 && transitorias === escolhidos.length,
    };
  }
  return { leitura: { ...base, status: "sem_texto", alertas: [], trechos: [], arquivosLidos: 0, erro }, soFalhaTransitoria: false };
}

/** Lê os editais pendentes até acabar, o tempo se esgotar ou o PNCP parar de responder. */
export async function lerEditais(deps: Dependencias, opcoes: OpcoesDaLeitura = {}): Promise<ResumoDaLeitura> {
  const agora = deps.agora ?? Date.now;
  const pausa = deps.pausa ?? esperar;
  const registrar = deps.registrar ?? (() => {});
  const prazo = agora() + (opcoes.tempoMaximoMs ?? 10 * 60_000);
  const maxCompras = opcoes.maxCompras ?? 1000;
  const pausaMs = opcoes.pausaMs ?? 800;
  const lote = opcoes.lote ?? 50;

  const resumo: ResumoDaLeitura = { lidas: 0, comExigencia: 0, comCitacao: 0, semTexto: 0, erros: 0, restantes: 0, interrompida: null };
  const vistas = new Set<string>();
  /** Falhas do PNCP ainda não gravadas: se o portal estiver fora do ar, não contam como tentativa. */
  let emEspera: LeituraParaGravar[] = [];

  const contar = (leitura: LeituraParaGravar) => {
    if (leitura.status === "erro") resumo.erros++;
    else if (leitura.status === "sem_texto") resumo.semTexto++;
    else {
      resumo.lidas++;
      if (leitura.alertas.some((a) => a.nivel === "exige")) resumo.comExigencia++;
      else if (leitura.alertas.length > 0) resumo.comCitacao++;
    }
  };

  laco: for (;;) {
    const { restantes, compras } = await deps.repositorio.pendentes(VERSAO_DAS_REGRAS, lote);
    resumo.restantes = restantes;
    const novas = compras.filter((c) => !vistas.has(c.compra_id));
    if (novas.length === 0) break;

    for (const pendente of novas) {
      if (vistas.size >= maxCompras) {
        resumo.interrompida = `limite de ${maxCompras} licitações por rodada`;
        break laco;
      }
      if (agora() >= prazo) {
        resumo.interrompida = "tempo da rodada esgotado";
        break laco;
      }
      if (vistas.size > 0) await pausa(pausaMs);
      vistas.add(pendente.compra_id);

      const { leitura, soFalhaTransitoria } = await lerUma(pendente, deps, pausaMs);
      if (soFalhaTransitoria) {
        emEspera.push(leitura);
        registrar(`editais: ${pendente.controle_pncp}: ${leitura.erro}`);
        if (emEspera.length >= FALHAS_PARA_PARAR) {
          resumo.interrompida = `o PNCP não entregou os arquivos de ${emEspera.length} licitações seguidas`;
          emEspera = [];
          break laco;
        }
        continue;
      }
      // O PNCP respondeu: as falhas isoladas de antes valem como tentativa.
      for (const anterior of [...emEspera, leitura]) {
        await deps.repositorio.gravar(anterior);
        contar(anterior);
      }
      emEspera = [];
    }
  }
  for (const anterior of emEspera) {
    await deps.repositorio.gravar(anterior);
    contar(anterior);
  }
  // Conta de novo o que ficou na fila, já sem o que foi gravado agora.
  resumo.restantes = (await deps.repositorio.pendentes(VERSAO_DAS_REGRAS, 1)).restantes;
  return resumo;
}
