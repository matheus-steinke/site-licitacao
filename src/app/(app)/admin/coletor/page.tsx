import type { Metadata } from "next";
import { Hammer } from "lucide-react";

import { exigirAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Rodadas do coletor · Admin" };

export default async function PaginaColetor() {
  await exigirAdmin();
  return (
    <div className="rounded-xl border border-dashed p-6">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Hammer className="size-4" aria-hidden />
        Em construção: chega na etapa 4 do plano
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Aqui vão aparecer as rodadas do coletor do PNCP (a cada 2 horas), com sucesso, erro,
        quantidade de licitações novas e atualizadas.
      </p>
    </div>
  );
}
