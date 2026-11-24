import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { DetalheDaLicitacao } from "@/components/oportunidades/detalhe";
import { EsqueletoDoDetalhe } from "@/components/oportunidades/esqueleto";
import { obterLicitacao } from "@/lib/dados/oportunidades";
import { exigirOrganizacao } from "@/lib/organizacao";

export const metadata: Metadata = { title: "Licitação" };

/** Licitação aberta pela Busca. Se for uma oportunidade da empresa, vai para a página dela. */
export default function PaginaLicitacao({ params }: { params: Promise<{ id: string }> }) {
  return (
    <>
      <Link
        href="/busca"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Busca
      </Link>
      <Suspense fallback={<EsqueletoDoDetalhe />}>
        <Detalhe params={params} />
      </Suspense>
    </>
  );
}

async function Detalhe({ params }: { params: Promise<{ id: string }> }) {
  const { org } = await exigirOrganizacao();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const licitacao = await obterLicitacao(org.id, id.data);
  if (!licitacao) notFound();
  if ("oportunidadeId" in licitacao) redirect(`/oportunidades/${licitacao.oportunidadeId}`);
  return <DetalheDaLicitacao op={licitacao.detalhe} />;
}
