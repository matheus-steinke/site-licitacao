import { Skeleton } from "@/components/ui/skeleton";

/** Aparece enquanto os dados da licitação chegam. */
export function EsqueletoDoDetalhe() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Carregando a licitação">
      <Skeleton className="h-7 w-80 max-w-full" />
      <Skeleton className="h-4 w-56" />
      <Skeleton className="h-44 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
