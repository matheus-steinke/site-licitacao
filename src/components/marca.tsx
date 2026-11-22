import { Stethoscope } from "lucide-react";

import { NOME_APP } from "@/lib/app";
import { cn } from "@/lib/utils";

export function Marca({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Stethoscope className="size-4" aria-hidden />
      </span>
      {NOME_APP}
    </span>
  );
}
