import { FUSO } from "@/lib/app";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const numero = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });
const dataHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const data = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const diaSemana = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "short" });

function paraData(valor: string | Date | null | undefined): Date | null {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** R$ 1.234,56 */
export function formatarMoeda(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "—";
  return moeda.format(valor).replace(/ /g, " ");
}

/** 1.234,5 */
export function formatarNumero(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "—";
  return numero.format(valor);
}

/** 25/11/2026 09:00 (horário de Brasília) */
export function formatarDataHora(valor: string | Date | null | undefined): string {
  const d = paraData(valor);
  return d ? dataHora.format(d).replace(",", "") : "—";
}

/** 25/11/2026 (horário de Brasília) */
export function formatarData(valor: string | Date | null | undefined): string {
  const d = paraData(valor);
  return d ? data.format(d) : "—";
}

/** "qua" */
export function formatarDiaSemana(valor: string | Date | null | undefined): string {
  const d = paraData(valor);
  return d ? diaSemana.format(d).replace(".", "") : "";
}

/** 12.345.678/0001-95 (aceita o CNPJ alfanumérico) */
export function formatarCnpj(cnpj: string | null | undefined): string {
  if (!cnpj || cnpj.length !== 14) return cnpj ?? "—";
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}
