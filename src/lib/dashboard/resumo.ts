// Números do Dashboard a partir das licitações aprovadas do período: cartões, série por mês,
// série por estado e próximas disputas. Sem banco: serve à página e aos testes.
//
// "Disputada" é a aprovada (ou ganha, ou perdida) cuja data de disputa já passou; "agendada"
// é a aprovada com disputa futura. O valor é o da view: quantidade x lance mínimo do produto,
// nos itens compatíveis.

import { FUSO } from "../app";

export type StatusNoDashboard = "aprovada" | "ganha" | "perdida";

export type LinhaDoDashboard = {
  id: string;
  status: StatusNoDashboard;
  /** ISO, com fuso. */
  dataDisputa: string;
  uf: string;
  municipio: string | null;
  orgao: string;
  modalidade: string;
  numeroCompra: string | null;
  objeto: string;
  /** 1 Divulgada, 2 Revogada, 3 Anulada, 4 Suspensa. */
  situacaoId: number;
  itensCompativeis: number;
  itensAVerificar: number;
  /** Quantidade x lance mínimo, nos itens compatíveis. */
  valor: number;
};

export type Contagem = { disputadas: number; agendadas: number; valor: number };
export type MesDoDashboard = Contagem & { mes: string; rotulo: string; ano: string; nome: string };
export type UfDoDashboard = Contagem & { uf: string };

export type ResumoDoDashboard = {
  disputadas: number;
  agendadas: number;
  /** Entre as disputadas, quantas já foram marcadas. */
  ganhas: number;
  perdidas: number;
  /** Soma do valor pelo lance mínimo das agendadas. */
  valorEmDisputa: number;
  /** Agendadas sem nenhum item compatível: entram na contagem, mas somam zero no valor. */
  agendadasSemValor: number;
  /** Agendadas que o PNCP mostra como suspensas, revogadas ou anuladas. */
  agendadasForaDoNormal: number;
  /** Todos os meses entre a primeira e a última disputa do período, sem buracos. */
  porMes: MesDoDashboard[];
  /** Do estado com mais licitações para o com menos. */
  porUf: UfDoDashboard[];
  /** Agendadas, da disputa mais próxima para a mais distante. */
  proximas: LinhaDoDashboard[];
};

const anoMes = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit" });
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_POR_EXTENSO = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** "2026-11", pelo horário de Brasília (uma disputa às 23h de 30/11 em Brasília é de novembro). */
export function mesDaDisputa(dataDisputa: string): string {
  return anoMes.format(new Date(dataDisputa)).slice(0, 7);
}

function descreverMes(mes: string) {
  const indice = Number(mes.slice(5, 7)) - 1;
  return { rotulo: MESES[indice], ano: mes.slice(0, 4), nome: `${MESES_POR_EXTENSO[indice]} de ${mes.slice(0, 4)}` };
}

function mesSeguinte(mes: string): string {
  const ano = Number(mes.slice(0, 4));
  const m = Number(mes.slice(5, 7));
  return m === 12 ? `${ano + 1}-01` : `${ano}-${String(m + 1).padStart(2, "0")}`;
}

const arredondar = (valor: number) => Math.round(valor * 100) / 100;

export function resumirDashboard(linhas: LinhaDoDashboard[], agoraMs: number): ResumoDoDashboard {
  const resumo: ResumoDoDashboard = {
    disputadas: 0,
    agendadas: 0,
    ganhas: 0,
    perdidas: 0,
    valorEmDisputa: 0,
    agendadasSemValor: 0,
    agendadasForaDoNormal: 0,
    porMes: [],
    porUf: [],
    proximas: [],
  };
  const meses = new Map<string, Contagem>();
  const ufs = new Map<string, Contagem>();
  const somar = (mapa: Map<string, Contagem>, chave: string, agendada: boolean, valor: number) => {
    const atual = mapa.get(chave) ?? { disputadas: 0, agendadas: 0, valor: 0 };
    if (agendada) atual.agendadas++;
    else atual.disputadas++;
    atual.valor += valor;
    mapa.set(chave, atual);
  };

  for (const linha of linhas) {
    const quando = new Date(linha.dataDisputa).getTime();
    if (Number.isNaN(quando)) continue;
    // Ganha e perdida só são marcadas depois da disputa; se a data foi remarcada para a
    // frente, continuam contando como disputadas.
    const agendada = linha.status === "aprovada" && quando >= agoraMs;
    if (agendada) {
      resumo.agendadas++;
      resumo.valorEmDisputa += linha.valor;
      if (linha.valor <= 0) resumo.agendadasSemValor++;
      if (linha.situacaoId !== 1) resumo.agendadasForaDoNormal++;
      resumo.proximas.push(linha);
    } else {
      resumo.disputadas++;
      if (linha.status === "ganha") resumo.ganhas++;
      if (linha.status === "perdida") resumo.perdidas++;
    }
    somar(meses, mesDaDisputa(linha.dataDisputa), agendada, linha.valor);
    somar(ufs, linha.uf || "—", agendada, linha.valor);
  }

  resumo.valorEmDisputa = arredondar(resumo.valorEmDisputa);
  resumo.proximas.sort((a, b) => new Date(a.dataDisputa).getTime() - new Date(b.dataDisputa).getTime());

  if (meses.size > 0) {
    const chaves = [...meses.keys()].sort();
    const ultimo = chaves[chaves.length - 1];
    for (let mes = chaves[0]; mes <= ultimo; mes = mesSeguinte(mes)) {
      const c = meses.get(mes) ?? { disputadas: 0, agendadas: 0, valor: 0 };
      resumo.porMes.push({ mes, ...descreverMes(mes), ...c, valor: arredondar(c.valor) });
    }
  }

  resumo.porUf = [...ufs.entries()]
    .map(([uf, c]) => ({ uf, ...c, valor: arredondar(c.valor) }))
    .sort((a, b) => b.disputadas + b.agendadas - (a.disputadas + a.agendadas) || a.uf.localeCompare(b.uf));

  return resumo;
}
