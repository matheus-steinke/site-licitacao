import { CalendarDays, CircleAlert, ExternalLink, FolderOpen } from "lucide-react";
import Link from "next/link";

import { BotaoSincronizar } from "@/components/integracoes/botoes";
import type { PainelDoGoogle as Painel } from "@/lib/integracoes/app";
import { formatarDataHora } from "@/lib/formato";

function LinkExterno({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline">
      {children}
      <ExternalLink className="size-3.5" aria-hidden />
    </a>
  );
}

function Falha({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-start gap-1.5 text-destructive">
      <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </span>
  );
}

/**
 * Evento da agenda e pastas do Drive de uma oportunidade aprovada, com o botão de sincronizar.
 * Sem conta conectada, vira um convite curto para conectar.
 */
export function PainelDoGoogle({
  painel,
  oportunidadeId,
  status,
}: {
  painel: Painel;
  oportunidadeId: string;
  status: "nova" | "aprovada" | "descartada" | "ganha" | "perdida";
}) {
  const decidida = status === "aprovada" || status === "ganha" || status === "perdida";
  const temAlgo = painel.evento !== null || painel.pasta !== null;
  if (!painel.configurado || (!decidida && !temAlgo)) return null;

  if (!painel.conectado) {
    if (!decidida) return null;
    return (
      <p className="mb-5 rounded-xl border border-dashed p-3 text-sm text-muted-foreground" data-testid="google-desconectado">
        Conecte o Google em{" "}
        <Link href="/integracoes" className="font-medium text-foreground underline underline-offset-4">
          Integrações
        </Link>{" "}
        para criar o evento da disputa na agenda e as pastas do processo no Drive ao aprovar.
      </p>
    );
  }

  const { evento, pasta, arquivos } = painel;
  const nadaCriado = !evento?.idExterno && !pasta?.idExterno;
  return (
    <section aria-labelledby="titulo-google" className="mb-6 rounded-xl border p-4" data-testid="painel-do-google">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="titulo-google" className="font-medium">
          Google Agenda e Drive
          {painel.conta ? <span className="ml-2 text-sm font-normal text-muted-foreground">{painel.conta}</span> : null}
        </h2>
        {status === "aprovada" || temAlgo ? (
          <BotaoSincronizar oportunidadeId={oportunidadeId} rotulo={nadaCriado ? "Criar evento e pastas" : "Sincronizar"} />
        ) : null}
      </div>

      {painel.erroDaConta ? (
        <p className="mb-3 text-sm">
          <Falha>
            {painel.erroDaConta}{" "}
            <Link href="/integracoes" className="font-medium underline underline-offset-4">
              Abrir Integrações
            </Link>
          </Falha>
        </p>
      ) : null}

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="flex items-start gap-2">
          <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <dt className="font-medium">Agenda</dt>
            <dd className="text-muted-foreground" data-testid="google-evento">
              {evento?.idExterno && evento.link ? (
                <>
                  <LinkExterno href={evento.link}>Abrir o evento</LinkExterno>
                  {evento.dados.data_disputa ? <span className="block">Marcado para {formatarDataHora(evento.dados.data_disputa)}</span> : null}
                </>
              ) : evento?.idExterno ? (
                "Evento criado."
              ) : !painel.agenda ? (
                "A agenda está desligada em Integrações."
              ) : status === "aprovada" ? (
                "Ainda não há evento para esta licitação."
              ) : (
                "Sem evento."
              )}
              {evento?.situacao === "erro" && evento.erro ? <Falha>{evento.erro}</Falha> : null}
            </dd>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <FolderOpen className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <dt className="font-medium">Drive</dt>
            <dd className="text-muted-foreground" data-testid="google-pasta">
              {pasta?.idExterno && pasta.link ? (
                <>
                  <LinkExterno href={pasta.link}>Abrir a pasta</LinkExterno>
                  {arquivos.total > 0 ? (
                    <span className="block">
                      {arquivos.enviados} de {arquivos.total} arquivos do edital em “1. Edital e Anexos”
                      {pasta.situacao === "pendente" ? " (os demais estão a caminho)" : ""}
                    </span>
                  ) : null}
                </>
              ) : pasta?.idExterno ? (
                "Pastas criadas."
              ) : !painel.drive ? (
                "O Drive está desligado em Integrações."
              ) : status === "aprovada" ? (
                "Ainda não há pasta para esta licitação."
              ) : (
                "Sem pasta."
              )}
              {pasta?.situacao === "erro" && pasta.erro ? <Falha>{pasta.erro}</Falha> : null}
              {arquivos.falhas.map((falha) => (
                <Falha key={falha.nome}>
                  {falha.nome}: {falha.erro}
                </Falha>
              ))}
            </dd>
          </div>
        </div>
      </dl>
    </section>
  );
}
