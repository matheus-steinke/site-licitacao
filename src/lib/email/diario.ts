// E-mail diário: as oportunidades novas da empresa, com as do catálogo primeiro. Sem banco e
// sem rede: serve ao agendador e aos testes.

import { FUSO } from "../app";
import { escapar, ESTILO, moldura } from "./layout";

export type OportunidadeDoEmail = {
  id: string;
  orgao: string;
  modalidade: string;
  numeroCompra: string | null;
  uf: string;
  municipio: string | null;
  /** ISO, com fuso. */
  dataDisputa: string | null;
  objeto: string;
  /** 3 = item do catálogo, 2 = item a verificar, 1 = só pelos segmentos. */
  prioridade: number;
  itensCompativeis: number;
  itensAVerificar: number;
  itensDoSegmento: number;
  /** O que o edital exige com frase clara ("Exige amostra", "Prevê comodato"). */
  destaques?: string[];
};

/** Quantas oportunidades o e-mail lista; o resto fica no link "ver todas". */
export const MAXIMO_NO_EMAIL = 15;

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
});
const soData = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit" });

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const curto = (texto: string, limite: number) => {
  const limpo = texto.replace(/\s+/g, " ").trim();
  return limpo.length > limite ? `${limpo.slice(0, limite - 1)}…` : limpo;
};

/** "qua 02/12 às 09:00", montado por partes para não depender da pontuação do sistema. */
function quando(op: OportunidadeDoEmail): string {
  if (!op.dataDisputa) return "data não informada";
  const partes = dataHora.formatToParts(new Date(op.dataDisputa));
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${parte("weekday").replace(".", "")} ${parte("day")}/${parte("month")} às ${parte("hour")}:${parte("minute")}`;
}

/** "2 itens compatíveis, 1 a verificar" ou, sem catálogo, "5 itens dos seus segmentos". */
export function resumoDosItens(op: OportunidadeDoEmail): string {
  const partes: string[] = [];
  if (op.itensCompativeis > 0) partes.push(plural(op.itensCompativeis, "item compatível com o seu catálogo", "itens compatíveis com o seu catálogo"));
  if (op.itensAVerificar > 0) partes.push(plural(op.itensAVerificar, "item a verificar", "itens a verificar"));
  if (partes.length === 0 && op.itensDoSegmento > 0) partes.push(plural(op.itensDoSegmento, "item dos seus segmentos", "itens dos seus segmentos"));
  return partes.join(", ");
}

/** As do catálogo primeiro; dentro de cada grupo, a disputa mais próxima. */
export function ordenar(oportunidades: OportunidadeDoEmail[]): OportunidadeDoEmail[] {
  const instante = (op: OportunidadeDoEmail) => (op.dataDisputa ? new Date(op.dataDisputa).getTime() : Number.MAX_SAFE_INTEGER);
  return [...oportunidades].sort((a, b) => b.prioridade - a.prioridade || instante(a) - instante(b));
}

export function montarEmailDiario(dados: {
  empresa: string;
  /** Todas as oportunidades novas desde o último e-mail. */
  oportunidades: OportunidadeDoEmail[];
  /** Endereço do app, sem barra no fim. */
  site: string;
  /** Instante do envio. */
  agora: Date;
}): { assunto: string; html: string; texto: string } {
  const todas = ordenar(dados.oportunidades);
  const total = todas.length;
  const doCatalogo = todas.filter((op) => op.prioridade >= 2).length;
  const visiveis = todas.slice(0, MAXIMO_NO_EMAIL);
  const restantes = total - visiveis.length;
  const link = (op: OportunidadeDoEmail) => `${dados.site}/oportunidades/${op.id}`;
  const lista = `${dados.site}/oportunidades`;
  const preferencias = `${dados.site}/configuracoes`;

  const assunto = `${plural(total, "oportunidade nova", "oportunidades novas")} em licitações (${soData.format(dados.agora)})`;
  const abertura =
    doCatalogo > 0
      ? `${plural(total, "licitação nova entrou", "licitações novas entraram")} nas oportunidades de ${dados.empresa}, ${doCatalogo === total ? "todas" : `${doCatalogo} delas`} com itens do seu catálogo.`
      : `${plural(total, "licitação nova entrou", "licitações novas entraram")} nas oportunidades de ${dados.empresa}, pelos seus segmentos de interesse.`;

  const itensHtml = visiveis
    .map(
      (op) => `
<tr><td style="padding:14px 0;border-top:1px solid #e5e5e5">
<div style="font-size:13px;color:#737373">${escapar(quando(op))} · ${escapar([op.municipio, op.uf].filter(Boolean).join("/"))}</div>
<div style="font-weight:600;margin:3px 0"><a href="${escapar(link(op))}" style="color:#171717;text-decoration:none">${escapar(op.orgao)}</a></div>
<div style="font-size:13px;color:#737373">${escapar(op.modalidade)} nº ${escapar(op.numeroCompra ?? "s/nº")}</div>
<div style="font-size:14px;margin:6px 0">${escapar(curto(op.objeto, 180))}</div>
<div style="font-size:13px;font-weight:600;color:${op.prioridade >= 2 ? "#15803d" : "#525252"}">${escapar(resumoDosItens(op))}</div>${
        op.destaques?.length ? `
<div style="font-size:13px;font-weight:600;color:#b45309;margin-top:3px">${escapar(op.destaques.join(" · "))}</div>` : ""
      }
<div style="margin-top:6px"><a href="${escapar(link(op))}" style="${ESTILO.link};font-size:13px">Abrir a oportunidade</a></div>
</td></tr>`,
    )
    .join("");

  const corpoHtml = `
<p style="margin:0 0 16px">${escapar(abertura)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${itensHtml}</table>
${restantes > 0 ? `<p style="margin:14px 0 0;${ESTILO.discreto}">E mais ${restantes} na lista completa.</p>` : ""}
<p style="margin:22px 0 0"><a href="${escapar(lista)}" style="${ESTILO.botao}">Ver todas as oportunidades</a></p>`;

  const rodape = `Você recebe este e-mail porque faz parte de ${dados.empresa}. Para mudar o horário ou deixar de receber, abra Configurações > Notificações.`;
  const texto = [
    abertura,
    "",
    ...visiveis.flatMap((op) => [
      `${quando(op)} · ${[op.municipio, op.uf].filter(Boolean).join("/")}`,
      `${op.orgao} (${op.modalidade} nº ${op.numeroCompra ?? "s/nº"})`,
      curto(op.objeto, 180),
      resumoDosItens(op),
      ...(op.destaques?.length ? [op.destaques.join(" · ")] : []),
      link(op),
      "",
    ]),
    ...(restantes > 0 ? [`E mais ${restantes} na lista completa.`, ""] : []),
    `Ver todas: ${lista}`,
    "",
    rodape,
    preferencias,
  ].join("\n");

  return {
    assunto,
    html: moldura({
      titulo: assunto,
      corpoHtml,
      rodapeHtml: `${escapar(rodape)} <a href="${escapar(preferencias)}" style="color:#737373">Abrir Configurações</a>`,
    }),
    texto,
  };
}
