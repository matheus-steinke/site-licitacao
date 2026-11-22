import type { Metadata } from "next";
import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { FormularioRecuperarSenha } from "./formulario";

export const metadata: Metadata = { title: "Recuperar senha" };

export default function PaginaRecuperarSenha() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recuperar senha</CardTitle>
        <CardDescription>
          Informe seu e-mail e enviaremos um link para criar uma nova senha.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FormularioRecuperarSenha />
      </CardContent>
      <CardFooter className="justify-center text-sm">
        <Link href="/entrar" className="font-medium hover:underline">
          Voltar para o login
        </Link>
      </CardFooter>
    </Card>
  );
}
