import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { FormularioRedefinirSenha } from "./formulario";

export const metadata: Metadata = { title: "Nova senha" };

export default function PaginaRedefinirSenha() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Criar nova senha</CardTitle>
        <CardDescription>Escolha a senha que você vai usar a partir de agora.</CardDescription>
      </CardHeader>
      <CardContent>
        <FormularioRedefinirSenha />
      </CardContent>
    </Card>
  );
}
