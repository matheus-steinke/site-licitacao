import type { Metadata } from "next";
import { CalendarClock, FlaskConical, MapPin, PackageOpen } from "lucide-react";
import Link from "next/link";

import { CabecalhoPagina } from "@/components/app/cabecalho-pagina";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { contarProdutos } from "@/lib/dados/catalogo";
import { listarCompras, SITUACOES, type CompraResumo } from "@/lib/dados/compras";
import { exigirOrganizacao } from "@/lib/organizacao";
import { formatarDataHora, formatarDiaSemana, formatarMoeda } from "@/lib/formato";

export const metadata: Metadata = { title: "Oportunidades" };

function CartaoCompra({ compra }: { compra: CompraResumo }) {
  const situacaoAnormal = compra.situacao_id !== 1;

  return (
    <li className="rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
        <span className="flex items-center gap-1.5 font-medium">
          <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
          <span className="text-muted-foreground">{formatarDiaSemana(compra.data_disputa)}</span>
          {formatarDataHora(compra.data_disputa)}
        </span>
        <span className="flex items-center gap-1 text-muted-foreground">
          <MapPin className="size-3.5" aria-hidden />
          {compra.municipio ? `${compra.municipio}/` : ""}
          {compra.uf}
        </span>
        <span className="flex flex-wrap gap-1.5 sm:ml-auto">
          {situacaoAnormal ? (
            <Badge variant="destructive">{SITUACOES[compra.situacao_id] ?? "Situação desconhecida"}</Badge>
          ) : null}
          {compra.encerrada ? <Badge variant="secondary">Disputa encerrada</Badge> : null}
          {compra.exemplo ? <Badge variant="outline">Exemplo</Badge> : null}
        </span>
      </div>

      <p className="mt-2.5 font-medium leading-snug">{compra.orgao}</p>
      <p className="text-sm text-muted-foreground">
        {compra.modalidade_nome} nº {compra.numero_compra ?? "s/nº"}
      </p>
      <p className="mt-2 line-clamp-3 text-sm leading-relaxed">{compra.objeto}</p>

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t pt-3 text-sm">
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">Itens</dt>
          <dd className="font-medium tabular-nums">{compra.totalItens}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">Valor estimado do edital</dt>
          <dd className="font-medium tabular-nums">{formatarMoeda(compra.valor_total_estimado)}</dd>
        </div>
      </dl>
    </li>
  );
}

export default async function PaginaOportunidades() {
  const { org } = await exigirOrganizacao();
  const [compras, totalProdutos] = await Promise.all([
    listarCompras(org.ufs),
    contarProdutos(org.id),
  ]);
  const soExemplos = compras.length > 0 && compras.every((c) => c.exemplo);

  return (
    <>
      <CabecalhoPagina
        titulo="Oportunidades"
        descricao="Licitações da área da saúde, da disputa mais próxima para a mais distante."
      />

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
            Sem a tabela de preços não dá para comparar os itens das licitações com os seus
            produtos.{" "}
            <Link href="/catalogo/importar" className="font-medium text-foreground underline">
              Subir a tabela agora
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}

      {soExemplos ? (
        <Alert className="mb-4">
          <FlaskConical aria-hidden />
          <AlertTitle>Você está vendo licitações de exemplo</AlertTitle>
          <AlertDescription>
            São dados fictícios para testar o app. As licitações reais do PNCP entram na etapa 4
            (coletor) e a triagem pelo seu catálogo, com aprovar e descartar, na etapa 5.
          </AlertDescription>
        </Alert>
      ) : null}

      {compras.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhuma licitação nos estados da sua empresa por enquanto.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {compras.map((compra) => (
            <CartaoCompra key={compra.id} compra={compra} />
          ))}
        </ul>
      )}
    </>
  );
}
