import type { Metadata } from "next";

import { EmConstrucao } from "@/components/app/em-construcao";
import { exigirOrganizacao } from "@/lib/organizacao";

export const metadata: Metadata = { title: "Busca" };

export default async function Pagina() {
  await exigirOrganizacao();

  return (
    <EmConstrucao
      titulo="Busca"
      etapa={6}
      oQueVem={[
        "Pesquisa por palavra-chave no objeto e nos itens",
        "Filtros por segmento, UF, período, modalidade e situação",
        "Buscas salvas",
      ]}
    />
  );
}
