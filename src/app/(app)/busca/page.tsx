import type { Metadata } from "next";

import { EmConstrucao } from "@/components/app/em-construcao";

export const metadata: Metadata = { title: "Busca" };

export default function Pagina() {
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
