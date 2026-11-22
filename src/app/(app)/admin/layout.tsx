import { Suspense } from "react";

import { Abas } from "@/components/app/abas";

const ABAS = [
  { href: "/admin/segmentos", rotulo: "Segmentos" },
  { href: "/admin/organizacoes", rotulo: "Organizações" },
  { href: "/admin/coletor", rotulo: "Rodadas do coletor" },
];

// A checagem de admin fica em cada página (exigirAdmin) e no RLS do banco.
export default function LayoutAdmin({ children }: { children: React.ReactNode }) {
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold tracking-tight">Admin da plataforma</h1>
      <Suspense fallback={<div className="mb-6 h-10 border-b" />}>
        <Abas abas={ABAS} rotulo="Seções do painel admin" />
      </Suspense>
      {children}
    </>
  );
}
