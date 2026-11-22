import type { Metadata } from "next";

import { EmConstrucao } from "@/components/app/em-construcao";
import { exigirOrganizacao } from "@/lib/organizacao";

export const metadata: Metadata = { title: "Integrações" };

export default async function Pagina() {
  await exigirOrganizacao();

  return (
    <EmConstrucao
      titulo="Integrações"
      etapa={8}
      oQueVem={[
        "Google Agenda: evento criado ao aprovar uma oportunidade",
        "Google Drive: pastas do processo e arquivos do edital",
      ]}
    />
  );
}
