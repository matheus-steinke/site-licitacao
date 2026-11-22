import type { Metadata } from "next";

import { EmConstrucao } from "@/components/app/em-construcao";

export const metadata: Metadata = { title: "Configurações" };

export default function Pagina() {
  return (
    <EmConstrucao
      titulo="Configurações"
      etapa={2}
      oQueVem={[
        "Dados da empresa, UFs atendidas e segmentos",
        "Usuários da organização",
        "Notificações e exclusão da conta",
      ]}
    />
  );
}
