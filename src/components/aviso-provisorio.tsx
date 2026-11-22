import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function AvisoProvisorio() {
  return (
    <Alert>
      <TriangleAlert aria-hidden />
      <AlertTitle>Texto provisório</AlertTitle>
      <AlertDescription>
        Este documento é um rascunho para o período de testes e ainda será revisado por um
        advogado antes do lançamento comercial.
      </AlertDescription>
    </Alert>
  );
}
