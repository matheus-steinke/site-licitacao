import { Hammer } from "lucide-react";


import { CabecalhoPagina } from "./cabecalho-pagina";

/** Tela reservada para uma etapa futura do plano (docs/ARQUITETURA.md). */
export function EmConstrucao({
  titulo,
  etapa,
  oQueVem,
}: {
  titulo: string;
  etapa: number;
  oQueVem: string[];
}) {
  return (
    <>
      <CabecalhoPagina titulo={titulo} />
      <div className="rounded-xl border border-dashed p-6">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Hammer className="size-4" aria-hidden />
          Em construção: chega na etapa {etapa} do plano
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {oQueVem.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </>
  );
}
