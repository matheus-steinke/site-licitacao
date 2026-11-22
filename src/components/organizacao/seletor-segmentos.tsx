"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

type Segmento = { id: string; nome: string; palavras_chave: string[] };
type Props = { segmentos: Segmento[]; selecionados?: string[]; desabilitado?: boolean };

/** Seleção múltipla dos segmentos de interesse. */
export function SeletorSegmentos({ segmentos, selecionados = [], desabilitado }: Props) {
  const [marcados, setMarcados] = useState<Set<string>>(new Set(selecionados));

  const alternar = (id: string) =>
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={desabilitado}
          onClick={() => setMarcados(new Set(segmentos.map((s) => s.id)))}
        >
          Todos
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={desabilitado}
          onClick={() => setMarcados(new Set())}
        >
          Limpar
        </Button>
        <span className="text-sm text-muted-foreground" aria-live="polite">
          {marcados.size === 0
            ? "Nenhum segmento selecionado"
            : `${marcados.size} de ${segmentos.length} selecionados`}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {segmentos.map((segmento) => (
          <label
            key={segmento.id}
            className="flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm has-checked:border-primary has-checked:bg-muted has-disabled:cursor-default has-disabled:opacity-70"
          >
            <input
              type="checkbox"
              name="segmentos"
              value={segmento.id}
              checked={marcados.has(segmento.id)}
              onChange={() => alternar(segmento.id)}
              disabled={desabilitado}
              className="mt-0.5 size-4 shrink-0 accent-primary"
            />
            <span className="min-w-0">
              <span className="block font-medium">{segmento.nome}</span>
              <span className="line-clamp-2 text-xs text-muted-foreground">
                {segmento.palavras_chave.slice(0, 4).join(", ")}
                {segmento.palavras_chave.length > 4 ? "…" : ""}
              </span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
