import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EmConstrucao } from "@/components/app/em-construcao";
import { ehAdminPlataforma, exigirUsuario } from "@/lib/auth";

export const metadata: Metadata = { title: "Admin" };

export default async function PaginaAdmin() {
  await exigirUsuario();
  // Quem não é admin da plataforma nem fica sabendo que a página existe.
  if (!(await ehAdminPlataforma())) notFound();

  return (
    <EmConstrucao
      titulo="Admin"
      etapa={2}
      oQueVem={[
        "Segmentos: palavras-chave, sinônimos e exclusões (etapa 2)",
        "Organizações cadastradas (etapa 2)",
        "Rodadas do coletor: sucesso e erro (etapa 4)",
      ]}
    />
  );
}
