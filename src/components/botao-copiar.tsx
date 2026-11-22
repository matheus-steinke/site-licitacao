"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/** Copia um texto para a área de transferência e confirma por 2 segundos. */
export function BotaoCopiar({ texto, rotulo = "Copiar" }: { texto: string; rotulo?: string }) {
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sem permissão de área de transferência: a pessoa ainda pode selecionar o texto.
    }
  };

  return (
    <Button type="button" variant="outline" size="sm" onClick={copiar}>
      {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
      {copiado ? "Copiado" : rotulo}
    </Button>
  );
}
