// Motor do e-mail diário: decide, para cada empresa, se é hora de enviar, quais oportunidades
// entram e para quem vai. O banco e o envio chegam de fora, para o motor ser testável.

import { FUSO } from "../app";
import { montarEmailDiario, type OportunidadeDoEmail } from "./diario";
import { enviarEmail, type ConfiguracaoDeEmail } from "./resend";

/** Sem envio anterior (primeiro e-mail da empresa): olha as últimas 24 horas. */
const PRIMEIRA_JANELA_H = 24;
/** Depois de dias sem envio (falha ou e-mail desligado), o e-mail não volta mais que isto. */
const JANELA_MAXIMA_H = 72;
const HORA_MS = 3_600_000;

export type EmpresaDoEmail = { id: string; razaoSocial: string; hora: number };
export type Destinatario = { userId: string; email: string };
export type EnvioDoDia = { id: string; status: "enviado" | "vazio" | "erro"; criadoEm: string };

export type ArmazenamentoDoEmail = {
  /** Empresas com o e-mail diário ligado e o cadastro concluído. */
  empresas(soUma?: string): Promise<EmpresaDoEmail[]>;
  envioDoDia(orgId: string, dia: string): Promise<EnvioDoDia | null>;
  /** Instante (criado_em) do último registro concluído ("enviado" ou "vazio") antes do dia. */
  ultimoConcluido(orgId: string, antesDoDia: string): Promise<string | null>;
  /** Cria o registro do dia, ainda como não concluído. O criado_em dele fecha a janela. */
  reservar(orgId: string, dia: string): Promise<EnvioDoDia>;
  concluir(id: string, dados: { status: EnvioDoDia["status"]; destinatarios: number; oportunidades: number; erro: string | null }): Promise<void>;
  destinatarios(orgId: string): Promise<Destinatario[]>;
  /** Oportunidades novas criadas em (desde, ate], ainda por disputar. */
  oportunidadesNovas(orgId: string, desde: string, ate: string, agora: string): Promise<OportunidadeDoEmail[]>;
};

/** Dia (AAAA-MM-DD) e hora (0 a 23) no horário de Brasília. */
export function diaEHora(agora: Date): { dia: string; hora: number } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(agora);
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return { dia: `${parte("year")}-${parte("month")}-${parte("day")}`, hora: Number(parte("hour")) };
}

/** Início da janela: o último envio concluído, limitado a 72 horas; sem envio, 24 horas. */
export function inicioDaJanela(ultimoConcluido: string | null, fim: string): string {
  const ate = new Date(fim).getTime();
  if (!ultimoConcluido) return new Date(ate - PRIMEIRA_JANELA_H * HORA_MS).toISOString();
  return new Date(Math.max(new Date(ultimoConcluido).getTime(), ate - JANELA_MAXIMA_H * HORA_MS)).toISOString();
}

export type ResultadoDaEmpresa = {
  orgId: string;
  empresa: string;
  situacao: "enviado" | "vazio" | "erro" | "cedo" | "ja_feito" | "sem_destinatarios" | "simulado";
  oportunidades: number;
  destinatarios: number;
  erro: string | null;
};

export type OpcoesDoEnvio = {
  agora: Date;
  /** Endereço do app, sem barra no fim. */
  site: string;
  /** Não envia nem grava: só diz o que faria. */
  simular?: boolean;
  /** Ignora a hora escolhida pela empresa (teste manual). O registro do dia continua valendo. */
  ignorarHora?: boolean;
  soUma?: string;
  buscar?: typeof fetch;
};

async function enviarParaEmpresa(
  banco: ArmazenamentoDoEmail,
  config: ConfiguracaoDeEmail,
  empresa: EmpresaDoEmail,
  opcoes: OpcoesDoEnvio,
): Promise<ResultadoDaEmpresa> {
  const base = { orgId: empresa.id, empresa: empresa.razaoSocial, oportunidades: 0, destinatarios: 0, erro: null };
  const { dia, hora } = diaEHora(opcoes.agora);
  if (!opcoes.ignorarHora && hora < empresa.hora) return { ...base, situacao: "cedo" };

  const doDia = await banco.envioDoDia(empresa.id, dia);
  if (doDia && doDia.status !== "erro") return { ...base, situacao: "ja_feito" };

  const pessoas = await banco.destinatarios(empresa.id);
  if (pessoas.length === 0) return { ...base, situacao: "sem_destinatarios" };

  if (opcoes.simular) {
    const fim = doDia?.criadoEm ?? opcoes.agora.toISOString();
    const desde = inicioDaJanela(await banco.ultimoConcluido(empresa.id, dia), fim);
    const novas = await banco.oportunidadesNovas(empresa.id, desde, fim, opcoes.agora.toISOString());
    return { ...base, situacao: "simulado", oportunidades: novas.length, destinatarios: pessoas.length };
  }

  // O registro vem antes da consulta: o criado_em dele (relógio do banco) fecha a janela, e uma
  // nova tentativa depois de falha usa a mesma janela. O que chegar depois fica para amanhã.
  const envio = doDia ?? (await banco.reservar(empresa.id, dia));
  const desde = inicioDaJanela(await banco.ultimoConcluido(empresa.id, dia), envio.criadoEm);
  const novas = await banco.oportunidadesNovas(empresa.id, desde, envio.criadoEm, opcoes.agora.toISOString());
  if (novas.length === 0) {
    await banco.concluir(envio.id, { status: "vazio", destinatarios: 0, oportunidades: 0, erro: null });
    return { ...base, situacao: "vazio" };
  }

  const email = montarEmailDiario({ empresa: empresa.razaoSocial, oportunidades: novas, site: opcoes.site, agora: opcoes.agora });
  let entregues = 0;
  const falhas: string[] = [];
  for (const pessoa of pessoas) {
    try {
      await enviarEmail(
        config,
        // A mesma chave na nova tentativa: quem já recebeu hoje não recebe de novo.
        { para: pessoa.email, ...email, idempotencia: `diario/${empresa.id}/${dia}/${pessoa.userId}` },
        opcoes.buscar,
      );
      entregues++;
    } catch (erro) {
      falhas.push(`${pessoa.email}: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  }
  const erro = falhas.length > 0 ? falhas.join(" | ").slice(0, 1000) : null;
  const status = entregues > 0 ? "enviado" : "erro";
  await banco.concluir(envio.id, { status, destinatarios: entregues, oportunidades: novas.length, erro });
  return { ...base, situacao: status, oportunidades: novas.length, destinatarios: entregues, erro };
}

/** Uma passada por todas as empresas. Falha em uma não impede as outras. */
export async function enviarEmailsDiarios(
  banco: ArmazenamentoDoEmail,
  config: ConfiguracaoDeEmail,
  opcoes: OpcoesDoEnvio,
): Promise<ResultadoDaEmpresa[]> {
  const resultados: ResultadoDaEmpresa[] = [];
  for (const empresa of await banco.empresas(opcoes.soUma)) {
    try {
      resultados.push(await enviarParaEmpresa(banco, config, empresa, opcoes));
    } catch (erro) {
      resultados.push({
        orgId: empresa.id, empresa: empresa.razaoSocial, situacao: "erro", oportunidades: 0, destinatarios: 0,
        erro: erro instanceof Error ? erro.message : String(erro),
      });
    }
  }
  return resultados;
}
