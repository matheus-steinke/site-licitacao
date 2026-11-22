import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { FormularioSegmento } from "@/components/admin/formulario-segmento";
import { exigirAdmin } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Editar segmento · Admin" };

export default async function PaginaEditarSegmento({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigirAdmin();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const supabase = await criarClienteServidor();
  const { data: segmento } = await supabase
    .from("segmentos")
    .select("id, nome, ordem, ativo, palavras_chave, sinonimos, exclusoes")
    .eq("id", id.data)
    .maybeSingle();
  if (!segmento) notFound();

  return (
    <div className="max-w-2xl">
      <Link
        href="/admin/segmentos"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Segmentos
      </Link>
      <h2 className="mb-4 text-lg font-semibold">{segmento.nome}</h2>
      <FormularioSegmento key={segmento.id} segmento={segmento} />
    </div>
  );
}
