import type { Metadata } from "next";
import { CalendarClock, ExternalLink, MapPin, Search, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { CabecalhoPagina } from "@/components/app/cabecalho-pagina";
import { BuscasSalvas } from "@/components/busca/buscas-salvas";
import { EtiquetaDeSegmento } from "@/components/oportunidades/etiqueta-de-segmento";
import { SeletorSegmentos } from "@/components/organizacao/seletor-segmentos";
import { SeletorUfs } from "@/components/organizacao/seletor-ufs";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  enderecoDaBusca,
  lerFiltros,
  MODALIDADES,
  parametrosDosFiltros,
  SITUACOES_DA_BUSCA,
  temFiltroAlterado,
  type FiltrosDeBusca,
  type Parametros,
} from "@/lib/busca/filtros";
import { buscarLicitacoes, hojeEmBrasilia, listarBuscasSalvas, type ResultadoDaBusca } from "@/lib/dados/busca";
import { SITUACOES } from "@/lib/dados/compras";
import { formatarDataHora, formatarDiaSemana, formatarMoeda } from "@/lib/formato";
import {
  exigirOrganizacao,
  listarSegmentosAtivos,
  listarSegmentosDeInteresse,
  type SegmentoDeInteresse,
} from "@/lib/organizacao";

export const metadata: Metadata = { title: "Busca" };

const ROTULO_DO_STATUS = {
  nova: "Oportunidade nova",
  aprovada: "Aprovada",
  descartada: "Descartada",
  ganha: "Ganha",
  perdida: "Perdida",
} as const;

function plural(n: number, um: string, varios: string): string {
  return `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;
}

function Resultado({
  r,
  termo,
  segmentos,
}: {
  r: ResultadoDaBusca;
  termo: string;
  segmentos: SegmentoDeInteresse[];
}) {
  // Segmentos de interesse da empresa presentes na licitação, com a cor de cada um.
  const dosSegmentos = segmentos.filter((s) => r.segmentoIds.includes(s.id));
  const contagem = r.oportunidade?.itensPorSegmento ?? {};
  const temContagem = Object.keys(contagem).length > 0;
  const destino = r.oportunidade ? `/oportunidades/${r.oportunidade.id}` : `/busca/licitacao/${r.compraId}`;

  return (
    <li className="rounded-xl border bg-card p-4 shadow-xs" data-testid="resultado">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
        <span className="flex items-center gap-1.5 font-medium">
          <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
          <span className="text-muted-foreground">{formatarDiaSemana(r.dataDisputa)}</span>
          {formatarDataHora(r.dataDisputa)}
        </span>
        <span className="flex items-center gap-1 text-muted-foreground">
          <MapPin className="size-3.5" aria-hidden />
          {r.municipio ? `${r.municipio}/` : ""}
          {r.uf}
        </span>
        <span className="flex flex-wrap gap-1.5 sm:ml-auto">
          {r.situacaoId !== 1 ? (
            <Badge variant="destructive">{SITUACOES[r.situacaoId] ?? "Situação desconhecida"}</Badge>
          ) : null}
          {r.encerrada ? <Badge variant="secondary">Disputa encerrada</Badge> : null}
          {r.oportunidade ? (
            <Badge variant={r.oportunidade.status === "nova" ? "outline" : "default"}>
              {ROTULO_DO_STATUS[r.oportunidade.status]}
            </Badge>
          ) : null}
          {r.exemplo ? <Badge variant="outline">Exemplo</Badge> : null}
        </span>
      </div>

      <p className="mt-2.5 font-medium leading-snug">{r.orgao}</p>
      <p className="text-sm text-muted-foreground">
        {r.modalidade} nº {r.numeroCompra ?? "s/nº"}
      </p>
      <p className="mt-2 line-clamp-3 text-sm leading-relaxed">{r.objeto}</p>

      {termo && (r.itensComTermo > 0 || r.termoNoObjeto) ? (
        <div className="mt-3 rounded-lg bg-muted/50 p-3 text-sm" data-testid="onde-achou">
          <p className="font-medium">
            {r.itensComTermo > 0
              ? `${plural(r.itensComTermo, "item", "itens")} com “${termo}”`
              : `“${termo}” aparece no objeto`}
            {r.itensComTermo > 0 && r.termoNoObjeto ? " (e no objeto)" : ""}
          </p>
          {r.amostra.length > 0 ? (
            <ul className="mt-1.5 flex flex-col gap-1 text-muted-foreground">
              {r.amostra.map((descricao, indice) => (
                <li key={indice} className="line-clamp-2">
                  {descricao}
                </li>
              ))}
              {r.itensComTermo > r.amostra.length ? <li>e mais {r.itensComTermo - r.amostra.length}…</li> : null}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {r.oportunidade && r.oportunidade.itensCompativeis > 0 ? (
          <Badge>{plural(r.oportunidade.itensCompativeis, "item compatível", "itens compatíveis")}</Badge>
        ) : null}
        {r.oportunidade && r.oportunidade.itensAVerificar > 0 ? (
          <Badge variant="secondary">
            {plural(r.oportunidade.itensAVerificar, "item a verificar", "itens a verificar")}
          </Badge>
        ) : null}
        {dosSegmentos.map((segmento) => (
          <EtiquetaDeSegmento
            key={segmento.id}
            nome={segmento.nome}
            posicao={segmento.posicao}
            quantidade={temContagem ? (contagem[segmento.id] ?? 0) : undefined}
          />
        ))}
      </div>

      <dl className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 border-t pt-3 text-sm">
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">Itens</dt>
          <dd className="font-medium tabular-nums">{r.totalItens}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">Valor estimado do edital</dt>
          <dd className="font-medium tabular-nums">
            {r.valorTotalDoEdital ? formatarMoeda(r.valorTotalDoEdital) : "não informado"}
          </dd>
        </div>
        {r.linkPncp ? (
          <a
            href={r.linkPncp}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 font-medium underline-offset-4 hover:underline sm:ml-auto"
          >
            Ver no PNCP
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        ) : null}
      </dl>

      <div className="mt-3">
        <Link href={destino} className={buttonVariants({ variant: "secondary", size: "sm" })}>
          Abrir detalhes
        </Link>
      </div>
    </li>
  );
}

function Marcavel({ nome, valor, marcado, children }: { nome: string; valor: string; marcado: boolean; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-muted">
      <input type="checkbox" name={nome} value={valor} defaultChecked={marcado} className="size-4 shrink-0 accent-primary" />
      {children}
    </label>
  );
}

function Carregando() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Carregando a busca">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-9 w-64 max-w-full" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

/** O título aparece na hora; formulário e resultados chegam em seguida. */
export default function PaginaBusca({ searchParams }: { searchParams: Promise<Parametros> }) {
  return (
    <>
      <CabecalhoPagina
        titulo="Busca"
        descricao="Pesquise em todas as licitações da área da saúde coletadas do PNCP, por palavra-chave e filtros."
      />
      <Suspense fallback={<Carregando />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Conteudo({ searchParams }: { searchParams: Promise<Parametros> }) {
  const { org } = await exigirOrganizacao();
  const hoje = hojeEmBrasilia();
  const padrao = { ufs: org.ufs, hoje };
  const filtros = lerFiltros(await searchParams, padrao);

  const [busca, salvas, segmentosAtivos, segmentosDeInteresse] = await Promise.all([
    buscarLicitacoes(org.id, filtros, hoje),
    listarBuscasSalvas(org.id, hoje),
    listarSegmentosAtivos(),
    listarSegmentosDeInteresse(org.id),
  ]);

  const consulta = parametrosDosFiltros(filtros).toString();
  const filtrosAbertos = temFiltroAlterado(filtros, padrao);
  const salvasComEndereco = salvas.map((s) => {
    const dela = parametrosDosFiltros(s.filtros).toString();
    return { id: s.id, nome: s.nome, endereco: `/busca?${dela}`, atual: dela === consulta };
  });
  const pagina = Math.min(filtros.pagina, busca.paginas);

  return (
    <>
      <BuscasSalvas
        salvas={salvasComEndereco}
        consultaAtual={consulta}
        podeSalvar={!salvasComEndereco.some((s) => s.atual)}
      />

      {/* A chave refaz o formulário quando os filtros mudam por um link (busca salva, limpar). */}
      <form key={consulta} action="/busca" className="mb-5 flex flex-col gap-3" role="search">
        <input type="hidden" name="f" value="1" />
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              name="q"
              type="search"
              defaultValue={filtros.q}
              placeholder="Palavra-chave: cateter duplo j, ureteroscópio, fibra laser…"
              aria-label="Palavra-chave"
              maxLength={100}
              className="pl-8"
            />
          </div>
          <Button type="submit">Buscar</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Procura no objeto e na descrição dos itens. Todas as palavras precisam aparecer no mesmo item;
          acento e maiúsculas não importam, e “cateter” também acha “cateteres”.
        </p>

        <details className="rounded-xl border" open={filtrosAbertos}>
          <summary className="flex cursor-pointer items-center gap-2 p-3 text-sm font-medium">
            <SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden />
            Filtros
            <span className="font-normal text-muted-foreground">{resumoDosFiltros(filtros)}</span>
          </summary>
          <div className="flex flex-col gap-5 border-t p-4">
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Estados</legend>
              <p className="mb-2 text-xs text-muted-foreground">Nenhum estado marcado vale como todos.</p>
              <SeletorUfs selecionadas={filtros.ufs ?? []} />
            </fieldset>

            <fieldset>
              <legend className="mb-2 text-sm font-medium">Segmentos</legend>
              <p className="mb-2 text-xs text-muted-foreground">Nenhum segmento marcado vale como todos.</p>
              <SeletorSegmentos segmentos={segmentosAtivos} selecionados={filtros.segmentos} />
            </fieldset>

            <fieldset>
              <legend className="mb-2 text-sm font-medium">Período da disputa</legend>
              <div className="flex flex-wrap gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="busca-de">De</Label>
                  <Input id="busca-de" name="de" type="date" defaultValue={filtros.de === "hoje" ? hoje : (filtros.de ?? "")} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="busca-ate">Até</Label>
                  <Input id="busca-ate" name="ate" type="date" defaultValue={filtros.ate ?? ""} />
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Deixe “De” em branco para incluir as disputas que já aconteceram.
              </p>
            </fieldset>

            <div className="grid gap-5 sm:grid-cols-2">
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Modalidade</legend>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(MODALIDADES).map(([id, nome]) => (
                    <Marcavel key={id} nome="modalidades" valor={id} marcado={filtros.modalidades.includes(Number(id))}>
                      {nome}
                    </Marcavel>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Situação no PNCP</legend>
                <div className="flex flex-wrap gap-2">
                  {[1, 4, 2, 3].map((id) => (
                    <Marcavel key={id} nome="situacoes" valor={String(id)} marcado={filtros.situacoes.includes(id)}>
                      {SITUACOES_DA_BUSCA[id]}
                    </Marcavel>
                  ))}
                </div>
              </fieldset>
            </div>

            <fieldset>
              <legend className="mb-2 text-sm font-medium">Catálogo</legend>
              <Marcavel nome="catalogo" valor="1" marcado={filtros.soCatalogo}>
                Só com itens do meu catálogo
              </Marcavel>
              <p className="mt-2 text-xs text-muted-foreground">
                A comparação com o catálogo é feita nas licitações dos estados da sua empresa com disputa futura.
              </p>
            </fieldset>

            <div className="flex flex-wrap gap-2">
              <Button type="submit">Aplicar filtros</Button>
              <Link href="/busca" className={buttonVariants({ variant: "outline" })}>
                Voltar ao padrão
              </Link>
            </div>
          </div>
        </details>
      </form>

      <p className="mb-3 text-sm text-muted-foreground" role="status" data-testid="total-da-busca">
        {busca.total === 0
          ? "Nenhuma licitação encontrada."
          : `${plural(busca.total, "licitação encontrada", "licitações encontradas")}${busca.paginas > 1 ? ` · página ${pagina} de ${busca.paginas}` : ""}`}
      </p>

      {busca.total === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Tente menos palavras, outra grafia ou amplie os filtros (estados e período).
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {busca.resultados.map((r) => (
            <Resultado key={r.compraId} r={r} termo={filtros.q} segmentos={segmentosDeInteresse} />
          ))}
        </ul>
      )}

      {busca.paginas > 1 ? (
        <nav aria-label="Páginas da busca" className="mt-5 flex items-center justify-between gap-2">
          {pagina > 1 ? (
            <Link href={enderecoDaBusca(filtros, pagina - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Anterior
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted-foreground">
            Página {pagina} de {busca.paginas}
          </span>
          {pagina < busca.paginas ? (
            <Link href={enderecoDaBusca(filtros, pagina + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Próxima
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  );
}

/** "SC · a partir de hoje": o que está valendo, para ler sem abrir o painel. */
function resumoDosFiltros(filtros: FiltrosDeBusca): string {
  const partes: string[] = [];
  if (filtros.ufs === null) partes.push("todos os estados");
  else partes.push(filtros.ufs.length <= 4 ? filtros.ufs.join(", ") : `${filtros.ufs.length} estados`);
  if (filtros.segmentos.length > 0) partes.push(plural(filtros.segmentos.length, "segmento", "segmentos"));
  const data = (iso: string) => iso.split("-").reverse().join("/");
  if (filtros.de === "hoje" && !filtros.ate) partes.push("a partir de hoje");
  else if (filtros.de || filtros.ate) {
    const de = filtros.de === "hoje" ? "hoje" : filtros.de ? data(filtros.de) : null;
    partes.push([de ? `de ${de}` : null, filtros.ate ? `até ${data(filtros.ate)}` : null].filter(Boolean).join(" "));
  } else partes.push("qualquer data");
  if (filtros.modalidades.length > 0) partes.push(filtros.modalidades.map((m) => MODALIDADES[m]).join(", "));
  if (filtros.situacoes.length > 0) partes.push(filtros.situacoes.map((s) => SITUACOES_DA_BUSCA[s]).join(", "));
  if (filtros.soCatalogo) partes.push("só do meu catálogo");
  return partes.join(" · ");
}
