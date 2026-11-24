import { CircleAlert, CircleCheck, Info } from "lucide-react";

import { descreverAlerta, type Tom } from "@/lib/triagem/alertas";
import type { Alerta } from "@/lib/triagem/motor";
import { cn } from "@/lib/utils";

const ESTILO: Record<Tom, string> = {
  atencao: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200",
  informacao: "border-border bg-muted text-foreground",
  bom: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
};

const ICONE: Record<Tom, typeof Info> = { atencao: CircleAlert, informacao: Info, bom: CircleCheck };

export function ChipDeAlerta({ texto, tom }: { texto: string; tom: Tom }) {
  const Icone = ICONE[tom];
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", ESTILO[tom])}
    >
      <Icone className="size-3 shrink-0" aria-hidden />
      {texto}
    </span>
  );
}

/** Os alertas de uma oportunidade, um chip para cada. */
export function ChipsDeAlerta({ alertas }: { alertas: Alerta[] }) {
  return (
    <>
      {alertas.map((alerta, indice) => {
        const { texto, tom } = descreverAlerta(alerta);
        return <ChipDeAlerta key={`${alerta.tipo}-${indice}`} texto={texto} tom={tom} />;
      })}
    </>
  );
}
