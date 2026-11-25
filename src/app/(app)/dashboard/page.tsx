import type { Metadata } from "next";
import { CalendarClock, ChevronRight, MapPin } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { CabecalhoPagina } from "@/components/app/cabecalho-pagina";
import { GraficoPorMes, GraficoPorUf, LegendaDosGraficos } from "@/components/dashboard/graficos";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { hojeEmBrasilia } from "@/lib/dados/busca";
import { SITUACOES } from "@/lib/dados/compras";
import { carregarDashboard } from "@/lib/dados/dashboard";
import {
  descreverPeriodo,
  enderecoDoPeriodo,
  lerPeriodo,
  PERIODOS,
  type Parametros,
} from "@/lib/dashboard/periodo";
import type { LinhaDoDashboard } from "@/lib/dashboard/resumo";
import { formatarDataHora, formatarDiaSemana, formatarMoeda } from "@/lib/formato";
import { exigirOrganizacao } from "@/lib/organizacao";

export const metadata: Metadata = { title: "Dashboard" };

/** Quantas disputas a lista "Próximas disputas" mostra. */
const PROXIMAS_NA_LISTA = 8;

function plural(n: number, um: string, varios: string): string {
  return `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;
}

function Cartao({
  rotulo,
  valor,
  identificacao,
  children,
}: {
  rotulo: string;
  valor: string;
  identificacao: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-xs" data-testid={identificacao}>
      <dt className="text-sm text-muted-foreground">{rotulo}</dt>
      <dd className="mt-1 text-3xl font-semibold tracking-tight break-words" data-testid="valor-do-cartao">
        {valor}
      </dd>
      <dd className="mt-2 text-xs leading-relaxed text-muted-foreground">{children}</dd>
    </div>
  );
}

function ProximaDisputa({ op }: { op: LinhaDoDashboard }) {
  return (
    <li data-testid="proxima-disputa">
      <Link
        href={`/oportunidades/${op.id}`}
        className="flex flex-wrap items-center gap-x-4 gap-y-1.5 p-3 text-sm outline-none hover:bg-muted/50 focus-visible:bg-muted/50"
      >
        <span className="flex w-44 shrink-0 items-center gap-1.5 font-medium">
          <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
          <span className="text-muted-foreground">{formatarDiaSemana(op.dataDisputa)}</span>
          {formatarDataHora(op.dataDisputa)}
        </span>
        <span className="min-w-48 flex-1">
          <span className="block font-medium leading-snug">{op.orgao}</span>
          <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPin className="size-3" aria-hidden />
              {op.municipio ? `${op.municipio}/` : ""}
              {op.uf}
            </span>
            <span>
              {op.modalidade} nº {op.numeroCompra ?? "s/nº"}
            </span>
            <span>{plural(op.itensCompativeis, "item compatível", "itens compatíveis")}</span>
          </span>
        </span>
        {op.situacaoId !== 1 ? (
          <Badge variant="destructive">{SITUACOES[op.situacaoId] ?? "Situação desconhecida"}</Badge>
        ) : null}
        <span className="ml-auto text-right">
          <span className="block font-medium tabular-nums">{formatarMoeda(op.valor)}</span>
          <span className="block text-xs text-muted-foreground">pelo lance mínimo</span>
        </span>
        <ChevronRight className="hidden size-4 text-muted-foreground sm:block" aria-hidden />
      </Link>
    </li>
  );
}

function Carregando() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Carregando o Dashboard">
      <Skeleton className="h-20 w-full" />
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/** O título aparece na hora; filtro, cartões e gráficos chegam em seguida. */
export default function PaginaDashboard({ searchParams }: { searchParams: Promise<Parametros> }) {
  return (
    <>
      <CabecalhoPagina
        titulo="Dashboard"
        descricao="As licitações que a sua empresa aprovou: o que já foi disputado, o que está agendado e quanto está em jogo."
      />
      <Suspense fallback={<Carregando />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Conteudo({ searchParams }: { searchParams: Promise<Parametros> }) {
  const { org } = await exigirOrganizacao();
  const periodo = lerPeriodo(await searchParams, hojeEmBrasilia());
  const r = await carregarDashboard(org.id, periodo);
  const total = r.disputadas + r.agendadas;
  const resultados = [r.ganhas > 0 ? plural(r.ganhas, "ganha", "ganhas") : null, r.perdidas > 0 ? plural(r.perdidas, "perdida", "perdidas") : null]
    .filter(Boolean)
    .join(" e ");

  return (
    <>
      {/* Um filtro só, acima de tudo o que ele alcança: cartões, gráficos e lista. */}
      <div className="mb-5 rounded-xl border p-3">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div>
            <p className="mb-1.5 text-sm font-medium">Período da disputa</p>
            <nav className="flex flex-wrap gap-1.5" aria-label="Período da disputa">
              {(Object.keys(PERIODOS) as (keyof typeof PERIODOS)[]).map((tipo) => (
                <Link
                  key={tipo}
                  href={enderecoDoPeriodo(tipo)}
                  aria-current={periodo.tipo === tipo ? "true" : undefined}
                  className={buttonVariants({ variant: periodo.tipo === tipo ? "default" : "outline", size: "sm" })}
                >
                  {PERIODOS[tipo]}
                </Link>
              ))}
            </nav>
          </div>
          {/* A chave refaz o formulário quando o período muda por um dos atalhos. */}
          <form key={`${periodo.de}|${periodo.ate}`} action="/dashboard" className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="dashboard-de" className="text-xs text-muted-foreground">
                De
              </Label>
              <Input id="dashboard-de" name="de" type="date" defaultValue={periodo.de ?? ""} className="h-8 w-38" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="dashboard-ate" className="text-xs text-muted-foreground">
                Até
              </Label>
              <Input id="dashboard-ate" name="ate" type="date" defaultValue={periodo.ate ?? ""} className="h-8 w-38" />
            </div>
            <Button type="submit" variant="secondary" size="sm" className="h-8">
              Aplicar
            </Button>
          </form>
        </div>
        <p className="mt-3 border-t pt-2.5 text-sm text-muted-foreground" data-testid="periodo-descrito">
          {descreverPeriodo(periodo)}. O período vale para os cartões, os gráficos e a lista.
        </p>
      </div>

      <dl className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.5fr]">
        <Cartao rotulo="Licitações disputadas" valor={r.disputadas.toLocaleString("pt-BR")} identificacao="cartao-disputadas">
          Aprovadas com a data da disputa já passada.
          {resultados ? ` ${resultados.charAt(0).toUpperCase()}${resultados.slice(1)}.` : ""}
        </Cartao>
        <Cartao rotulo="Licitações agendadas" valor={r.agendadas.toLocaleString("pt-BR")} identificacao="cartao-agendadas">
          Aprovadas com a disputa ainda por acontecer.
        </Cartao>
        <div className="sm:col-span-2 lg:col-span-1">
          <Cartao rotulo="Valor estimado em disputa" valor={formatarMoeda(r.valorEmDisputa)} identificacao="cartao-valor">
            Soma de quantidade × <strong className="font-semibold text-foreground">LANCE MÍNIMO da sua tabela de preços</strong>,
            nos itens compatíveis das licitações agendadas. Não é o valor de referência do edital, e os itens
            marcados para verificar não entram.
            {r.agendadasSemValor > 0
              ? ` ${plural(r.agendadasSemValor, "agendada não tem", "agendadas não têm")} item compatível com o catálogo e, por isso, não ${r.agendadasSemValor === 1 ? "soma" : "somam"} valor.`
              : ""}
          </Cartao>
        </div>
      </dl>

      {r.agendadasForaDoNormal > 0 ? (
        <Alert className="mb-5" data-testid="aviso-de-situacao">
          <AlertTitle>
            {plural(r.agendadasForaDoNormal, "licitação agendada está", "licitações agendadas estão")} com a situação
            alterada no PNCP
          </AlertTitle>
          <AlertDescription>
            Suspensa, revogada, anulada ou excluída. Enquanto estiver aprovada, ela continua na contagem e no valor em disputa.
            Confira em Próximas disputas e, se não for mais disputar, desfaça a aprovação na página da licitação.
          </AlertDescription>
        </Alert>
      ) : null}

      {total === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center" data-testid="dashboard-vazio">
          <p className="font-medium">Nenhuma licitação aprovada com disputa neste período.</p>
          <p className="mx-auto mt-1 max-w-prose text-sm text-muted-foreground">
            Uma licitação entra no Dashboard quando você clica em Aprovar, em Oportunidades. Se já aprovou alguma,
            experimente o período “Tudo”.
          </p>
          <Link href="/oportunidades" className={buttonVariants({ variant: "secondary", size: "sm", className: "mt-4" })}>
            Ir para Oportunidades
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-5 grid gap-3 lg:grid-cols-2">
            <section aria-labelledby="titulo-por-mes" className="rounded-xl border bg-card p-4 shadow-xs">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="titulo-por-mes" className="font-medium">
                  Licitações por mês da disputa
                </h2>
                <LegendaDosGraficos />
              </div>
              <GraficoPorMes meses={r.porMes} />
            </section>
            <section aria-labelledby="titulo-por-uf" className="rounded-xl border bg-card p-4 shadow-xs">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="titulo-por-uf" className="font-medium">
                  Licitações por estado
                </h2>
                <LegendaDosGraficos />
              </div>
              <GraficoPorUf ufs={r.porUf} />
            </section>
          </div>

          <section aria-labelledby="titulo-proximas">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="titulo-proximas" className="font-medium">
                Próximas disputas ({r.proximas.length})
              </h2>
              <Link href="/oportunidades?aba=agendadas" className="text-sm font-medium underline-offset-4 hover:underline">
                Ver todas as agendadas
              </Link>
            </div>
            {r.proximas.length === 0 ? (
              <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                Nenhuma licitação aprovada com disputa por acontecer neste período.
              </p>
            ) : (
              <>
                <ul className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
                  {r.proximas.slice(0, PROXIMAS_NA_LISTA).map((op) => (
                    <ProximaDisputa key={op.id} op={op} />
                  ))}
                </ul>
                {r.proximas.length > PROXIMAS_NA_LISTA ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Mostrando as {PROXIMAS_NA_LISTA} mais próximas de {r.proximas.length}.
                  </p>
                ) : null}
              </>
            )}
          </section>
        </>
      )}
    </>
  );
}
