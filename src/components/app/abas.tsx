"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export type Aba = {
  href: string;
  rotulo: string;
  /** Marca a aba como ativa só no endereço exato (sem considerar subpáginas). */
  exata?: boolean;
  /** Outros prefixos de endereço que também ativam esta aba. */
  tambem?: string[];
};

/** Abas feitas de links: cada aba é uma página. */
export function Abas({ abas, rotulo }: { abas: Aba[]; rotulo: string }) {
  const pathname = usePathname();
  const comecaCom = (prefixo: string) => pathname === prefixo || pathname.startsWith(`${prefixo}/`);

  // Uma aba "exata" perde para outra mais específica que também case.
  const ativa =
    abas.find((aba) => !aba.exata && (comecaCom(aba.href) || aba.tambem?.some(comecaCom))) ??
    abas.find((aba) => aba.exata);

  return (
    <nav aria-label={rotulo} className="mb-6 flex gap-1 overflow-x-auto border-b">
      {abas.map((aba) => (
        <Link
          key={aba.href}
          href={aba.href}
          aria-current={aba === ativa ? "page" : undefined}
          className={cn(
            "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap",
            aba === ativa
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {aba.rotulo}
        </Link>
      ))}
    </nav>
  );
}
