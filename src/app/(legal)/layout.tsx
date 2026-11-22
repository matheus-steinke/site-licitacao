import Link from "next/link";

import { Marca } from "@/components/marca";
import { RodapeLegal } from "@/components/rodape-legal";

export default function LayoutLegal({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-8">
      <header>
        <Link href="/">
          <Marca />
        </Link>
      </header>
      <main className="flex flex-col gap-4 text-sm leading-relaxed [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1">
        {children}
      </main>
      <footer className="border-t pt-4">
        <RodapeLegal />
      </footer>
    </div>
  );
}
