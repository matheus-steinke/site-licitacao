import type { Metadata } from "next";
import { FileUp, Paperclip, Plus, Search } from "lucide-react";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { limparBusca, listarProdutos, PRODUTOS_POR_PAGINA } from "@/lib/dados/catalogo";
import { formatarMoeda } from "@/lib/formato";
import { exigirOrganizacao } from "@/lib/organizacao";

export const metadata: Metadata = { title: "Catálogo" };

type Parametros = Promise<{ q?: string; pagina?: string }>;

export default async function PaginaCatalogo({ searchParams }: { searchParams: Parametros }) {
  const { org } = await exigirOrganizacao();
  const parametros = await searchParams;
  const busca = limparBusca(parametros.q);
  const pagina = Math.max(1, Number.parseInt(parametros.pagina ?? "1", 10) || 1);
  const { produtos, total } = await listarProdutos(org.id, busca, pagina);
  const paginas = Math.max(1, Math.ceil(total / PRODUTOS_POR_PAGINA));

  const enderecoDaPagina = (n: number) => {
    const p = new URLSearchParams();
    if (busca) p.set("q", busca);
    if (n > 1) p.set("pagina", String(n));
    const consulta = p.toString();
    return consulta ? `/catalogo?${consulta}` : "/catalogo";
  };

  if (total === 0 && !busca) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed p-8 text-center">
        <div>
          <p className="font-medium">Seu catálogo está vazio</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Suba a sua tabela de preços em Excel ou CSV, ou inclua os produtos um a um. É com o
            catálogo que comparamos os itens das licitações.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/catalogo/importar" className={buttonVariants({ size: "lg" })}>
            <FileUp aria-hidden />
            Importar tabela
          </Link>
          <Link href="/catalogo/novo" className={buttonVariants({ variant: "outline", size: "lg" })}>
            <Plus aria-hidden />
            Incluir produto
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form action="/catalogo" className="flex min-w-56 flex-1 items-center gap-2">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              name="q"
              type="search"
              defaultValue={busca}
              placeholder="Buscar por ID, referência, produto ou marca"
              aria-label="Buscar no catálogo"
              className="h-10 pl-8"
            />
          </div>
          <Button type="submit" variant="outline" size="lg">
            Buscar
          </Button>
        </form>
        <Link href="/catalogo/novo" className={buttonVariants({ size: "lg" })}>
          <Plus aria-hidden />
          Incluir produto
        </Link>
      </div>

      <p className="mb-3 text-sm text-muted-foreground">
        {busca ? (
          <>
            {total.toLocaleString("pt-BR")} {total === 1 ? "resultado" : "resultados"} para “{busca}”.{" "}
            <Link href="/catalogo" className="underline hover:text-foreground">
              Limpar busca
            </Link>
          </>
        ) : (
          <>
            {total.toLocaleString("pt-BR")} {total === 1 ? "produto" : "produtos"} no catálogo.
          </>
        )}
      </p>

      {produtos.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhum produto encontrado.
        </p>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Referência</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right max-sm:hidden">Preço proposta</TableHead>
                <TableHead className="text-right max-sm:hidden">Lance mínimo</TableHead>
                <TableHead className="max-md:hidden">Segmento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {produtos.map((produto) => (
                <TableRow key={produto.id}>
                  <TableCell className="font-medium tabular-nums">
                    <Link href={`/catalogo/${produto.id}`} className="hover:underline">
                      {produto.codigo}
                    </Link>
                  </TableCell>
                  <TableCell>{produto.referencia}</TableCell>
                  <TableCell className="max-w-80 whitespace-normal sm:min-w-56">
                    <Link href={`/catalogo/${produto.id}`} className="hover:underline">
                      {produto.nome}
                    </Link>
                    {produto.totalArquivos > 0 ? (
                      <span
                        className="ml-2 inline-flex items-center gap-0.5 text-xs text-muted-foreground"
                        title={`${produto.totalArquivos} arquivo(s)`}
                      >
                        <Paperclip className="size-3" aria-hidden />
                        {produto.totalArquivos}
                      </span>
                    ) : null}
                    <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums sm:hidden">
                      {formatarMoeda(produto.preco_proposta)} · mín. {formatarMoeda(produto.lance_minimo)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums max-sm:hidden">
                    {formatarMoeda(produto.preco_proposta)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums max-sm:hidden">
                    {formatarMoeda(produto.lance_minimo)}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-md:hidden">
                    {produto.segmento ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {paginas > 1 ? (
        <nav aria-label="Paginação" className="mt-4 flex items-center justify-between gap-3 text-sm">
          {pagina > 1 ? (
            <Link href={enderecoDaPagina(pagina - 1)} className={buttonVariants({ variant: "outline" })}>
              Anterior
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            Página {pagina} de {paginas}
          </span>
          {pagina < paginas ? (
            <Link href={enderecoDaPagina(pagina + 1)} className={buttonVariants({ variant: "outline" })}>
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
