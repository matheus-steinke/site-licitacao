"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const ABAS = [
  { href: "/admin/segmentos", rotulo: "Segmentos" },
  { href: "/admin/organizacoes", rotulo: "Organizações" },
  { href: "/admin/coletor", rotulo: "Rodadas do coletor" },
];

export function AbasAdmin() {
  const pathname = usePathname();
  return (
    <nav aria-label="Seções do painel admin" className="mb-6 flex gap-1 overflow-x-auto border-b">
      {ABAS.map((aba) => {
        const ativa = pathname === aba.href || pathname.startsWith(`${aba.href}/`);
        return (
          <Link
            key={aba.href}
            href={aba.href}
            aria-current={ativa ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap",
              ativa
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {aba.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
