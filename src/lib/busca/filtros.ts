// Filtros da tela de Busca: leitura do endereço (?q=...&ufs=SC...), endereço canônico e a
// forma guardada nas buscas salvas. Sem banco: serve à página, às ações e aos testes.

import { TODAS_UFS } from "../ufs";

export const MODALIDADES: Record<number, string> = { 6: "Pregão eletrônico", 8: "Dispensa eletrônica" };
export const SITUACOES_DA_BUSCA: Record<number, string> = { 1: "Divulgada", 4: "Suspensa", 2: "Revogada", 3: "Anulada" };
export const RESULTADOS_POR_PAGINA = 20;

export type FiltrosDeBusca = {
  /** Palavras-chave: todas precisam aparecer no mesmo item ou no objeto. */
  q: string;
  /** null = todos os estados. */
  ufs: string[] | null;
  segmentos: string[];
  /** "hoje" acompanha o dia em que a busca é feita; uma data AAAA-MM-DD fica fixa; null = sem limite. */
  de: string | null;
  ate: string | null;
  /** Vazio = todas. */
  modalidades: number[];
  /** Vazio = todas. */
  situacoes: number[];
  soCatalogo: boolean;
  pagina: number;
};

export type Parametros = Record<string, string | string[] | undefined>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

function lista(valor: string | string[] | undefined): string[] {
  if (valor === undefined) return [];
  return (Array.isArray(valor) ? valor : [valor]).flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
}

function texto(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

function dataValida(valor: string): boolean {
  if (!DATA.test(valor)) return false;
  const d = new Date(`${valor}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor;
}

function numeros(valores: string[], permitidos: Record<number, string>): number[] {
  const lidos = valores.map(Number).filter((n) => Number.isInteger(n) && n in permitidos);
  return [...new Set(lidos)].sort((a, b) => a - b);
}

/**
 * Lê os filtros do endereço. Sem nenhum parâmetro, vale o padrão: estados da empresa e
 * disputas de hoje em diante. Com o formulário enviado (f=1), o que não veio marcado
 * significa "todos".
 */
export function lerFiltros(params: Parametros, padrao: { ufs: string[]; hoje: string }): FiltrosDeBusca {
  const enviado = texto(params.f) === "1";

  const ufsLidas = lista(params.ufs).map((uf) => uf.toUpperCase());
  let ufs: string[] | null;
  if (ufsLidas.includes("TODOS")) ufs = null;
  else {
    const validas = TODAS_UFS.filter((uf) => ufsLidas.includes(uf));
    if (validas.length === TODAS_UFS.length) ufs = null;
    else if (validas.length > 0) ufs = validas;
    else ufs = enviado ? null : padrao.ufs.length > 0 ? [...padrao.ufs].sort() : null;
  }

  const deLido = texto(params.de);
  let de: string | null;
  if (deLido === undefined) de = enviado ? null : "hoje";
  else if (deLido === "hoje" || deLido === padrao.hoje) de = "hoje";
  else de = dataValida(deLido) ? deLido : null;

  const ateLido = texto(params.ate);
  const ate = ateLido && dataValida(ateLido) ? ateLido : null;

  const pagina = Number.parseInt(texto(params.pagina) ?? "1", 10);
  return {
    q: (texto(params.q) ?? "").replace(/\s+/g, " ").trim().slice(0, 100),
    ufs,
    segmentos: [...new Set(lista(params.segmentos).filter((id) => UUID.test(id)).map((id) => id.toLowerCase()))].sort(),
    de,
    ate,
    modalidades: numeros(lista(params.modalidades), MODALIDADES),
    situacoes: numeros(lista(params.situacoes), SITUACOES_DA_BUSCA),
    soCatalogo: texto(params.catalogo) === "1",
    pagina: Number.isInteger(pagina) && pagina > 0 ? Math.min(pagina, 500) : 1,
  };
}

/** O endereço canônico dos filtros: sempre explícito, para o link valer igual para qualquer usuário. */
export function parametrosDosFiltros(filtros: FiltrosDeBusca, pagina = 1): URLSearchParams {
  const p = new URLSearchParams();
  p.set("f", "1");
  if (filtros.q) p.set("q", filtros.q);
  if (filtros.ufs === null) p.set("ufs", "todos");
  else for (const uf of filtros.ufs) p.append("ufs", uf);
  for (const id of filtros.segmentos) p.append("segmentos", id);
  if (filtros.de) p.set("de", filtros.de);
  if (filtros.ate) p.set("ate", filtros.ate);
  for (const m of filtros.modalidades) p.append("modalidades", String(m));
  for (const s of filtros.situacoes) p.append("situacoes", String(s));
  if (filtros.soCatalogo) p.set("catalogo", "1");
  if (pagina > 1) p.set("pagina", String(pagina));
  return p;
}

export function enderecoDaBusca(filtros: FiltrosDeBusca, pagina = 1): string {
  return `/busca?${parametrosDosFiltros(filtros, pagina).toString()}`;
}

/** O que vai para a tabela buscas_salvas (sem a página). */
export function paraSalvar(filtros: FiltrosDeBusca): Record<string, unknown> {
  return {
    q: filtros.q,
    ufs: filtros.ufs,
    segmentos: filtros.segmentos,
    de: filtros.de,
    ate: filtros.ate,
    modalidades: filtros.modalidades,
    situacoes: filtros.situacoes,
    soCatalogo: filtros.soCatalogo,
  };
}

/** Lê uma busca salva (o JSON da tabela), tolerando campos ausentes ou estranhos. */
export function lerSalvos(valor: unknown, hoje: string): FiltrosDeBusca {
  const v = typeof valor === "object" && valor !== null && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};
  const textos = (x: unknown) => (Array.isArray(x) ? x.filter((i): i is string => typeof i === "string") : []);
  const inteiros = (x: unknown) => (Array.isArray(x) ? x.map(String) : []);
  return lerFiltros(
    {
      f: "1",
      q: typeof v.q === "string" ? v.q : undefined,
      ufs: v.ufs === null || v.ufs === undefined ? "todos" : textos(v.ufs),
      segmentos: textos(v.segmentos),
      de: typeof v.de === "string" ? v.de : undefined,
      ate: typeof v.ate === "string" ? v.ate : undefined,
      modalidades: inteiros(v.modalidades),
      situacoes: inteiros(v.situacoes),
      catalogo: v.soCatalogo === true ? "1" : undefined,
    },
    { ufs: [], hoje },
  );
}

/** Limites do período em instantes, no horário de Brasília (UTC-3, sem horário de verão). */
export function periodoDaBusca(filtros: FiltrosDeBusca, hoje: string): { de: string | null; ate: string | null } {
  const de = filtros.de === "hoje" ? hoje : filtros.de;
  return {
    de: de ? `${de}T00:00:00-03:00` : null,
    ate: filtros.ate ? `${filtros.ate}T23:59:59.999-03:00` : null,
  };
}

/** Algum filtro além da palavra-chave está diferente do padrão? (para abrir o painel de filtros) */
export function temFiltroAlterado(filtros: FiltrosDeBusca, padrao: { ufs: string[] }): boolean {
  const ufsPadrao = [...padrao.ufs].sort().join(",");
  return (
    (filtros.ufs ?? ["todos"]).join(",") !== ufsPadrao ||
    filtros.segmentos.length > 0 ||
    filtros.de !== "hoje" ||
    filtros.ate !== null ||
    filtros.modalidades.length > 0 ||
    filtros.situacoes.length > 0 ||
    filtros.soCatalogo
  );
}
