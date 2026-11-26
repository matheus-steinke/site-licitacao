// Texto dos alertas da triagem, para as telas e (depois) para o e-mail e a agenda.

import type { AlertaDoEdital } from "../edital/regras";
import type { Alerta, AlertaDeItem } from "./motor";

export type Tom = "atencao" | "informacao" | "bom";

function itens(numeros: number[]): string {
  const lista = numeros.slice(0, 8).join(", ");
  const resto = numeros.length - 8;
  const rotulo = numeros.length === 1 ? "item" : "itens";
  return resto > 0 ? `${rotulo} ${lista} e mais ${resto}` : `${rotulo} ${lista}`;
}

export function descreverAlerta(alerta: Alerta): { texto: string; tom: Tom } {
  switch (alerta.tipo) {
    case "me_epp_repassar":
      return { texto: `Exclusivo ME/EPP – repassar a parceiro (${itens(alerta.itens)})`, tom: "atencao" };
    case "exclusivo_me_epp":
      return { texto: `Exclusivo ME/EPP (${itens(alerta.itens)})`, tom: "informacao" };
    case "referencia_abaixo_minimo":
      return { texto: `Referência abaixo do seu mínimo (${itens(alerta.itens)})`, tom: "atencao" };
    case "lote_completo":
      return { texto: `Lote ${alerta.lote} completo`, tom: "bom" };
    case "lote_incompleto":
      return { texto: `Lote ${alerta.lote} incompleto (faltam ${itens(alerta.faltam)})`, tom: "atencao" };
    // O sistema nunca diz que o edital "não exige": ou há frase clara de exigência, ou é
    // citação para a pessoa conferir.
    case "amostra":
      return alerta.nivel === "exige"
        ? { texto: "Exige amostra", tom: "atencao" }
        : { texto: "Cita amostra, conferir", tom: "informacao" };
    case "comodato":
      return alerta.nivel === "exige"
        ? { texto: "Prevê comodato", tom: "atencao" }
        : { texto: "Cita comodato, conferir", tom: "informacao" };
    case "visita_tecnica":
      return { texto: "Cita visita técnica, conferir", tom: "informacao" };
    case "exclusiva_me_epp":
      return { texto: "Licitação exclusiva ME/EPP", tom: "atencao" };
  }
}

export const ROTULO_DO_ALERTA_DE_ITEM: Record<AlertaDeItem, string> = {
  exclusivo_me_epp: "Exclusivo ME/EPP",
  referencia_abaixo_minimo: "Referência abaixo do seu mínimo",
};

/** Os alertas chegam do banco como JSON: aproveita só os que têm um tipo conhecido. */
export function lerAlertas(valor: unknown): Alerta[] {
  if (!Array.isArray(valor)) return [];
  const conhecidos = new Set([
    "me_epp_repassar", "exclusivo_me_epp", "referencia_abaixo_minimo", "lote_completo", "lote_incompleto",
    "amostra", "comodato", "visita_tecnica", "exclusiva_me_epp",
  ]);
  return valor.filter(
    (a): a is Alerta => typeof a === "object" && a !== null && conhecidos.has((a as { tipo?: string }).tipo ?? ""),
  );
}

/**
 * Junta os alertas da triagem (objeto e itens) com os da leitura do edital. O do edital
 * substitui o do mesmo tipo vindo do objeto, porque leu mais texto; nenhum alerta some. Os de
 * exigência clara vão para a frente.
 */
export function combinarAlertas(daTriagem: Alerta[], doEdital: AlertaDoEdital[]): Alerta[] {
  if (doEdital.length === 0) return daTriagem;
  const tipos = new Set<string>(doEdital.map((a) => a.tipo));
  const paraAlerta = (a: AlertaDoEdital): Alerta => (a.nivel === "exige" ? { tipo: a.tipo, nivel: "exige" } : { tipo: a.tipo });
  return [
    ...doEdital.filter((a) => a.nivel === "exige").map(paraAlerta),
    ...daTriagem.filter((a) => !tipos.has(a.tipo)),
    ...doEdital.filter((a) => a.nivel !== "exige").map(paraAlerta),
  ];
}
