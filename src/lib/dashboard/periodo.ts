// Período do Dashboard: leitura do endereço (?periodo=mes ou ?de=...&ate=...), limites para a
// consulta e o texto que explica o período na tela. Sempre sobre a DATA DA DISPUTA, no horário
// de Brasília. Sem banco: serve à página e aos testes.

export const PERIODOS = {
  "12m": "Últimos 12 meses",
  mes: "Este mês",
  ano: "Este ano",
  tudo: "Tudo",
} as const;

export type TipoDePeriodo = keyof typeof PERIODOS | "personalizado";
export const PERIODO_PADRAO: keyof typeof PERIODOS = "12m";

export type Periodo = {
  tipo: TipoDePeriodo;
  /** AAAA-MM-DD; null = sem limite. */
  de: string | null;
  ate: string | null;
};

export type Parametros = Record<string, string | string[] | undefined>;

const DATA = /^\d{4}-\d{2}-\d{2}$/;

function texto(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

function dataValida(valor: string | undefined): valor is string {
  if (!valor || !DATA.test(valor)) return false;
  const d = new Date(`${valor}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor;
}

const doisDigitos = (n: number) => String(n).padStart(2, "0");

/** Primeiro dia do mês que fica `meses` antes (negativo) ou depois do mês de `hoje`. */
function primeiroDiaDoMes(hoje: string, meses: number): string {
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7)) - 1 + meses;
  const d = new Date(Date.UTC(ano, mes, 1));
  return `${d.getUTCFullYear()}-${doisDigitos(d.getUTCMonth() + 1)}-01`;
}

function ultimoDiaDoMes(hoje: string): string {
  const d = new Date(Date.UTC(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)), 0));
  return `${d.getUTCFullYear()}-${doisDigitos(d.getUTCMonth() + 1)}-${doisDigitos(d.getUTCDate())}`;
}

/** O período de um dos atalhos, a partir do dia de hoje (AAAA-MM-DD, em Brasília). */
export function periodoDoAtalho(tipo: keyof typeof PERIODOS, hoje: string): Periodo {
  switch (tipo) {
    case "mes":
      return { tipo, de: primeiroDiaDoMes(hoje, 0), ate: ultimoDiaDoMes(hoje) };
    case "ano":
      return { tipo, de: `${hoje.slice(0, 4)}-01-01`, ate: `${hoje.slice(0, 4)}-12-31` };
    case "12m":
      // Do começo do mês de 11 meses atrás em diante: sem data final, para incluir as agendadas.
      return { tipo, de: primeiroDiaDoMes(hoje, -11), ate: null };
    case "tudo":
      return { tipo, de: null, ate: null };
  }
}

/**
 * Lê o período do endereço. Datas (de/ate) têm prioridade sobre o atalho; sem nada, vale o
 * padrão (últimos 12 meses em diante). Datas invertidas são trocadas.
 */
export function lerPeriodo(params: Parametros, hoje: string): Periodo {
  const temDatas = params.de !== undefined || params.ate !== undefined;
  if (temDatas) {
    const lidoDe = texto(params.de);
    const lidoAte = texto(params.ate);
    let de = dataValida(lidoDe) ? lidoDe : null;
    let ate = dataValida(lidoAte) ? lidoAte : null;
    if (de && ate && de > ate) [de, ate] = [ate, de];
    if (!de && !ate) return periodoDoAtalho("tudo", hoje);
    return { tipo: "personalizado", de, ate };
  }
  const atalho = texto(params.periodo);
  const tipo = atalho !== undefined && atalho in PERIODOS ? (atalho as keyof typeof PERIODOS) : PERIODO_PADRAO;
  return periodoDoAtalho(tipo, hoje);
}

/** Limites para a consulta, com o fuso de Brasília. */
export function limitesDoPeriodo(periodo: Periodo): { de: string | null; ate: string | null } {
  return {
    de: periodo.de ? `${periodo.de}T00:00:00-03:00` : null,
    ate: periodo.ate ? `${periodo.ate}T23:59:59.999-03:00` : null,
  };
}

export function enderecoDoPeriodo(tipo: keyof typeof PERIODOS): string {
  return tipo === PERIODO_PADRAO ? "/dashboard" : `/dashboard?periodo=${tipo}`;
}

const brasileira = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;

/** "Disputas de 01/12/2025 em diante", para deixar claro o que o filtro está contando. */
export function descreverPeriodo(periodo: Periodo): string {
  if (periodo.de && periodo.ate) return `Disputas de ${brasileira(periodo.de)} a ${brasileira(periodo.ate)}`;
  if (periodo.de) return `Disputas de ${brasileira(periodo.de)} em diante`;
  if (periodo.ate) return `Disputas até ${brasileira(periodo.ate)}`;
  return "Todas as disputas, de qualquer data";
}
