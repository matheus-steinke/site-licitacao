import { Suspense } from "react";

import { AbasAdmin } from "@/components/admin/abas-admin";

// A checagem de admin fica em cada página (exigirAdmin) e no RLS do banco.
export default function LayoutAdmin({ children }: { children: React.ReactNode }) {
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold tracking-tight">Admin da plataforma</h1>
      <Suspense fallback={<div className="mb-6 h-10 border-b" />}>
        <AbasAdmin />
      </Suspense>
      {children}
    </>
  );
}
