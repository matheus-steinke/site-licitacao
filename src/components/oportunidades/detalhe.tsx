import { Download, ExternalLink, FileText } from "lucide-react";
import Link from "next/link";

import { AcoesDaOportunidade } from "@/components/oportunidades/acoes";
import { AlternarItens } from "@/components/oportunidades/alternar-itens";
import { ChipDeAlerta, ChipsDeAlerta } from "@/components/oportunidades/alertas";
import { EtiquetaDeSegmento } from "@/components/oportunidades/etiqueta-de-segmento";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SITUACOES } from "@/lib/dados/compras";
import {
  LIMITE_DE_OUTROS_ITENS,
  type DetalheDaCompra,
  type ItemCompativel,
  type OutroItem,
  type SegmentoDaEmpresa,
  type StatusOportunidade,
} from "@/lib/dados/oportunidades";
import type { TipoDeAlertaDoEdital } from "@/lib/edital/regras";
import { formatarData, formatarDataHora, formatarDiaSemana, formatarMoeda, formatarNumero } from "@/lib/formato";
import { corDoSegmento } from "@/lib/segmentos-cores";
import { ROTULO_DO_ALERTA_DE_ITEM } from "@/lib/triagem/alertas";
import { cn } from "@/lib/utils";

const ROTULO_DO_STATUS: Record<StatusOportunidade, string> = {
  nova: "Nova",
  aprovada: "Aprovada",
  descartada: "Descartada",
  ganha: "Ganha",
  perdida: "Perdida",
};

const ASSUNTO_DO_TRECHO: Record<TipoDeAlertaDoEdital, string> = {
  amostra: "Amostra",
  comodato: "Comodato",
  visita_tecnica: "Visita técnica",
};

/**
 * Trechos que a leitura automática achou no edital e no termo de referência. O sistema só
 * mostra o que achou: não afirma que o edital dispensa alguma coisa.
 */
function TrechosDoEdital({ edital }: { edital: NonNullable<DetalheDaCompra["edital"]> }) {
  if (edital.status === "sem_texto") {
    return (
      <p className="mt-3 text-sm text-muted-foreground" data-testid="edital-sem-texto">
        O edital desta licitação está em imagem digitalizada (ou num formato que não é lido) e não pôde ser conferido
        automaticamente. Os alertas acima vêm só do objeto e dos itens.
      </p>
    );
  }
  if (edital.trechos.length === 0) return null;
  const assuntos = [...new Set(edital.trechos.map((trecho) => trecho.tipo))];
  return (
    <div className="mt-3 rounded-xl border p-4" data-testid="trechos-do-edital">
      <h3 className="text-sm font-medium">O que o edital diz</h3>
      <div className="mt-3 space-y-4">
        {assuntos.map((assunto) => (
          <div key={assunto}>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{ASSUNTO_DO_TRECHO[assunto]}</p>
            <ul className="mt-1.5 space-y-2">
              {edital.trechos
                .filter((trecho) => trecho.tipo === assunto)
                .map((trecho, indice) => (
                  <li key={indice} className="border-l-2 pl-3 text-sm">
                    <q className="text-foreground/90">{trecho.texto}</q>
                    {trecho.arquivo ? <span className="mt-0.5 block text-xs text-muted-foreground">{trecho.arquivo}</span> : null}
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Trechos encontrados automaticamente no edital e no termo de referência, lidos em {formatarData(edital.lidoEm)}. A
        leitura procura frases, não interpreta o documento: confira sempre o edital.
        {edital.naoLidos > 0
          ? ` ${edital.naoLidos === 1 ? "Um documento não pôde ser lido" : `${edital.naoLidos} documentos não puderam ser lidos`} (imagem digitalizada ou falha ao baixar).`
          : ""}
      </p>
    </div>
  );
}

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

/** As etiquetas dos segmentos de um item, logo abaixo da descrição. */
function SegmentosDoItem({ ids, segmentos }: { ids: string[]; segmentos: Map<string, SegmentoDaEmpresa> }) {
  if (ids.length === 0) return null;
  return (
    <span className="mt-1.5 flex flex-wrap gap-1">
      {ids.flatMap((id) => {
        const segmento = segmentos.get(id);
        return segmento ? [<EtiquetaDeSegmento key={id} nome={segmento.nome} posicao={segmento.posicao} />] : [];
      })}
    </span>
  );
}

/** Itens do edital que não casaram com o catálogo; os dos segmentos da empresa vêm pintados. */
function TabelaDeItens({
  itens,
  segmentos,
  identificacao,
}: {
  itens: OutroItem[];
  segmentos: Map<string, SegmentoDaEmpresa>;
  identificacao: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table data-testid={identificacao}>
        <TableHeader>
          <TableRow>
            <TableHead className="w-14">Item</TableHead>
            <TableHead>Descrição no edital</TableHead>
            <TableHead className="text-right">Qtd.</TableHead>
            <TableHead className="text-right">Valor de referência</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {itens.map((item) => {
            const primeiro = item.segmentoIds.map((id) => segmentos.get(id)).find(Boolean);
            const cor = primeiro ? corDoSegmento(primeiro.posicao) : null;
            return (
              <TableRow
                key={item.id}
                className={cn("align-top", cor?.linha)}
                data-segmento={item.segmentoIds.length > 0 ? "sim" : undefined}
              >
                <TableCell className={cn("tabular-nums", cor?.faixa)}>{item.numero}</TableCell>
                <TableCell className="whitespace-normal">
                  <p className="line-clamp-3 text-sm" title={item.descricao}>
                    {item.descricao}
                  </p>
                  <SegmentosDoItem ids={item.segmentoIds} segmentos={segmentos} />
                </TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap">
                  {formatarNumero(item.quantidade)} {item.unidade ?? ""}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {item.valorReferencia ? formatarMoeda(item.valorReferencia) : "não informado"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/** Por que o item casou (ou quase) com o produto, em frases curtas. */
function Motivos({ item }: { item: ItemCompativel }) {
  const d = item.detalhe;
  const frases: string[] = [];
  if (d.palavraChave) frases.push(`Palavra-chave do produto: “${d.palavraChave}”`);
  else if (typeof d.cobertura === "number") frases.push(`${Math.round(d.cobertura * 100)}% das palavras do nome do produto`);
  if (d.medidasConfirmadas?.length) frases.push(`Medidas conferem: ${d.medidasConfirmadas.join(", ")}`);
  if (d.palavrasDeOutroProduto?.length) frases.push(`O item também cita: ${d.palavrasDeOutroProduto.join(", ")}`);
  if (d.outrosProdutos) {
    frases.push(d.outrosProdutos === 1 ? "Há mais 1 produto parecido no catálogo" : `Há mais ${d.outrosProdutos} produtos parecidos no catálogo`);
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={item.nivel === "compativel" ? "default" : "secondary"}>
          {item.nivel === "compativel" ? "Compatível" : "Verificar"}
        </Badge>
        <span className="text-xs text-muted-foreground tabular-nums">score {item.score}</span>
        {item.lote ? <span className="text-xs text-muted-foreground">lote {item.lote}</span> : null}
      </div>
      {d.medidasDiferentes?.map((diferenca) => (
        <ChipDeAlerta key={diferenca} tom="atencao" texto={`Medida diferente: ${diferenca}`} />
      ))}
      {item.alertas.map((alerta) => (
        <ChipDeAlerta key={alerta} tom="atencao" texto={ROTULO_DO_ALERTA_DE_ITEM[alerta] ?? alerta} />
      ))}
      {frases.length > 0 ? <p className="text-xs leading-relaxed text-muted-foreground">{frases.join(". ")}.</p> : null}
    </div>
  );
}

/**
 * Tudo o que se mostra de uma licitação: edital, alertas, itens do catálogo, os demais itens
 * (com os dos segmentos da empresa pintados) e arquivos. Serve à oportunidade e à licitação
 * aberta pela Busca que não é oportunidade (nesse caso, sem ações e sem itens do catálogo).
 */
export function DetalheDaLicitacao({ op, integracoes }: { op: DetalheDaCompra; integracoes?: React.ReactNode }) {
  // Segmentos de interesse da empresa: cada um com a sua cor.
  const segmentos = new Map(op.segmentosDaEmpresa.map((segmento) => [segmento.id, segmento]));
  const comItens = op.segmentosDaEmpresa.filter((segmento) => segmento.itens > 0);
  const corDaLinha = (ids: string[]) => {
    const primeiro = ids.map((idDoSegmento) => segmentos.get(idDoSegmento)).find(Boolean);
    return primeiro ? corDoSegmento(primeiro.posicao) : null;
  };

  const disputada = op.status === "aprovada" && op.encerrada;
  const compativeis = op.compativeis.filter((item) => item.nivel === "compativel");
  const noLanceMinimo = compativeis.reduce((soma, item) => soma + (item.quantidade ?? 0) * item.produto.lanceMinimo, 0);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{op.orgao}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {op.modalidade} nº {op.numeroCompra ?? "s/nº"} · {op.municipio ? `${op.municipio}/` : ""}
            {op.uf}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {op.ehOportunidade ? (
            <Badge variant={op.status === "nova" ? "outline" : "default"}>
              {disputada ? "Disputada" : ROTULO_DO_STATUS[op.status]}
            </Badge>
          ) : (
            <Badge variant="outline">Fora das suas oportunidades</Badge>
          )}
          {op.encerrada && !disputada ? <Badge variant="secondary">Disputa encerrada</Badge> : null}
          {op.situacaoId !== 1 ? (
            <Badge variant="destructive">{SITUACOES[op.situacaoId] ?? "Situação desconhecida"}</Badge>
          ) : null}
          {op.exemplo ? <Badge variant="outline">Exemplo</Badge> : null}
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {op.ehOportunidade ? <AcoesDaOportunidade id={op.id} status={op.status} encerrada={op.encerrada} /> : null}
        {op.linkPncp ? (
          <a
            href={op.linkPncp}
            target="_blank"
            rel="noreferrer"
            className="ml-auto flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
          >
            Ver no PNCP
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        ) : null}
      </div>

      {op.status === "descartada" && op.motivoDescarte ? (
        <p className="mb-5 rounded-lg border bg-muted/30 p-3 text-sm">
          <span className="font-medium">Motivo do descarte:</span> {op.motivoDescarte}
        </p>
      ) : null}

      {integracoes}

      <section aria-labelledby="titulo-edital" className="mb-6 rounded-xl border p-4">
        <h2 id="titulo-edital" className="mb-3 font-medium">
          Edital
        </h2>
        <p className="mb-4 text-sm leading-relaxed whitespace-pre-line">{op.objeto}</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
          <Dado rotulo="Disputa">
            {formatarDiaSemana(op.dataDisputa)} {formatarDataHora(op.dataDisputa)}
          </Dado>
          <Dado rotulo="Situação no PNCP">{SITUACOES[op.situacaoId] ?? "Desconhecida"}</Dado>
          <Dado rotulo="Valor estimado do edital">
            {op.valorTotalDoEdital ? formatarMoeda(op.valorTotalDoEdital) : "não informado"}
          </Dado>
          <Dado rotulo="Itens no edital">{op.itensRemovidos ? "ver no PNCP" : op.totalItens}</Dado>
          {op.compra?.modo_disputa ? <Dado rotulo="Modo de disputa">{op.compra.modo_disputa}</Dado> : null}
          {op.compra?.srp !== null && op.compra?.srp !== undefined ? (
            <Dado rotulo="Registro de preços">{op.compra.srp ? "Sim" : "Não"}</Dado>
          ) : null}
          {op.compra?.processo ? <Dado rotulo="Processo">{op.compra.processo}</Dado> : null}
          {op.compra?.unidade_nome ? <Dado rotulo="Unidade compradora">{op.compra.unidade_nome}</Dado> : null}
          {op.compra?.data_publicacao ? (
            <Dado rotulo="Publicado em">{formatarData(op.compra.data_publicacao)}</Dado>
          ) : null}
          <Dado rotulo="Controle PNCP">{op.controlePncp}</Dado>
        </dl>
        {op.compra?.link_sistema_origem ? (
          <a
            href={op.compra.link_sistema_origem}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
          >
            Abrir no portal da disputa
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        ) : null}
      </section>

      {op.alertas.length > 0 || op.edital?.status === "sem_texto" ? (
        <section aria-labelledby="titulo-alertas" className="mb-6">
          <h2 id="titulo-alertas" className="mb-2 font-medium">
            Alertas
          </h2>
          {op.alertas.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              <ChipsDeAlerta alertas={op.alertas} />
            </div>
          ) : null}
          {op.edital ? <TrechosDoEdital edital={op.edital} /> : null}
        </section>
      ) : null}

      {op.itensRemovidos ? (
        <section aria-labelledby="titulo-itens-removidos" className="mb-6" data-testid="itens-removidos">
          <h2 id="titulo-itens-removidos" className="font-medium">
            Itens do edital
          </h2>
          <p className="mt-2 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
            A disputa desta licitação terminou há bastante tempo, por isso a lista de itens não é mais guardada
            aqui. O resumo, a sua decisão e os arquivos continuam disponíveis.{" "}
            {op.linkPncp ? (
              <a href={op.linkPncp} target="_blank" rel="noreferrer" className="font-medium text-foreground underline">
                Ver a lista completa no PNCP
              </a>
            ) : (
              "A lista completa está no PNCP."
            )}
          </p>
        </section>
      ) : (
        <>
          <section aria-labelledby="titulo-compativeis" className="mb-6">
            <h2 id="titulo-compativeis" className="font-medium">
              Itens do seu catálogo ({op.compativeis.length})
            </h2>
            {!op.ehOportunidade ? (
              <p className="mt-2 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                Esta licitação não está entre as suas oportunidades, por isso não foi comparada com o seu
                catálogo. Isso acontece quando ela é de um estado que a sua empresa não atende, quando a
                disputa já passou ou quando nenhum item casou com o seu catálogo nem com os seus segmentos.
              </p>
            ) : op.compativeis.length === 0 ? (
              <p className="mt-2 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                Nenhum item desta licitação casou com um produto do seu catálogo. Ela aparece por causa dos
                seus segmentos de interesse. Se você fornece algum item da lista abaixo, inclua palavras-chave
                no produto correspondente, em Catálogo.
              </p>
            ) : (
              <>
                <p className="mt-1 mb-3 text-sm text-muted-foreground">
                  {compativeis.length > 0 ? (
                    <>
                      Compatíveis:{" "}
                      {op.valorEstimado > 0
                        ? `${formatarMoeda(op.valorEstimado)} pelo valor de referência do edital`
                        : "valor de referência não informado no edital"}{" "}
                      e {formatarMoeda(noLanceMinimo)} pelo seu lance mínimo.
                    </>
                  ) : (
                    "Nenhum item passou do limite de compatível; confira os marcados para verificar."
                  )}
                </p>
                <div className="overflow-x-auto rounded-xl border">
                  <Table className="min-w-[56rem]" data-testid="itens-compativeis">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-14">Item</TableHead>
                        <TableHead>Descrição no edital</TableHead>
                        <TableHead className="text-right">Qtd.</TableHead>
                        <TableHead className="text-right">Valor de referência</TableHead>
                        <TableHead>Produto sugerido</TableHead>
                        <TableHead className="text-right">Preço proposta</TableHead>
                        <TableHead className="text-right">Lance mínimo</TableHead>
                        <TableHead>Casamento</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {op.compativeis.map((item) => (
                        <TableRow key={item.itemId} className={cn("align-top", corDaLinha(item.segmentoIds)?.linha)}>
                          <TableCell className={cn("tabular-nums", corDaLinha(item.segmentoIds)?.faixa)}>
                            {item.numero}
                          </TableCell>
                          <TableCell className="max-w-72 whitespace-normal">
                            <p className="line-clamp-4 text-sm" title={item.descricao}>
                              {item.descricao}
                            </p>
                            <SegmentosDoItem ids={item.segmentoIds} segmentos={segmentos} />
                          </TableCell>
                          <TableCell className="text-right tabular-nums whitespace-nowrap">
                            {formatarNumero(item.quantidade)} {item.unidade ?? ""}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {item.valorReferencia ? formatarMoeda(item.valorReferencia) : "não informado"}
                          </TableCell>
                          <TableCell className="max-w-64 whitespace-normal">
                            <Link href={`/catalogo/${item.produto.id}`} className="font-medium underline-offset-4 hover:underline">
                              {item.produto.codigo} · {item.produto.referencia}
                            </Link>
                            <p className="line-clamp-3 text-xs text-muted-foreground" title={item.produto.nome}>
                              {item.produto.nome}
                            </p>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatarMoeda(item.produto.precoProposta)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatarMoeda(item.produto.lanceMinimo)}</TableCell>
                          <TableCell className="min-w-56 whitespace-normal">
                            <Motivos item={item} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </section>

          <section aria-labelledby="titulo-outros" className="mb-6">
            <h2 id="titulo-outros" className="mb-3 font-medium">
              {op.ehOportunidade ? "Outros itens do edital" : "Itens do edital"} ({op.totalDeOutros})
            </h2>

            {comItens.length > 0 ? (
              <div className="mb-3 rounded-xl border p-3" data-testid="legenda-de-segmentos">
                <p className="text-sm">
                  <span className="font-medium">Seus segmentos nesta licitação:</span>{" "}
                  <span className="text-muted-foreground">os itens de cada um aparecem pintados com a cor dele.</span>
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {comItens.map((segmento) => (
                    <EtiquetaDeSegmento
                      key={segmento.id}
                      nome={segmento.nome}
                      posicao={segmento.posicao}
                      quantidade={segmento.itens}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {op.outros.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todos os itens do edital casaram com o seu catálogo.</p>
            ) : op.outrosDosSegmentos.length > 0 ? (
              <AlternarItens
                quantidadeDosSegmentos={op.outrosDosSegmentos.length}
                todos={
                  <>
                    <TabelaDeItens itens={op.outros} segmentos={segmentos} identificacao="outros-itens" />
                    {op.totalDeOutros > op.outros.length ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        Mostrando os {LIMITE_DE_OUTROS_ITENS} primeiros de {op.totalDeOutros}. Em “Só dos meus
                        segmentos” aparecem todos os itens dos seus segmentos; a lista completa está no PNCP.
                      </p>
                    ) : null}
                  </>
                }
                dosSegmentos={
                  <TabelaDeItens itens={op.outrosDosSegmentos} segmentos={segmentos} identificacao="itens-dos-segmentos" />
                }
              />
            ) : (
              <>
                <TabelaDeItens itens={op.outros} segmentos={segmentos} identificacao="outros-itens" />
                {op.totalDeOutros > op.outros.length ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Mostrando os {LIMITE_DE_OUTROS_ITENS} primeiros de {op.totalDeOutros}. A lista completa está no PNCP.
                  </p>
                ) : null}
              </>
            )}
          </section>
        </>
      )}

      <section aria-labelledby="titulo-arquivos">
        <h2 id="titulo-arquivos" className="mb-3 font-medium">
          Arquivos do edital ({op.arquivos.length})
        </h2>
        {op.arquivos.length === 0 ? (
          <p className="text-sm text-muted-foreground">O PNCP não tem arquivos publicados para este edital.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-xl border">
            {op.arquivos.map((arquivo) => (
              <li key={arquivo.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm">
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="font-medium break-words">{arquivo.titulo ?? "Arquivo"}</span>
                  <span className="block text-xs text-muted-foreground">
                    {[arquivo.tipo_documento, arquivo.publicado_em ? formatarData(arquivo.publicado_em) : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <a
                  href={arquivo.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 font-medium underline-offset-4 hover:underline"
                >
                  <Download className="size-3.5" aria-hidden />
                  Baixar
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
