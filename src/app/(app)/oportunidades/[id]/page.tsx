import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { DetalheDaLicitacao } from "@/components/oportunidades/detalhe";
import { EsqueletoDoDetalhe } from "@/components/oportunidades/esqueleto";
import { obterOportunidade } from "@/lib/dados/oportunidades";
import { exigirOrganizacao } from "@/lib/organizacao";

export const metadata: Metadata = { title: "Oportunidade" };

/** O link de volta aparece na hora; o resto chega em seguida. */
export default function PaginaOportunidade({ params }: { params: Promise<{ id: string }> }) {
  return (
    <>
      <Link
        href="/oportunidades"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Oportunidades
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
  const op = await obterOportunidade(org.id, id.data);
  if (!op) notFound();
  return <DetalheDaLicitacao op={op} />;
}
