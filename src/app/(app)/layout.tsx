import Link from "next/link";

import { ConteudoMenu } from "@/components/app/conteudo-menu";
import { MenuMovel } from "@/components/app/menu-movel";
import { Marca } from "@/components/marca";

export default function LayoutApp({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-4 border-r bg-sidebar p-3 md:flex">
        <Link href="/oportunidades" className="px-1.5 py-1">
          <Marca />
        </Link>
        <ConteudoMenu />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-1 border-b bg-background/95 px-2 py-1.5 backdrop-blur md:hidden">
          <MenuMovel>
            <ConteudoMenu />
          </MenuMovel>
          <Link href="/oportunidades">
            <Marca />
          </Link>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
