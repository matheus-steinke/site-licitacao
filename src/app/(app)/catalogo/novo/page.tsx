import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { FormularioProduto } from "@/components/catalogo/formulario-produto";
import { exigirOrganizacao, listarSegmentosAtivos } from "@/lib/organizacao";

export const metadata: Metadata = { title: "Incluir produto" };

export default async function PaginaNovoProduto() {
  await exigirOrganizacao();
  const segmentos = await listarSegmentosAtivos();

  return (
    <div className="max-w-2xl">
      <Link
        href="/catalogo"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Produtos
      </Link>
      <h2 className="mb-4 text-lg font-semibold">Incluir produto</h2>
      <FormularioProduto segmentos={segmentos} />
    </div>
  );
}
