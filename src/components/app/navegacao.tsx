"use client";

import {
  Inbox,
  LayoutDashboard,
  Package,
  Plug,
  Search,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type Item = { href: string; rotulo: string; icone: LucideIcon };

const ITENS: Item[] = [
  { href: "/oportunidades", rotulo: "Oportunidades", icone: Inbox },
  { href: "/busca", rotulo: "Busca", icone: Search },
  { href: "/catalogo", rotulo: "Catálogo", icone: Package },
  { href: "/dashboard", rotulo: "Dashboard", icone: LayoutDashboard },
  { href: "/integracoes", rotulo: "Integrações", icone: Plug },
  { href: "/configuracoes", rotulo: "Configurações", icone: Settings },
];

const ITEM_ADMIN: Item = { href: "/admin", rotulo: "Admin", icone: ShieldCheck };

export function Navegacao({ admin }: { admin: boolean }) {
  const pathname = usePathname();
  const itens = admin ? [...ITENS, ITEM_ADMIN] : ITENS;

  return (
    <nav aria-label="Menu principal" className="flex flex-col gap-0.5">
      {itens.map(({ href, rotulo, icone: Icone }) => {
        const ativo = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={ativo ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
              ativo
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
          >
            <Icone className="size-4 shrink-0" aria-hidden />
            {rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
