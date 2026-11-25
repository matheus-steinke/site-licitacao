// Leva uma oportunidade para o Google: evento na agenda e pastas no Drive, com os arquivos do
// edital. Chamado pelo app (ao aprovar, ao desfazer e pelo botão "Sincronizar") e pelo coletor
// (a cada rodada, para acompanhar mudanças de data e terminar envios pendentes).
//
// Regras:
//   - aprovada: cria o que falta e atualiza o evento quando a data ou o conteúdo mudam;
//   - voltou a ser nova ou foi descartada: remove o evento (as pastas ficam, podem ter documentos);
//   - ganha ou perdida: nada novo é criado; envios pendentes de arquivos são terminados.
// Para não duplicar, o vínculo é reservado no banco antes de criar qualquer coisa no Google.

import { ArquivoGrandeDemais, type ArquivoBaixado } from "./arquivos";
import {
  assinaturaDoEvento,
  montarEvento,
  nomeDaPasta,
  nomeDaPastaDoMes,
  PASTA_DOS_ARQUIVOS,
  SUBPASTAS,
  type LicitacaoParaIntegrar,
} from "./conteudo";
import { ErroDeAcesso, ESCOPO_AGENDA, ESCOPO_DRIVE } from "./google/oauth";
import { ErroDoGoogle, naoExiste, type ServicoGoogle } from "./google/servico";

export type Integracao = {
  id: string;
  conta: string | null;
  credenciais: string;
  escopos: string[];
  agendaAtiva: boolean;
  agendaId: string;
  driveAtivo: boolean;
  pastaRaizNome: string;
  pastaRaizId: string | null;
  automatico: boolean;
  erro: string | null;
};

export type ArquivoDoEdital = { id: string; sequencial: number; titulo: string | null; url: string };

export type OportunidadeParaIntegrar = {
  status: "nova" | "aprovada" | "descartada" | "ganha" | "perdida";
  licitacao: LicitacaoParaIntegrar;
  arquivos: ArquivoDoEdital[];
};

export type DadosDoEvento = { data_disputa?: string; assinatura?: string; agenda_id?: string };
export type ArquivoNoDrive = { id?: string; nome?: string; erro?: string; tentativas?: number; grande?: boolean };
export type DadosDaPasta = { mes_id?: string; subpastas?: Record<string, string>; arquivos?: Record<string, ArquivoNoDrive> };

export type Vinculo = {
  id: string;
  tipo: "evento" | "pasta";
  idExterno: string | null;
  link: string | null;
  dados: DadosDoEvento & DadosDaPasta;
  situacao: "ok" | "pendente" | "erro";
  erro: string | null;
  /** ISO. */
  atualizadoEm: string;
};

export type CamposDoVinculo = Partial<Pick<Vinculo, "idExterno" | "link" | "dados" | "situacao" | "erro">>;

/** Acesso ao banco, com a sessão do usuário (app) ou a chave de serviço (coletor). */
export interface Armazenamento {
  carregarIntegracao(orgId: string): Promise<Integracao | null>;
  carregarOportunidade(orgId: string, oportunidadeId: string): Promise<OportunidadeParaIntegrar | null>;
  listarVinculos(orgId: string, oportunidadeId: string): Promise<Vinculo[]>;
  /** Cria o vínculo como "pendente" ou devolve o que já existe. */
  reservarVinculo(orgId: string, oportunidadeId: string, tipo: Vinculo["tipo"]): Promise<{ vinculo: Vinculo; novo: boolean }>;
  salvarVinculo(id: string, campos: CamposDoVinculo): Promise<void>;
  removerVinculo(id: string): Promise<void>;
  registrarEstado(integracaoId: string, estado: { pastaRaizId?: string | null; erro?: string | null }): Promise<void>;
  /** Oportunidades da organização que podem ter algo a fazer (para o coletor). */
  listarCandidatas(orgId: string, disputaDesde: string): Promise<string[]>;
}

export type GoogleDaSincronizacao = Pick<
  ServicoGoogle,
  "criarEvento" | "atualizarEvento" | "removerEvento" | "criarPasta" | "pastaExiste" | "buscarPasta" | "enviarArquivo"
>;

export type Dependencias = {
  armazenamento: Armazenamento;
  /** Renova o acesso e devolve o cliente do Google. Lança ErroDeAcesso se a conta foi desligada. */
  abrirGoogle: (integracao: Integracao) => Promise<GoogleDaSincronizacao>;
  baixar: (arquivo: ArquivoDoEdital, limiteBytes: number) => Promise<ArquivoBaixado>;
  /** Link da oportunidade no app, para a descrição do evento. */
  linkDoApp?: (oportunidadeId: string) => string | null;
  agora?: () => number;
  /** Maior arquivo que vale baixar para a memória. */
  limiteDoArquivoBytes?: number;
};

export type OpcoesDaSincronizacao = {
  /** Pedido pelo usuário (botão): cria mesmo com o "automático" desligado e refaz o que sumiu. */
  manual?: boolean;
  /** Instante (ms) a partir do qual nenhum arquivo novo começa a ser enviado. */
  prazo?: number;
  /** Só evento e pastas; os arquivos ficam para depois. */
  semArquivos?: boolean;
};

export type ResultadoDaSincronizacao = {
  evento: "criado" | "atualizado" | "removido" | "igual" | "ignorado" | "erro";
  pasta: "criada" | "igual" | "ignorada" | "erro";
  arquivos: { enviados: number; pendentes: number; falhas: number };
  /** A conta foi desligada no Google: é preciso conectar de novo. */
  erroDeAcesso: string | null;
  erros: string[];
};

export const MENSAGEM_DE_ACESSO = "O acesso ao Google expirou ou foi revogado. Conecte a conta de novo em Integrações.";
const TENTATIVAS_POR_ARQUIVO = 3;
/** Reserva recente sem resultado: outra sincronização está no meio do caminho. */
const RESERVA_EM_ANDAMENTO_MS = 90_000;
const LIMITE_PADRAO_DO_ARQUIVO = 40 * 1_048_576;

function explicar(erro: unknown, contexto: "agenda" | "drive"): string {
  if (erro instanceof ErroDoGoogle) {
    if (contexto === "agenda" && naoExiste(erro)) return "Agenda não encontrada. Confira o ID da agenda em Integrações.";
    if (erro.status === 403) {
      return contexto === "agenda"
        ? "O Google negou o acesso à agenda. Confira se a conta conectada pode criar eventos nela."
        : "O Google negou o acesso ao Drive (permissão ou espaço).";
    }
    return `O Google respondeu com erro (${erro.status}): ${erro.message}`;
  }
  return erro instanceof Error ? erro.message : String(erro);
}

export async function sincronizarOportunidade(
  deps: Dependencias,
  orgId: string,
  oportunidadeId: string,
  opcoes: OpcoesDaSincronizacao = {},
): Promise<ResultadoDaSincronizacao> {
  const resultado: ResultadoDaSincronizacao = {
    evento: "ignorado",
    pasta: "ignorada",
    arquivos: { enviados: 0, pendentes: 0, falhas: 0 },
    erroDeAcesso: null,
    erros: [],
  };
  const { armazenamento } = deps;
  const agora = (deps.agora ?? Date.now)();
  const manual = opcoes.manual === true;

  const integracao = await armazenamento.carregarIntegracao(orgId);
  if (!integracao) return resultado;
  // Conta desligada: o coletor não insiste a cada rodada; o botão tenta de novo.
  if (integracao.erro && !manual) {
    resultado.erroDeAcesso = integracao.erro;
    return resultado;
  }
  const op = await armazenamento.carregarOportunidade(orgId, oportunidadeId);
  if (!op) return resultado;
  const vinculos = await armazenamento.listarVinculos(orgId, oportunidadeId);
  let vEvento = vinculos.find((v) => v.tipo === "evento") ?? null;
  let vPasta = vinculos.find((v) => v.tipo === "pasta") ?? null;

  let google: GoogleDaSincronizacao | null = null;
  const abrir = async () => {
    if (!google) {
      google = await deps.abrirGoogle(integracao);
      if (integracao.erro) {
        await armazenamento.registrarEstado(integracao.id, { erro: null });
        integracao.erro = null;
      }
    }
    return google;
  };
  const emAndamento = (v: Vinculo, novo: boolean) =>
    !novo && !v.idExterno && v.situacao === "pendente" && agora - new Date(v.atualizadoEm).getTime() < RESERVA_EM_ANDAMENTO_MS;

  const licitacao = op.licitacao;
  const disputa = licitacao.dataDisputa ? new Date(licitacao.dataDisputa).getTime() : null;
  const futura = disputa !== null && disputa >= agora;
  const podeCriar = op.status === "aprovada" && (manual || (integracao.automatico && futura));

  try {
    // ------------------------------------------------------------------ Agenda
    const temAgenda = integracao.agendaAtiva && integracao.escopos.includes(ESCOPO_AGENDA);
    try {
      if (op.status === "nova" || op.status === "descartada") {
        if (vEvento) {
          if (vEvento.idExterno) {
            await (await abrir()).removerEvento(vEvento.dados.agenda_id ?? integracao.agendaId, vEvento.idExterno);
          }
          await armazenamento.removerVinculo(vEvento.id);
          resultado.evento = "removido";
        }
      } else if (op.status === "aprovada" && temAgenda) {
        const evento = montarEvento(licitacao, deps.linkDoApp?.(oportunidadeId) ?? null);
        if (!evento) {
          if (manual) throw new Error("A licitação está sem data de disputa: não há como criar o evento.");
        } else {
          const assinatura = assinaturaDoEvento(evento);
          const dados = (criado: { agenda: string }): DadosDoEvento => ({
            data_disputa: licitacao.dataDisputa ?? undefined,
            assinatura,
            agenda_id: criado.agenda,
          });
          if (vEvento?.idExterno) {
            if (vEvento.dados.assinatura === assinatura && vEvento.situacao === "ok") {
              resultado.evento = "igual";
            } else {
              const agenda = vEvento.dados.agenda_id ?? integracao.agendaId;
              try {
                const alterado = await (await abrir()).atualizarEvento(agenda, vEvento.idExterno, evento);
                await armazenamento.salvarVinculo(vEvento.id, {
                  link: alterado.link ?? vEvento.link,
                  dados: dados({ agenda }),
                  situacao: "ok",
                  erro: null,
                });
                resultado.evento = "atualizado";
              } catch (erro) {
                if (!naoExiste(erro)) throw erro;
                // O evento (ou a agenda antiga) não existe mais: cria outro na agenda atual.
                const criado = await (await abrir()).criarEvento(integracao.agendaId, evento);
                await armazenamento.salvarVinculo(vEvento.id, {
                  idExterno: criado.id,
                  link: criado.link,
                  dados: dados({ agenda: integracao.agendaId }),
                  situacao: "ok",
                  erro: null,
                });
                resultado.evento = "criado";
              }
            }
          } else if (podeCriar) {
            const reserva = await armazenamento.reservarVinculo(orgId, oportunidadeId, "evento");
            vEvento = reserva.vinculo;
            if (vEvento.idExterno) {
              resultado.evento = "igual";
            } else if (!emAndamento(vEvento, reserva.novo)) {
              const criado = await (await abrir()).criarEvento(integracao.agendaId, evento);
              await armazenamento.salvarVinculo(vEvento.id, {
                idExterno: criado.id,
                link: criado.link,
                dados: dados({ agenda: integracao.agendaId }),
                situacao: "ok",
                erro: null,
              });
              resultado.evento = "criado";
            }
          }
        }
      }
    } catch (erro) {
      if (erro instanceof ErroDeAcesso) throw erro;
      const mensagem = explicar(erro, "agenda");
      resultado.evento = "erro";
      resultado.erros.push(`Agenda: ${mensagem}`);
      if (vEvento) await armazenamento.salvarVinculo(vEvento.id, { situacao: "erro", erro: mensagem });
    }

    // ------------------------------------------------------------------- Drive
    const temDrive = integracao.driveAtivo && integracao.escopos.includes(ESCOPO_DRIVE);
    const decidida = op.status === "aprovada" || op.status === "ganha" || op.status === "perdida";
    if (temDrive && decidida) {
      try {
        // Pelo botão, uma pasta que o usuário apagou do Drive é refeita do zero.
        let refazer = false;
        if (manual && vPasta?.idExterno && !(await (await abrir()).pastaExiste(vPasta.idExterno))) {
          await armazenamento.salvarVinculo(vPasta.id, { idExterno: null, link: null, dados: {}, situacao: "pendente", erro: null });
          vPasta = { ...vPasta, idExterno: null, link: null, dados: {}, situacao: "pendente" };
          refazer = true;
        }

        if (!vPasta?.idExterno && podeCriar) {
          if (!licitacao.dataDisputa) throw new Error("A licitação está sem data de disputa: não há como escolher a pasta do mês.");
          const reserva = await armazenamento.reservarVinculo(orgId, oportunidadeId, "pasta");
          vPasta = reserva.vinculo;
          if (!vPasta.idExterno && (refazer || !emAndamento(vPasta, reserva.novo))) {
            const drive = await abrir();
            if (!integracao.pastaRaizId || !(await drive.pastaExiste(integracao.pastaRaizId))) {
              const raiz = await drive.criarPasta(integracao.pastaRaizNome, null);
              await armazenamento.registrarEstado(integracao.id, { pastaRaizId: raiz.id });
              integracao.pastaRaizId = raiz.id;
            }
            const nomeDoMes = nomeDaPastaDoMes(licitacao.dataDisputa);
            const mes =
              (await drive.buscarPasta(nomeDoMes, integracao.pastaRaizId)) ??
              (await drive.criarPasta(nomeDoMes, integracao.pastaRaizId));
            const principal = await drive.criarPasta(nomeDaPasta(licitacao), mes.id);
            const dados: DadosDaPasta = { mes_id: mes.id, subpastas: {}, arquivos: {} };
            await armazenamento.salvarVinculo(vPasta.id, {
              idExterno: principal.id,
              link: principal.link,
              dados,
              situacao: "pendente",
              erro: null,
            });
            vPasta = { ...vPasta, idExterno: principal.id, link: principal.link, dados, situacao: "pendente" };
            resultado.pasta = "criada";
          }
        }

        if (vPasta?.idExterno) {
          if (resultado.pasta !== "criada") resultado.pasta = "igual";
          const dados: DadosDaPasta = {
            mes_id: vPasta.dados.mes_id,
            subpastas: { ...(vPasta.dados.subpastas ?? {}) },
            arquivos: { ...(vPasta.dados.arquivos ?? {}) },
          };
          const subpastas = dados.subpastas as Record<string, string>;
          const arquivos = dados.arquivos as Record<string, ArquivoNoDrive>;
          let mudou = false;

          const faltam = SUBPASTAS.filter((nome) => !subpastas[nome]);
          if (faltam.length > 0) {
            // As cinco de uma vez: é o que mais pesa no tempo de resposta ao aprovar.
            const drive = await abrir();
            const principalId = vPasta.idExterno;
            const criadas = await Promise.all(faltam.map((nome) => drive.criarPasta(nome, principalId)));
            faltam.forEach((nome, i) => {
              subpastas[nome] = criadas[i].id;
            });
            mudou = true;
          }
          if (mudou) await armazenamento.salvarVinculo(vPasta.id, { dados });

          const limite = deps.limiteDoArquivoBytes ?? LIMITE_PADRAO_DO_ARQUIVO;
          for (const arquivo of op.arquivos) {
            const estado = arquivos[arquivo.id];
            if (estado?.id) continue;
            if (estado?.grande || (estado?.tentativas ?? 0) >= TENTATIVAS_POR_ARQUIVO) {
              resultado.arquivos.falhas++;
              continue;
            }
            if (opcoes.semArquivos || (opcoes.prazo !== undefined && (deps.agora ?? Date.now)() >= opcoes.prazo)) {
              resultado.arquivos.pendentes++;
              continue;
            }
            const nome = arquivo.titulo ?? `Arquivo ${arquivo.sequencial}`;
            try {
              const baixado = await deps.baixar(arquivo, limite);
              const enviado = await (await abrir()).enviarArquivo(baixado.nome, baixado.tipo, baixado.conteudo, subpastas[PASTA_DOS_ARQUIVOS]);
              arquivos[arquivo.id] = { id: enviado.id, nome: enviado.nome };
              resultado.arquivos.enviados++;
            } catch (erro) {
              if (erro instanceof ErroDeAcesso) throw erro;
              if (erro instanceof ArquivoGrandeDemais) {
                arquivos[arquivo.id] = { nome, grande: true, erro: `${erro.message} Baixe pelo PNCP.` };
                resultado.arquivos.falhas++;
              } else {
                const tentativas = (estado?.tentativas ?? 0) + 1;
                arquivos[arquivo.id] = { nome, tentativas, erro: explicar(erro, "drive") };
                if (tentativas >= TENTATIVAS_POR_ARQUIVO) resultado.arquivos.falhas++;
                else resultado.arquivos.pendentes++;
              }
            }
            await armazenamento.salvarVinculo(vPasta.id, { dados });
          }

          const situacao = resultado.arquivos.pendentes > 0 ? "pendente" : "ok";
          if (situacao !== vPasta.situacao || vPasta.erro) {
            await armazenamento.salvarVinculo(vPasta.id, { dados, situacao, erro: null });
          }
        }
      } catch (erro) {
        if (erro instanceof ErroDeAcesso) throw erro;
        const mensagem = explicar(erro, "drive");
        resultado.pasta = "erro";
        resultado.erros.push(`Drive: ${mensagem}`);
        if (vPasta) await armazenamento.salvarVinculo(vPasta.id, { situacao: "erro", erro: mensagem });
      }
    }
  } catch (erro) {
    if (!(erro instanceof ErroDeAcesso)) throw erro;
    resultado.erroDeAcesso = MENSAGEM_DE_ACESSO;
    await armazenamento.registrarEstado(integracao.id, { erro: MENSAGEM_DE_ACESSO });
    // O que ficou reservado sem ser criado não está "em andamento": falhou.
    for (const reservado of [vEvento, vPasta]) {
      if (reservado && !reservado.idExterno) {
        await armazenamento.salvarVinculo(reservado.id, { situacao: "erro", erro: MENSAGEM_DE_ACESSO });
      }
    }
  }
  return resultado;
}

export type ResultadoDaOrganizacao = {
  conferidas: number;
  eventos: { criados: number; atualizados: number; removidos: number };
  pastas: number;
  arquivos: number;
  erros: string[];
  erroDeAcesso: string | null;
};

/** Para o coletor: confere todas as oportunidades da organização que podem ter algo a fazer. */
export async function sincronizarOrganizacao(
  deps: Dependencias,
  orgId: string,
  opcoes: { prazo?: number } = {},
): Promise<ResultadoDaOrganizacao> {
  const agora = deps.agora ?? Date.now;
  const total: ResultadoDaOrganizacao = {
    conferidas: 0,
    eventos: { criados: 0, atualizados: 0, removidos: 0 },
    pastas: 0,
    arquivos: 0,
    erros: [],
    erroDeAcesso: null,
  };
  const integracao = await deps.armazenamento.carregarIntegracao(orgId);
  if (!integracao) return total;
  if (integracao.erro) {
    total.erroDeAcesso = integracao.erro;
    return total;
  }

  // Um dia para trás: a disputa de hoje cedo ainda pode ter arquivos por enviar.
  const desde = new Date(agora() - 86_400_000).toISOString();
  for (const oportunidadeId of await deps.armazenamento.listarCandidatas(orgId, desde)) {
    if (opcoes.prazo !== undefined && agora() >= opcoes.prazo) break;
    const r = await sincronizarOportunidade(deps, orgId, oportunidadeId, { prazo: opcoes.prazo });
    total.conferidas++;
    if (r.evento === "criado") total.eventos.criados++;
    if (r.evento === "atualizado") total.eventos.atualizados++;
    if (r.evento === "removido") total.eventos.removidos++;
    if (r.pasta === "criada") total.pastas++;
    total.arquivos += r.arquivos.enviados;
    total.erros.push(...r.erros);
    if (r.erroDeAcesso) {
      total.erroDeAcesso = r.erroDeAcesso;
      break;
    }
  }
  return total;
}
