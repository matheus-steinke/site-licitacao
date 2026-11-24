"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Alterna, sem recarregar a página, entre todos os itens do edital e só os dos segmentos da
 * empresa. As duas tabelas já chegam prontas do servidor.
 */
export function AlternarItens({
  todos,
  dosSegmentos,
  quantidadeDosSegmentos,
}: {
  todos: React.ReactNode;
  dosSegmentos: React.ReactNode;
  quantidadeDosSegmentos: number;
}) {
  const [soSegmentos, setSoSegmentos] = useState(false);
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Itens a mostrar">
        <span className="text-muted-foreground">Mostrar:</span>
        <Button
          size="sm"
          variant={soSegmentos ? "outline" : "default"}
          aria-pressed={!soSegmentos}
          onClick={() => setSoSegmentos(false)}
        >
          Todos os itens
        </Button>
        <Button
          size="sm"
          variant={soSegmentos ? "default" : "outline"}
          aria-pressed={soSegmentos}
          onClick={() => setSoSegmentos(true)}
        >
          Só dos meus segmentos ({quantidadeDosSegmentos})
        </Button>
      </div>
      {soSegmentos ? dosSegmentos : todos}
    </>
  );
}
