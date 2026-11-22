import type { Metadata } from "next";

import { EmConstrucao } from "@/components/app/em-construcao";
import { exigirOrganizacao } from "@/lib/organizacao";

export const metadata: Metadata = { title: "Dashboard" };

export default async function Pagina() {
  await exigirOrganizacao();

  return (
    <EmConstrucao
      titulo="Dashboard"
      etapa={7}
      oQueVem={[
        "Licitações disputadas e agendadas",
        "Valor estimado em disputa, pelo LANCE MÍNIMO da sua tabela",
        "Gráficos por mês e por UF e próximas disputas",
      ]}
    />
  );
}
