import type { Metadata } from "next";
import { CalendarClock, ExternalLink, FlaskConical, MapPin, PackageOpen } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { CabecalhoPagina } from "@/components/app/cabecalho-pagina";
import { AcoesDaOportunidade } from "@/components/oportunidades/acoes";
import { ChipsDeAlerta } from "@/components/oportunidades/alertas";
import { EtiquetaDeSegmento } from "@/components/oportunidades/etiqueta-de-segmento";
import { AtualizadorDeTriagem } from "@/components/oportunidades/atualizador-de-triagem";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { contarProdutos } from "@/lib/dados/catalogo";
import { SITUACOES } from "@/lib/dados/compras";
import {
  ABAS,
  listarOportunidades,
  type AbaDeOportunidades,
  type OportunidadeResumo,
} from "@/lib/dados/oportunidades";
import { formatarDataHora, formatarDiaSemana, formatarMoeda } from "@/lib/formato";
import { exigirOrganizacao, listarSegmentosDeInteresse, type SegmentoDeInteresse } from "@/lib/organizacao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { situacaoDaTriagem } from "@/lib/triagem/executar";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Oportunidades" };

const ROTULO_DA_ABA: Record<AbaDeOportunidades, string> = {
  novas: "Novas",
  agendadas: "Agendadas",
  disputadas: "Disputadas",
  descartadas: "Descartadas",
};

const VAZIO: Record<AbaDeOportunidades, string> = {
  novas: "Nenhuma oportunidade nova nos estados da sua empresa por enquanto.",
  agendadas: "Nenhuma disputa agendada. Aprove uma oportunidade para ela aparecer aqui.",
  disputadas: "Nenhuma disputa realizada ainda. As aprovadas passam para cá depois da data da disputa.",
  descartadas: "Nenhuma oportunidade descartada.",
};

function endereco(aba: AbaDeOportunidades, soCatalogo: boolean): string {
  const p = new URLSearchParams();
  if (aba !== "novas") p.set("aba", aba);
  if (soCatalogo && aba === "novas") p.set("catalogo", "1");
  const consulta = p.toString();
  return consulta ? `/oportunidades?${consulta}` : "/oportunidades";
}

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

function Cartao({ op, segmentos }: { op: OportunidadeResumo; segmentos: SegmentoDeInteresse[] }) {
  const situacaoAnormal = op.situacaoId !== 1;
  // Segmentos de interesse da empresa presentes nesta licitação, cada um com a sua cor.
  const dosSegmentos = segmentos.filter((s) => op.segmentoIds.includes(s.id));
  // Triagens antigas não têm a contagem por segmento: mostra só o nome até refazer.
  const temContagem = Object.keys(op.itensPorSegmento).length > 0;

  return (
    <li className="rounded-xl border bg-card p-4 shadow-xs" data-testid="oportunidade">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
        <span className="flex items-center gap-1.5 font-medium">
          <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
          <span className="text-muted-foreground">{formatarDiaSemana(op.dataDisputa)}</span>
          {formatarDataHora(op.dataDisputa)}
        </span>
        <span className="flex items-center gap-1 text-muted-foreground">
          <MapPin className="size-3.5" aria-hidden />
          {op.municipio ? `${op.municipio}/` : ""}
          {op.uf}
        </span>
        <span className="flex flex-wrap gap-1.5 sm:ml-auto">
          {situacaoAnormal ? (
            <Badge variant="destructive">{SITUACOES[op.situacaoId] ?? "Situação desconhecida"}</Badge>
          ) : null}
          {op.status === "ganha" ? <Badge>Ganha</Badge> : null}
          {op.status === "perdida" ? <Badge variant="secondary">Perdida</Badge> : null}
          {op.status === "aprovada" && op.encerrada ? <Badge variant="secondary">Disputada</Badge> : null}
          {op.exemplo ? <Badge variant="outline">Exemplo</Badge> : null}
        </span>
      </div>

      <p className="mt-2.5 font-medium leading-snug">{op.orgao}</p>
      <p className="text-sm text-muted-foreground">
        {op.modalidade} nº {op.numeroCompra ?? "s/nº"}
      </p>
      <p className="mt-2 line-clamp-3 text-sm leading-relaxed">{op.objeto}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {op.itensCompativeis > 0 ? (
          <Badge>{plural(op.itensCompativeis, "item compatível", "itens compatíveis")}</Badge>
        ) : null}
        {op.itensAVerificar > 0 ? (
          <Badge variant="secondary">{plural(op.itensAVerificar, "item a verificar", "itens a verificar")}</Badge>
        ) : null}
        {dosSegmentos.map((segmento) => (
          <EtiquetaDeSegmento
            key={segmento.id}
            nome={segmento.nome}
            posicao={segmento.posicao}
            quantidade={temContagem ? (op.itensPorSegmento[segmento.id] ?? 0) : undefined}
          />
        ))}
        {op.prioridade === 0 ? <Badge variant="outline">Sem itens do catálogo hoje</Badge> : null}
        <ChipsDeAlerta alertas={op.alertas} />
      </div>

      {op.status === "descartada" && op.motivoDescarte ? (
        <p className="mt-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Motivo do descarte:</span> {op.motivoDescarte}
        </p>
      ) : null}

      <dl className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 border-t pt-3 text-sm">
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">Itens</dt>
          <dd className="font-medium tabular-nums">{op.totalItens > 0 ? op.totalItens : "—"}</dd>
        </div>
        {op.itensCompativeis > 0 ? (
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Valor estimado dos compatíveis</dt>
            <dd className="font-medium tabular-nums">
              {op.valorEstimado > 0 ? formatarMoeda(op.valorEstimado) : "não informado"}
            </dd>
          </div>
        ) : null}
        {op.linkPncp ? (
          <a
            href={op.linkPncp}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 font-medium underline-offset-4 hover:underline sm:ml-auto"
          >
            Ver no PNCP
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        ) : null}
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link href={`/oportunidades/${op.id}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
          Abrir detalhes
        </Link>
        <AcoesDaOportunidade id={op.id} status={op.status} encerrada={op.encerrada} />
      </div>
    </li>
  );
}

type Parametros = Promise<{ aba?: string; catalogo?: string }>;

function Carregando() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Carregando oportunidades">
      <Skeleton className="h-4 w-64 max-w-full" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

/** O título aparece na hora; a lista chega em seguida, com os dados da empresa. */
export default function PaginaOportunidades({ searchParams }: { searchParams: Parametros }) {
  return (
    <>
      <CabecalhoPagina
        titulo="Oportunidades"
        descricao="Licitações que casam com o seu catálogo ou com os seus segmentos, nos estados da sua empresa."
      />
      <Suspense fallback={<Carregando />}>
        <Lista searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Lista({ searchParams }: { searchParams: Parametros }) {
  const { org } = await exigirOrganizacao();
  const parametros = await searchParams;
  const aba = ABAS.find((a) => a === parametros.aba) ?? "novas";
  const soCatalogo = parametros.catalogo === "1";

  const supabase = await criarClienteServidor();
  const [situacao, lista, totalProdutos, segmentos] = await Promise.all([
    situacaoDaTriagem(supabase, org.id),
    listarOportunidades(org.id, aba, soCatalogo),
    contarProdutos(org.id),
    listarSegmentosDeInteresse(org.id),
  ]);
  const triando = situacao.desatualizada || situacao.pendentes > 0;
  const soExemplos = lista.oportunidades.length > 0 && lista.oportunidades.every((op) => op.exemplo);

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        Estados da sua empresa: <span className="font-medium text-foreground">{org.ufs.join(", ")}</span>
        .{" "}
        <Link href="/configuracoes" className="underline hover:text-foreground">
          Alterar
        </Link>
      </p>

      {totalProdutos === 0 ? (
        <Alert className="mb-4">
          <PackageOpen aria-hidden />
          <AlertTitle>Seu catálogo está vazio</AlertTitle>
          <AlertDescription>
            Sem a tabela de preços, só aparecem as licitações dos seus segmentos, sem a comparação
            item a item.{" "}
            <Link href="/catalogo/importar" className="font-medium text-foreground underline">
              Subir a tabela agora
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}

      {triando ? <AtualizadorDeTriagem pendentes={situacao.pendentes} /> : null}

      {soExemplos ? (
        <Alert className="mb-4">
          <FlaskConical aria-hidden />
          <AlertTitle>Você está vendo licitações de exemplo</AlertTitle>
          <AlertDescription>
            São dados fictícios para testar o app. Elas somem assim que o coletor trouxer as
            primeiras licitações reais do PNCP.
          </AlertDescription>
        </Alert>
      ) : null}

      <nav aria-label="Situação das oportunidades" className="mb-4 flex gap-1 overflow-x-auto border-b">
        {ABAS.map((opcao) => (
          <Link
            key={opcao}
            href={endereco(opcao, soCatalogo)}
            aria-current={opcao === aba ? "page" : undefined}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap",
              opcao === aba
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {ROTULO_DA_ABA[opcao]}
            <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
              {lista.total[opcao]}
            </span>
          </Link>
        ))}
      </nav>

      {aba === "novas" ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Mostrar:</span>
          <Link
            href={endereco("novas", false)}
            aria-current={soCatalogo ? undefined : "true"}
            className={buttonVariants({ variant: soCatalogo ? "outline" : "default", size: "sm" })}
          >
            Catálogo e segmentos
          </Link>
          <Link
            href={endereco("novas", true)}
            aria-current={soCatalogo ? "true" : undefined}
            className={buttonVariants({ variant: soCatalogo ? "default" : "outline", size: "sm" })}
          >
            Só com itens do meu catálogo
          </Link>
        </div>
      ) : null}

      {lista.oportunidades.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {triando && aba === "novas"
            ? "Aguarde: as oportunidades aparecem assim que a comparação terminar."
            : soCatalogo && aba === "novas"
              ? "Nenhuma oportunidade nova com itens do seu catálogo por enquanto."
              : VAZIO[aba]}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {lista.oportunidades.map((op) => (
            <Cartao key={op.id} op={op} segmentos={segmentos} />
          ))}
        </ul>
      )}

      {lista.cortada ? (
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Mostrando as {lista.oportunidades.length} primeiras. A busca com filtros chega na etapa 6.
        </p>
      ) : null}
    </>
  );
}
