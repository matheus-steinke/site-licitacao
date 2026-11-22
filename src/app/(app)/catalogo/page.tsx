import type { Metadata } from "next";

import { EmConstrucao } from "@/components/app/em-construcao";
import { exigirOrganizacao } from "@/lib/organizacao";

export const metadata: Metadata = { title: "Catálogo" };

export default async function Pagina() {
  await exigirOrganizacao();

  return (
    <EmConstrucao
      titulo="Catálogo"
      etapa={3}
      oQueVem={[
        "Tabela de produtos e preços editável",
        "Importação de Excel e CSV com pré-visualização",
        "Arquivos por produto e lista de exclusões",
      ]}
    />
  );
}
