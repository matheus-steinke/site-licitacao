import { redirect } from "next/navigation";

// O proxy manda visitantes para /entrar; quem está logado segue para a tela principal.
export default function Inicio() {
  redirect("/oportunidades");
}
