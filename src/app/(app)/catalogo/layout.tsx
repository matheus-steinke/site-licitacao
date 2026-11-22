import { Suspense } from "react";

import { Abas } from "@/components/app/abas";

const ABAS = [
  // "Produtos" também fica ativa na página de um produto (/catalogo/<id>, /catalogo/novo).
  { href: "/catalogo", rotulo: "Produtos", exata: true },
  { href: "/catalogo/importar", rotulo: "Importar tabela" },
  { href: "/catalogo/exclusoes", rotulo: "Exclusões" },
];

export default function LayoutCatalogo({ children }: { children: React.ReactNode }) {
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold tracking-tight">Catálogo</h1>
      <Suspense fallback={<div className="mb-6 h-10 border-b" />}>
        <Abas abas={ABAS} rotulo="Seções do catálogo" />
      </Suspense>
      {children}
    </>
  );
}
