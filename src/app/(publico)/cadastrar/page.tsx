import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { FormularioCadastrar } from "./formulario";

export const metadata: Metadata = { title: "Criar conta" };

export default function PaginaCadastrar() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Criar conta</CardTitle>
        <CardDescription>
          Comece pela sua conta; os dados da empresa vêm no passo seguinte.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>
          <FormularioCadastrar />
        </Suspense>
      </CardContent>
      <CardFooter className="justify-center text-sm text-muted-foreground">
        Já tem conta?&nbsp;
        <Link href="/entrar" className="font-medium text-foreground hover:underline">
          Entrar
        </Link>
      </CardFooter>
    </Card>
  );
}
