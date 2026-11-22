import type { Metadata } from "next";
import { ArrowLeft, Download, FileText, Trash2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { EnvioArquivo } from "@/components/catalogo/arquivos-produto";
import { FormularioProduto } from "@/components/catalogo/formulario-produto";
import { BotaoEnviar } from "@/components/formulario/botao-enviar";
import { MensagemOk } from "@/components/formulario/mensagens";
import { buttonVariants } from "@/components/ui/button";
import { listarArquivosDoProduto, obterProduto, TIPOS_DE_ARQUIVO } from "@/lib/dados/catalogo";
import { formatarData } from "@/lib/formato";
import { formatarTamanho } from "@/lib/formato-cliente";
import { exigirOrganizacao, listarSegmentosAtivos } from "@/lib/organizacao";

import { excluirArquivo } from "../actions";

export const metadata: Metadata = { title: "Produto" };

export default async function PaginaProduto({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ novo?: string }>;
}) {
  const { org } = await exigirOrganizacao();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const produto = await obterProduto(org.id, id.data);
  if (!produto) notFound();
  const [segmentos, arquivos, { novo }] = await Promise.all([
    listarSegmentosAtivos(),
    listarArquivosDoProduto(produto.id),
    searchParams,
  ]);

  return (
    <div className="max-w-2xl">
      <Link
        href="/catalogo"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Produtos
      </Link>
      <h2 className="mb-4 text-lg font-semibold">
        <span className="text-muted-foreground">{produto.codigo}</span> {produto.referencia}
      </h2>

      {novo ? (
        <div className="mb-4">
          <MensagemOk>Produto incluído. Agora você pode anexar o catálogo técnico e o registro.</MensagemOk>
        </div>
      ) : null}

      <FormularioProduto key={produto.id} produto={produto} segmentos={segmentos} />

      <section className="mt-8 flex flex-col gap-4" aria-labelledby="titulo-arquivos">
        <div>
          <h3 id="titulo-arquivos" className="font-semibold">
            Arquivos
          </h3>
          <p className="text-sm text-muted-foreground">
            Catálogo técnico, registro ANVISA e outros documentos deste produto.
          </p>
        </div>

        {arquivos.length > 0 ? (
          <ul className="flex flex-col divide-y rounded-lg border">
            {arquivos.map((arquivo) => (
              <li key={arquivo.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{arquivo.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {TIPOS_DE_ARQUIVO[arquivo.tipo] ?? arquivo.tipo} · {formatarTamanho(arquivo.tamanho)} ·{" "}
                    {formatarData(arquivo.criado_em)}
                  </p>
                </div>
                <a
                  href={`/catalogo/arquivos/${arquivo.id}`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <Download aria-hidden />
                  Baixar
                </a>
                <form action={excluirArquivo}>
                  <input type="hidden" name="id" value={arquivo.id} />
                  <BotaoEnviar
                    variant="ghost"
                    size="icon"
                    aria-label={`Excluir ${arquivo.nome}`}
                    title="Excluir arquivo"
                  >
                    <Trash2 aria-hidden />
                  </BotaoEnviar>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Nenhum arquivo anexado.
          </p>
        )}

        <EnvioArquivo orgId={org.id} produtoId={produto.id} />
      </section>
    </div>
  );
}
