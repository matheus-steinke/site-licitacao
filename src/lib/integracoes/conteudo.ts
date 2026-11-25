// O que vai para a agenda e para o Drive: título e descrição do evento, nomes das pastas.
// Sem rede e sem banco: serve à sincronização e aos testes.

import { createHash } from "node:crypto";

import { FUSO } from "../app";

export type ItemParaIntegrar = {
  numero: number;
  descricao: string;
  quantidade: number | null;
  unidade: string | null;
  nivel: "compativel" | "verificar";
  /** "código - nome" do produto do catálogo. */
  produto: string;
};

export type LicitacaoParaIntegrar = {
  oportunidadeId: string;
  numeroCompra: string | null;
  ano: number;
  /** Nome da modalidade no PNCP ("Pregão - Eletrônico", "Dispensa"). */
  modalidade: string;
  orgao: string;
  objeto: string;
  uf: string;
  municipio: string | null;
  /** ISO, com fuso. */
  dataDisputa: string | null;
  /** Nome da situação quando não é a normal ("Suspensa", "Revogada"...); null = divulgada. */
  situacao: string | null;
  linkPncp: string | null;
  itens: ItemParaIntegrar[];
  /** Alertas da triagem, já em texto. */
  alertas: string[];
};

export const SUBPASTAS = [
  "0. Planejamento",
  "1. Edital e Anexos",
  "2. Habilitação",
  "3. Proposta atualizada",
  "4. Resultados",
] as const;
export const PASTA_DOS_ARQUIVOS = SUBPASTAS[1];

const MAXIMO_DE_ITENS_NA_DESCRICAO = 40;
const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const partesDaData = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" });
const numero = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });

/** Ano, mês e dia no horário de Brasília. */
function diaEmBrasilia(iso: string): { ano: string; mes: string; dia: string } {
  const [ano, mes, dia] = partesDaData.format(new Date(iso)).split("-");
  return { ano, mes, dia };
}

/** "PE" para pregão (como na especificação); as outras modalidades vão pelo nome. */
export function siglaDaModalidade(modalidade: string): string {
  if (/preg[aã]o/i.test(modalidade)) return "PE";
  if (/dispensa/i.test(modalidade)) return "Dispensa";
  return modalidade.trim() || "Licitação";
}

/**
 * "780" + 2026 vira "780/2026". Quando o número do PNCP já traz o ano ("0975/26",
 * "90001/2026"), fica como está. O separador muda para "." nos nomes de pasta.
 */
export function numeroComAno(numeroCompra: string | null, ano: number, separador: "/" | "."): string {
  const limpo = (numeroCompra ?? "").trim();
  if (!limpo) return `s/nº${separador}${ano}`;
  const jaTemAno = /[/.\-](\d{2}|\d{4})$/.test(limpo);
  const comAno = jaTemAno ? limpo : `${limpo}/${ano}`;
  return separador === "/" ? comAno : comAno.replace(/\//g, ".");
}

/** "PE 780/2026 - SECRETARIA DE ESTADO DA ADMINISTRACAO" */
export function tituloDoEvento(l: LicitacaoParaIntegrar): string {
  return `${siglaDaModalidade(l.modalidade)} ${numeroComAno(l.numeroCompra, l.ano, "/")} - ${l.orgao}`;
}

function linhaDoItem(item: ItemParaIntegrar): string {
  const quantidade =
    item.quantidade === null ? "" : ` | ${numero.format(item.quantidade)}${item.unidade ? ` ${item.unidade}` : ""}`;
  const descricao = item.descricao.replace(/\s+/g, " ").trim();
  const curta = descricao.length > 140 ? `${descricao.slice(0, 137)}...` : descricao;
  return `- Item ${item.numero}: ${curta}${quantidade} | produto: ${item.produto}`;
}

function blocoDeItens(titulo: string, itens: ItemParaIntegrar[]): string[] {
  if (itens.length === 0) return [];
  const visiveis = itens.slice(0, MAXIMO_DE_ITENS_NA_DESCRICAO);
  const linhas = [`${titulo} (${itens.length}):`, ...visiveis.map(linhaDoItem)];
  if (itens.length > visiveis.length) linhas.push(`- e mais ${itens.length - visiveis.length}`);
  return [...linhas, ""];
}

/** Itens compatíveis com as quantidades, alertas e o link do PNCP, como pede a especificação. */
export function descricaoDoEvento(l: LicitacaoParaIntegrar, linkDoApp: string | null): string {
  const compativeis = l.itens.filter((i) => i.nivel === "compativel").sort((a, b) => a.numero - b.numero);
  const aVerificar = l.itens.filter((i) => i.nivel === "verificar").sort((a, b) => a.numero - b.numero);
  const linhas: string[] = [];
  if (l.situacao) linhas.push(`ATENÇÃO: o PNCP mostra esta licitação como ${l.situacao}.`, "");
  linhas.push(`Objeto: ${l.objeto.replace(/\s+/g, " ").trim()}`, "");
  linhas.push(...blocoDeItens("Itens compatíveis com o seu catálogo", compativeis));
  linhas.push(...blocoDeItens("Itens a verificar", aVerificar));
  if (compativeis.length === 0 && aVerificar.length === 0) {
    linhas.push("Nenhum item casou com o seu catálogo: a licitação entrou pelos seus segmentos de interesse.", "");
  }
  if (l.alertas.length > 0) linhas.push("Alertas:", ...l.alertas.map((a) => `- ${a}`), "");
  if (l.linkPncp) linhas.push(`Edital no PNCP: ${l.linkPncp}`);
  if (linkDoApp) linhas.push(`Abrir a oportunidade: ${linkDoApp}`);
  return linhas.join("\n").trim();
}

export type EventoDaAgenda = {
  summary: string;
  description: string;
  location?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
};

/** Evento de 1 hora a partir da hora da disputa. Sem data de disputa não há evento. */
export function montarEvento(l: LicitacaoParaIntegrar, linkDoApp: string | null): EventoDaAgenda | null {
  if (!l.dataDisputa) return null;
  const inicio = new Date(l.dataDisputa);
  if (Number.isNaN(inicio.getTime())) return null;
  const fim = new Date(inicio.getTime() + 60 * 60 * 1000);
  const local = [l.municipio, l.uf].filter(Boolean).join("/");
  return {
    summary: tituloDoEvento(l),
    description: descricaoDoEvento(l, linkDoApp),
    ...(local ? { location: local } : {}),
    start: { dateTime: inicio.toISOString(), timeZone: FUSO },
    end: { dateTime: fim.toISOString(), timeZone: FUSO },
  };
}

/** Muda quando qualquer coisa do evento muda (data, itens, alertas, situação). */
export function assinaturaDoEvento(evento: EventoDaAgenda): string {
  return createHash("sha256").update(JSON.stringify(evento)).digest("hex").slice(0, 16);
}

/** "Dezembro 2026": a pasta do mês da disputa (no horário de Brasília). */
export function nomeDaPastaDoMes(dataDisputa: string): string {
  const { ano, mes } = diaEmBrasilia(dataDisputa);
  return `${MESES[Number(mes) - 1]} ${ano}`;
}

/** Tira o que atrapalha em nomes de pasta (inclusive ao sincronizar o Drive com o computador). */
function nomeSeguro(texto: string): string {
  return texto.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
}

/** "PE 780.2026 - SECRETARIA DE ESTADO DA ADMINISTRACAO 03.12" */
export function nomeDaPasta(l: LicitacaoParaIntegrar): string {
  const orgao = nomeSeguro(l.orgao).slice(0, 80).trim();
  const base = `${nomeSeguro(siglaDaModalidade(l.modalidade))} ${nomeSeguro(numeroComAno(l.numeroCompra, l.ano, "."))} - ${orgao}`;
  if (!l.dataDisputa) return base;
  const { mes, dia } = diaEmBrasilia(l.dataDisputa);
  return `${base} ${dia}.${mes}`;
}
