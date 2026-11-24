// Uma rodada do coletor: descobre editais no PNCP, baixa os itens, mantém só o
// que é da área da saúde e atualiza situação e datas do que já conhecemos.

import { createHash } from "node:crypto";

import { prepararTexto } from "../src/lib/texto/normalizar";
import {
  assinaturaDaClassificacao,
  casarSegmentos,
  prepararSegmentos,
  type SegmentoPreparado,
} from "../src/lib/texto/segmentos";
import {
  mapearArquivo,
  mapearBusca,
  mapearContratacao,
  mapearItem,
  type ArquivoColetado,
  type CompraColetada,
} from "./mapear";
import { ErroPncp, type ClientePncp } from "./pncp";
import { resumirErro, type Gravacao, type ItemComSegmentos, type Repositorio, type TotaisDaRodada } from "./repositorio";

export type ConfiguracaoDaRodada = {
  origem: "agendado" | "manual";
  /** "auto" tenta a busca e cai no plano B se ela estiver fora do ar. */
  fonte: "auto" | "busca" | "plano_b";
  /** 6 = Pregão Eletrônico, 8 = Dispensa. */
  modalidades: number[];
  /** Só disputas de hoje até hoje + N dias. */
  diasAFrente: number;
  /** Requisições simultâneas ao PNCP (itens, arquivos, detalhe, plano B). */
  paralelas: number;
  /** Requisições simultâneas na busca, que derruba conexões quando recebe muitas seguidas. */
  paralelasNaBusca: number;
  /** Máximo de compras com itens baixados por rodada (o resto fica para a próxima). */
  maximoDeCompras: number;
  /** Máximo de compras já conhecidas conferidas no detalhe por rodada. */
  maximoDeVerificacoes: number;
  /** Tempo máximo da rodada; ao estourar, ela termina como "parcial". */
  tempoMaximoMs: number;
  /**
   * Tempo máximo da fase de busca (padrão: 60% do tempo da rodada). Sem esse teto, numa
   * noite ruim do PNCP a busca gastaria a rodada inteira e nenhum item seria baixado.
   */
  tempoMaximoDaBuscaMs?: number;
  /**
   * Retenção: apaga os itens das compras com disputa encerrada há mais de N dias que ninguém
   * aprovou (0 desliga). O banco recusa menos de 15 dias.
   */
  diasDeRetencao: number;
  /** Máximo de compras limpas pela retenção por rodada. */
  maximoDeRemocoes: number;
  /** Para testes e simulações: usa só os primeiros N termos. */
  limiteDeTermos?: number;
  agora?: () => Date;
  registrar?: (mensagem: string) => void;
};

export const CONFIGURACAO_PADRAO: ConfiguracaoDaRodada = {
  origem: "agendado",
  fonte: "auto",
  modalidades: [6, 8],
  diasAFrente: 30,
  paralelas: 4,
  paralelasNaBusca: 2,
  maximoDeCompras: 1500,
  maximoDeVerificacoes: 400,
  tempoMaximoMs: 45 * 60 * 1000,
  diasDeRetencao: 30,
  maximoDeRemocoes: 200,
};

const PAGINAS_POR_TERMO = 10;
const TAMANHO_DA_PAGINA = 100;
/** Se os primeiros termos falharem todos, a busca está fora do ar. */
const TERMOS_DE_SONDAGEM = 4;
/** De quantos em quantos termos a busca atualiza o andamento da rodada. */
const TERMOS_POR_ANDAMENTO = 25;
const MAXIMO_DE_ERROS_REGISTRADOS = 200;
/** Depois de tantas falhas seguidas ao baixar itens, a API está fora do ar: para de insistir. */
const FALHAS_SEGUIDAS_DE_ITENS = 5;
/** Depois de tantas gravações seguidas com erro, o banco está fora do ar: encerra a rodada. */
const FALHAS_SEGUIDAS_DE_BANCO = 5;

/** Executa `tarefa` para cada item, com no máximo `limite` ao mesmo tempo. */
export async function emParalelo<T>(
  itens: T[],
  limite: number,
  tarefa: (item: T, indice: number) => Promise<void>,
): Promise<void> {
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < itens.length) {
      const indice = proximo++;
      await tarefa(itens[indice], indice);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limite, itens.length)) }, trabalhador));
}

/** AAAAMMDD no fuso de Brasília. */
function diaDoPncp(data: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(data).replaceAll("-", "");
}

function etapaDaUrl(url: string): string {
  if (url.includes("/api/search")) return "busca";
  if (url.includes("/contratacoes/proposta")) return "plano_b";
  if (url.endsWith("/arquivos")) return "arquivos";
  if (url.includes("/itens")) return "itens";
  if (url.includes("/api/consulta/v1/orgaos/")) return "detalhe";
  return "pncp";
}

export async function executarRodada(
  pncp: ClientePncp,
  repositorio: Repositorio,
  configuracao: Partial<ConfiguracaoDaRodada> = {},
  /** Chamado pelo cliente do PNCP a cada falha definitiva (ver index.ts). */
  falhas: { url: string; status?: number; mensagem: string }[] = [],
): Promise<TotaisDaRodada> {
  const cfg = { ...CONFIGURACAO_PADRAO, ...configuracao };
  const agora = cfg.agora ?? (() => new Date());
  const registrar = cfg.registrar ?? ((mensagem: string) => console.log(mensagem));
  const inicio = agora();
  const prazo = inicio.getTime() + cfg.tempoMaximoMs;
  const semTempo = () => agora().getTime() > prazo;
  const prazoDaBusca =
    inicio.getTime() + Math.min(cfg.tempoMaximoDaBuscaMs ?? cfg.tempoMaximoMs * 0.6, cfg.tempoMaximoMs);
  const semTempoNaBusca = () => agora().getTime() > prazoDaBusca;

  const totais: TotaisDaRodada = {
    status: "sucesso",
    fonte: null,
    termos_buscados: 0,
    compras_encontradas: 0,
    compras_novas: 0,
    compras_atualizadas: 0,
    compras_descartadas: 0,
    compras_pendentes: 0,
    alteracoes: 0,
    erros: 0,
    mensagem: null,
  };

  const rodadaId = await repositorio.iniciarRodada(cfg.origem);
  let falhasRegistradas = 0;
  const descarregarFalhas = async () => {
    while (falhasRegistradas < falhas.length) {
      const falha = falhas[falhasRegistradas++];
      totais.erros++;
      if (totais.erros <= MAXIMO_DE_ERROS_REGISTRADOS) {
        await repositorio.registrarErro(rodadaId, {
          etapa: etapaDaUrl(falha.url),
          url: falha.url,
          status_http: falha.status,
          mensagem: falha.mensagem,
        });
      }
    }
  };
  const avisos: string[] = [];
  const andamento = async (fase: string) => {
    registrar(`fase: ${fase}`);
    await repositorio.registrarAndamento(rodadaId, totais, fase);
  };

  try {
    const segmentosBrutos = await repositorio.listarSegmentosAtivos();
    const segmentos = prepararSegmentos(segmentosBrutos);
    if (segmentos.every((s) => s.termos.length === 0)) {
      throw new Error("Nenhum segmento ativo com palavras-chave.");
    }
    // Identifica a regra de classificação em vigor. Compra classificada com outra regra
    // (segmento editado no admin, casamento de texto alterado) é classificada de novo.
    const versao = createHash("sha256").update(assinaturaDaClassificacao(segmentosBrutos)).digest("hex").slice(0, 16);

    const janelaInicio = inicio.toISOString();
    const janelaFim = new Date(inicio.getTime() + cfg.diasAFrente * 86_400_000).toISOString();
    const naJanela = (compra: CompraColetada) =>
      cfg.modalidades.includes(compra.modalidade_id) &&
      compra.data_disputa !== null &&
      compra.data_disputa >= janelaInicio &&
      compra.data_disputa <= janelaFim;

    // -----------------------------------------------------------------------
    // 1. Descoberta
    // -----------------------------------------------------------------------
    const candidatas = new Map<string, CompraColetada>();
    let buscaForaDoAr = cfg.fonte === "plano_b";
    let termosSemTempo = 0;

    if (cfg.fonte !== "plano_b") {
      const emOrdem = await termosDeBusca(repositorio, cfg.limiteDeTermos);
      // Cada rodada começa a lista de um ponto diferente: se o tempo da busca acabar, os
      // termos que ficam de fora não são sempre os mesmos.
      const giro = emOrdem.length > 0 ? (Math.floor(inicio.getTime() / 3_600_000) * 37) % emOrdem.length : 0;
      const termos = [...emOrdem.slice(giro), ...emOrdem.slice(0, giro)];
      await andamento(`buscando ${termos.length} termos no PNCP`);
      let termosComFalha = 0;
      const termosQueFalharam: string[] = [];

      const buscarTermo = async (termo: string) => {
        try {
          for (let pagina = 1; pagina <= PAGINAS_POR_TERMO; pagina++) {
            const resposta = await pncp.buscar(termo, pagina, cfg.modalidades, TAMANHO_DA_PAGINA);
            const itens = resposta?.items ?? [];
            for (const item of itens) {
              if (item.cancelado) continue;
              const compra = mapearBusca(item);
              if (compra && naJanela(compra)) candidatas.set(compra.controle_pncp, compra);
            }
            if (itens.length < TAMANHO_DA_PAGINA || pagina * TAMANHO_DA_PAGINA >= (resposta?.total ?? 0)) break;
          }
          totais.termos_buscados++;
        } catch (erro) {
          if (!(erro instanceof ErroPncp)) throw erro;
          termosComFalha++;
          termosQueFalharam.push(termo);
        }
      };

      // Sondagem: se os primeiros termos falharem todos, nem tenta os outros.
      const sondagem = termos.slice(0, TERMOS_DE_SONDAGEM);
      await emParalelo(sondagem, cfg.paralelasNaBusca, buscarTermo);
      if (sondagem.length > 0 && termosComFalha === sondagem.length) {
        buscaForaDoAr = true;
        avisos.push("A busca do PNCP está fora do ar; usei o plano B.");
      } else {
        let tentados = sondagem.length;
        await emParalelo(termos.slice(TERMOS_DE_SONDAGEM), cfg.paralelasNaBusca, async (termo) => {
          if (semTempoNaBusca()) {
            termosSemTempo++;
            return;
          }
          await buscarTermo(termo);
          tentados++;
          if (tentados % TERMOS_POR_ANDAMENTO === 0) {
            await andamento(`buscando termos no PNCP: ${tentados} de ${termos.length}`);
          }
        });
        // Segunda passada, uma chamada por vez, nos termos que falharam: as quedas de
        // conexão do PNCP costumam vir em rajadas e passar em seguida.
        if (termosQueFalharam.length > 0 && !semTempoNaBusca()) {
          const repetir = termosQueFalharam.splice(0);
          termosComFalha = 0;
          falhas.length = falhasRegistradas; // só conta como erro o que falhar de novo
          await andamento(`repetindo ${repetir.length} termos que falharam na busca`);
          await emParalelo(repetir, 1, async (termo) => {
            if (semTempoNaBusca()) termosComFalha++;
            else await buscarTermo(termo);
          });
        }
        totais.fonte = "busca";
        if (termosComFalha > 0) avisos.push(`${termosComFalha} de ${termos.length} termos falharam na busca.`);
        if (termosSemTempo > 0) {
          avisos.push(
            `O tempo da busca acabou: ${termosSemTempo} de ${termos.length} termos ficaram para a próxima rodada.`,
          );
        }
        // Muita falha na busca: complementa com o plano B.
        if (termosComFalha > termos.length * 0.4 && cfg.fonte === "auto") buscaForaDoAr = true;
      }
      registrar(`busca: ${totais.termos_buscados}/${termos.length} termos, ${candidatas.size} editais na janela`);
    }

    if (buscaForaDoAr && cfg.fonte !== "busca") {
      totais.fonte = "plano_b";
      await andamento("busca fora do ar; listando todas as contratações abertas (plano B)");
      const antes = candidatas.size;
      await planoB(pncp, cfg, janelaFim, naJanela, segmentos, candidatas, semTempo);
      registrar(`plano B: ${candidatas.size - antes} editais pelo objeto`);
    }
    await descarregarFalhas();
    totais.compras_encontradas = candidatas.size;
    await andamento(`baixando itens de ${candidatas.size} editais`);

    // -----------------------------------------------------------------------
    // 2. Itens e filtro "área da saúde"
    // -----------------------------------------------------------------------
    const conhecidas = await repositorio.buscarConhecidas([...candidatas.keys()]);
    // As disputas mais próximas primeiro: se o tempo acabar, ficam as mais distantes.
    const fila = [...candidatas.values()].sort((a, b) =>
      (a.data_disputa ?? "").localeCompare(b.data_disputa ?? ""),
    );
    let baixadas = 0;
    let falhasSeguidasDeItens = 0;
    const itensForaDoAr = () => falhasSeguidasDeItens >= FALHAS_SEGUIDAS_DE_ITENS;

    const contar = (gravacao: { resultado: string; alteracoes: number } | null) => {
      if (!gravacao) return;
      if (gravacao.resultado === "nova") totais.compras_novas++;
      else if (gravacao.resultado === "atualizada") totais.compras_atualizadas++;
      totais.alteracoes += gravacao.alteracoes;
    };

    // Uma gravação que falha (já depois das retentativas) não derruba a rodada:
    // a compra fica para a próxima. Só desiste se o banco falhar várias vezes seguidas.
    let falhasSeguidasDeBanco = 0;
    const gravar = async (gravacao: Gravacao) => {
      try {
        const resultado = await repositorio.gravarCompra(gravacao);
        falhasSeguidasDeBanco = 0;
        return resultado;
      } catch (erro) {
        falhasSeguidasDeBanco++;
        totais.erros++;
        const mensagem = resumirErro(erro instanceof Error ? erro.message : String(erro));
        if (totais.erros <= MAXIMO_DE_ERROS_REGISTRADOS) {
          await repositorio.registrarErro(rodadaId, { etapa: "banco", mensagem });
        }
        if (falhasSeguidasDeBanco >= FALHAS_SEGUIDAS_DE_BANCO) {
          throw new Error(`O banco falhou ${falhasSeguidasDeBanco} vezes seguidas. Última falha: ${mensagem}`);
        }
        return null;
      }
    };

    const processar = async (compra: CompraColetada, forcarItens = false) => {
      const conhecida = conhecidas.get(compra.controle_pncp);
      const retificada =
        !!conhecida?.itens_coletados_em &&
        !!compra.pncp_atualizado_em &&
        compra.pncp_atualizado_em > conhecida.itens_coletados_em;
      const regraMudou = !!conhecida && conhecida.area_saude !== null && conhecida.classificacao_versao !== versao;
      // A retenção apagou os itens e a disputa foi remarcada para a frente: baixa de novo.
      const semItens = !!conhecida?.itens_removidos_em && conhecida.area_saude === true;
      const precisaDosItens =
        forcarItens || !conhecida || conhecida.area_saude === null || retificada || regraMudou || semItens;

      if (!precisaDosItens) {
        // Fora da saúde e sem novidade: não há o que gravar.
        if (conhecida.area_saude === false) return;
        contar(await gravar({ compra }));
        return;
      }

      if (baixadas >= cfg.maximoDeCompras || semTempo() || itensForaDoAr()) {
        totais.compras_pendentes++;
        // Sem os itens novos, grava só o cabeçalho; o que já estava classificado continua
        // valendo até a próxima rodada.
        if (!conhecida || conhecida.area_saude !== false) contar(await gravar({ compra }));
        return;
      }
      baixadas++;

      let itens: ItemComSegmentos[];
      try {
        const brutos = await pncp.itens(compra.orgao_cnpj, compra.ano, compra.sequencial);
        itens = brutos.flatMap((bruto) => {
          const item = mapearItem(bruto);
          if (!item) return [];
          // Na descrição de um item tudo se refere ao mesmo produto: não exige proximidade.
          const casamentos = casarSegmentos(prepararTexto(item.descricao), segmentos, { proximas: false });
          return [{ ...item, segmento_ids: casamentos.map((c) => c.segmentoId) }];
        });
        falhasSeguidasDeItens = 0;
      } catch (erro) {
        if (!(erro instanceof ErroPncp)) throw erro;
        falhasSeguidasDeItens++;
        totais.compras_pendentes++;
        contar(await gravar({ compra, falhaItens: true }));
        return;
      }

      const segmentoIds = [...new Set(itens.flatMap((item) => item.segmento_ids))];
      const areaSaude = segmentoIds.length > 0;
      let arquivos: ArquivoColetado[] | undefined;
      if (areaSaude) {
        try {
          const brutos = await pncp.arquivos(compra.orgao_cnpj, compra.ano, compra.sequencial);
          arquivos = brutos.flatMap((bruto) => mapearArquivo(bruto) ?? []);
        } catch (erro) {
          if (!(erro instanceof ErroPncp)) throw erro;
          // Sem a lista de arquivos a compra entra assim mesmo; a lista vem numa próxima rodada.
        }
      } else {
        totais.compras_descartadas++;
      }

      const gravacao = await gravar({
        compra,
        classificacao: { area_saude: areaSaude, segmento_ids: segmentoIds, versao },
        // Fora da saúde não guardamos os itens: a linha serve só para não baixar de novo.
        itens: areaSaude ? itens : [],
        arquivos,
      });
      if (areaSaude || gravacao?.resultado !== "nova") contar(gravacao);
    };

    await emParalelo(fila, cfg.paralelas, (compra) => processar(compra));
    await descarregarFalhas();
    registrar(
      `itens: ${baixadas} compras baixadas, ${totais.compras_descartadas} fora da saúde, ${totais.compras_pendentes} pendentes`,
    );

    // -----------------------------------------------------------------------
    // 3. Compras que já conhecemos e não apareceram nesta rodada
    //    (suspensas e revogadas saem da busca de "recebendo proposta")
    // -----------------------------------------------------------------------
    await andamento("conferindo editais já conhecidos");
    const ontem = new Date(inicio.getTime() - 86_400_000).toISOString();
    const revisitar = async (
      lista: { controle_pncp: string; orgao_cnpj: string; ano: number; sequencial: number }[],
      comItens: boolean,
    ) => {
      await emParalelo(lista, cfg.paralelas, async (conhecida) => {
        if (semTempo() || candidatas.has(conhecida.controle_pncp)) return;
        if (comItens && itensForaDoAr()) return;
        try {
          const detalhe = await pncp.detalhe(conhecida.orgao_cnpj, conhecida.ano, conhecida.sequencial);
          const compra = detalhe ? mapearContratacao(detalhe) : null;
          if (!compra) return;
          if (comItens) await processar(compra, true);
          else contar(await gravar({ compra }));
        } catch (erro) {
          if (!(erro instanceof ErroPncp)) throw erro;
        }
      });
    };

    const pendentes = await repositorio.listarPendentes(janelaInicio, janelaInicio, cfg.maximoDeVerificacoes);
    for (const pendente of pendentes) {
      conhecidas.set(pendente.controle_pncp, {
        controle_pncp: pendente.controle_pncp,
        area_saude: null,
        itens_coletados_em: null,
        tentativas_itens: 0,
        classificacao_versao: null,
      });
    }
    await revisitar(pendentes, true);
    const paraVerificar = await repositorio.listarParaVerificar(ontem, janelaInicio, cfg.maximoDeVerificacoes);
    await revisitar(paraVerificar, false);
    await descarregarFalhas();
    registrar(`verificação: ${paraVerificar.length} conferidas no detalhe, ${pendentes.length} pendentes revisitadas`);

    if (itensForaDoAr()) avisos.push("A API de itens do PNCP está fora do ar.");
    if (semTempo()) avisos.push("O tempo máximo da rodada acabou; o restante fica para a próxima.");
    if (totais.compras_pendentes > 0) {
      avisos.push(`${totais.compras_pendentes} compras ficaram com itens pendentes.`);
    }
    totais.status = totais.erros > 0 || semTempo() || termosSemTempo > 0 ? "parcial" : "sucesso";
    if (totais.fonte === null || (totais.compras_encontradas === 0 && totais.erros > 0)) {
      totais.status = "erro";
      avisos.unshift("Não foi possível consultar o PNCP nesta rodada.");
    }
  } catch (erro) {
    await descarregarFalhas();
    totais.status = "erro";
    totais.erros++;
    const mensagem = resumirErro(erro instanceof Error ? erro.message : String(erro));
    avisos.unshift(mensagem);
    await repositorio.registrarErro(rodadaId, { etapa: "rodada", mensagem });
  }

  // Retenção: independe do PNCP e nunca muda o resultado da rodada.
  if (cfg.diasDeRetencao > 0) {
    try {
      const removidos = await repositorio.removerItensAntigos(cfg.diasDeRetencao, cfg.maximoDeRemocoes);
      if (removidos.compras > 0) {
        registrar(
          `retenção: ${removidos.itens} itens apagados de ${removidos.compras} compras ` +
            `com disputa encerrada há mais de ${cfg.diasDeRetencao} dias`,
        );
      }
    } catch (erro) {
      const mensagem = resumirErro(erro instanceof Error ? erro.message : String(erro));
      registrar(`retenção falhou: ${mensagem}`);
      try {
        await repositorio.registrarErro(rodadaId, { etapa: "retencao", mensagem });
      } catch {
        // O registro do erro é só informativo.
      }
    }
  }

  totais.mensagem = avisos.length > 0 ? avisos.join(" ") : null;
  await repositorio.finalizarRodada(rodadaId, totais);
  registrar(`rodada ${totais.status}: ${JSON.stringify(totais)}`);
  return totais;
}

/** Palavras-chave de todos os segmentos ativos, sem repetição. */
async function termosDeBusca(repositorio: Repositorio, limite?: number): Promise<string[]> {
  const segmentos = await repositorio.listarSegmentosAtivos();
  const termos = new Set<string>();
  for (const segmento of segmentos) {
    for (const palavra of segmento.palavras_chave) {
      const termo = palavra.replace(/\s+/g, " ").trim().toLowerCase();
      if (termo) termos.add(termo);
    }
  }
  const lista = [...termos].sort();
  return limite ? lista.slice(0, limite) : lista;
}

/**
 * Plano B: lista todas as contratações com proposta aberta e mantém as que têm,
 * no objeto, algum termo de segmento. É mais pesado e menos preciso que a busca
 * (não enxerga a descrição dos itens), por isso só entra quando a busca falha.
 */
async function planoB(
  pncp: ClientePncp,
  cfg: ConfiguracaoDaRodada,
  janelaFim: string,
  naJanela: (compra: CompraColetada) => boolean,
  segmentos: SegmentoPreparado[],
  candidatas: Map<string, CompraColetada>,
  semTempo: () => boolean,
) {
  const dataFinal = diaDoPncp(new Date(janelaFim));
  for (const modalidade of cfg.modalidades) {
    let totalDePaginas = 1;
    try {
      const primeira = await pncp.listarPropostasAbertas(modalidade, dataFinal, 1);
      totalDePaginas = primeira?.totalPaginas ?? 0;
      aproveitar(primeira?.data ?? []);
    } catch (erro) {
      if (!(erro instanceof ErroPncp)) throw erro;
      continue;
    }
    const paginas = Array.from({ length: Math.max(0, totalDePaginas - 1) }, (_, i) => i + 2);
    await emParalelo(paginas, cfg.paralelas, async (pagina) => {
      if (semTempo()) return;
      try {
        const resposta = await pncp.listarPropostasAbertas(modalidade, dataFinal, pagina);
        aproveitar(resposta?.data ?? []);
      } catch (erro) {
        if (!(erro instanceof ErroPncp)) throw erro;
      }
    });
  }

  function aproveitar(contratacoes: Parameters<typeof mapearContratacao>[0][]) {
    for (const contratacao of contratacoes) {
      const compra = mapearContratacao(contratacao);
      if (!compra || !naJanela(compra) || candidatas.has(compra.controle_pncp)) continue;
      if (casarSegmentos(compra.objeto, segmentos).length > 0) candidatas.set(compra.controle_pncp, compra);
    }
  }
}
