"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { REGIOES, TODAS_UFS } from "@/lib/ufs";
import { cn } from "@/lib/utils";

type Props = { selecionadas?: string[]; desabilitado?: boolean };

/** Seleção múltipla de UFs, com "todos", "limpar" e atalho por região. */
export function SeletorUfs({ selecionadas = [], desabilitado }: Props) {
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set(selecionadas));

  const alternar = (sigla: string) =>
    setMarcadas((atual) => {
      const novo = new Set(atual);
      if (novo.has(sigla)) novo.delete(sigla);
      else novo.add(sigla);
      return novo;
    });

  const alternarRegiao = (siglas: string[]) =>
    setMarcadas((atual) => {
      const novo = new Set(atual);
      const todasMarcadas = siglas.every((s) => novo.has(s));
      for (const s of siglas) {
        if (todasMarcadas) novo.delete(s);
        else novo.add(s);
      }
      return novo;
    });

  return (
    <div className="flex flex-col gap-4">
      {[...marcadas].map((sigla) => (
        <input key={sigla} type="hidden" name="ufs" value={sigla} />
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={desabilitado}
          onClick={() => setMarcadas(new Set(TODAS_UFS))}
        >
          Todos
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={desabilitado}
          onClick={() => setMarcadas(new Set())}
        >
          Limpar
        </Button>
        <span className="text-sm text-muted-foreground" aria-live="polite">
          {marcadas.size === 0
            ? "Nenhum estado selecionado"
            : `${marcadas.size} de ${TODAS_UFS.length} selecionados`}
        </span>
      </div>

      {REGIOES.map((regiao) => (
        <div key={regiao.nome} className="flex flex-col gap-2">
          <button
            type="button"
            disabled={desabilitado}
            onClick={() => alternarRegiao(regiao.ufs.map((u) => u.sigla))}
            className="self-start text-xs font-medium tracking-wide text-muted-foreground uppercase hover:text-foreground disabled:pointer-events-none"
            title={`Marcar ou desmarcar a região ${regiao.nome}`}
          >
            {regiao.nome}
          </button>
          <div className="flex flex-wrap gap-1.5">
            {regiao.ufs.map((uf) => {
              const marcada = marcadas.has(uf.sigla);
              return (
                <button
                  key={uf.sigla}
                  type="button"
                  role="checkbox"
                  aria-checked={marcada}
                  aria-label={uf.nome}
                  title={uf.nome}
                  disabled={desabilitado}
                  onClick={() => alternar(uf.sigla)}
                  className={cn(
                    "h-9 min-w-12 rounded-md border px-2.5 text-sm font-medium transition-colors disabled:opacity-70",
                    marcada
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-background hover:bg-muted",
                  )}
                >
                  {uf.sigla}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
