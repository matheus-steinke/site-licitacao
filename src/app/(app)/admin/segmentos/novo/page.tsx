import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { FormularioSegmento } from "@/components/admin/formulario-segmento";
import { exigirAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Novo segmento · Admin" };

export default async function PaginaNovoSegmento() {
  await exigirAdmin();
  return (
    <div className="max-w-2xl">
      <Link
        href="/admin/segmentos"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Segmentos
      </Link>
      <h2 className="mb-4 text-lg font-semibold">Novo segmento</h2>
      <FormularioSegmento />
    </div>
  );
}
