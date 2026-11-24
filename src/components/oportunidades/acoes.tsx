"use client";

import { Check, RotateCcw, ThumbsDown, ThumbsUp, Trophy, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { decidirOportunidade } from "@/app/(app)/oportunidades/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { StatusOportunidade } from "@/lib/dados/oportunidades";

const MOTIVOS = [
  "Fora da nossa linha de produtos",
  "Preço de referência baixo",
  "Prazo ou logística de entrega",
  "Exigência do edital que não atendemos",
  "Região que não atendemos",
];

type Props = {
  id: string;
  status: StatusOportunidade;
  /** A disputa já aconteceu. */
  encerrada: boolean;
};

/** Botões de decisão de uma oportunidade: aprovar, descartar (com motivo), reabrir, ganha/perdida. */
export function AcoesDaOportunidade({ id, status, encerrada }: Props) {
  const [salvando, iniciar] = useTransition();
  const [descartando, setDescartando] = useState(false);
  const [motivo, setMotivo] = useState("");

  const decidir = (novo: StatusOportunidade, mensagem: string, motivoDoDescarte?: string) =>
    iniciar(async () => {
      const r = await decidirOportunidade({ id, status: novo, motivo: motivoDoDescarte });
      if (r.ok) {
        toast.success(mensagem);
        setDescartando(false);
        setMotivo("");
      } else toast.error(r.erro);
    });

  if (descartando) {
    const idDoCampo = `motivo-${id}`;
    return (
      <div className="flex w-full flex-col gap-2 rounded-lg border bg-muted/30 p-3">
        <Label htmlFor={idDoCampo}>Por que descartar?</Label>
        <div className="flex flex-wrap gap-1.5">
          {MOTIVOS.map((opcao) => (
            <Button
              key={opcao}
              type="button"
              size="sm"
              variant={motivo === opcao ? "default" : "outline"}
              aria-pressed={motivo === opcao}
              onClick={() => setMotivo(opcao)}
            >
              {opcao}
            </Button>
          ))}
        </div>
        <Textarea
          id={idDoCampo}
          value={motivo}
          onChange={(evento) => setMotivo(evento.target.value)}
          placeholder="Escolha um motivo acima ou escreva o seu"
          maxLength={500}
          rows={2}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="destructive"
            size="sm"
            disabled={salvando || motivo.trim().length < 2}
            onClick={() => decidir("descartada", "Oportunidade descartada.", motivo.trim())}
          >
            <ThumbsDown aria-hidden />
            Confirmar descarte
          </Button>
          <Button variant="ghost" size="sm" disabled={salvando} onClick={() => setDescartando(false)}>
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  const descartar = (
    <Button variant="outline" size="sm" disabled={salvando} onClick={() => setDescartando(true)}>
      <ThumbsDown aria-hidden />
      Descartar
    </Button>
  );

  if (status === "nova") {
    return (
      <>
        <Button size="sm" disabled={salvando} onClick={() => decidir("aprovada", "Oportunidade aprovada.")}>
          <ThumbsUp aria-hidden />
          Aprovar
        </Button>
        {descartar}
      </>
    );
  }
  if (status === "aprovada" && !encerrada) {
    return (
      <>
        <Button variant="outline" size="sm" disabled={salvando} onClick={() => decidir("nova", "Aprovação desfeita.")}>
          <RotateCcw aria-hidden />
          Desfazer aprovação
        </Button>
        {descartar}
      </>
    );
  }
  if (status === "aprovada") {
    return (
      <>
        <Button size="sm" disabled={salvando} onClick={() => decidir("ganha", "Marcada como ganha.")}>
          <Trophy aria-hidden />
          Ganhamos
        </Button>
        <Button variant="outline" size="sm" disabled={salvando} onClick={() => decidir("perdida", "Marcada como perdida.")}>
          <X aria-hidden />
          Perdemos
        </Button>
      </>
    );
  }
  if (status === "ganha" || status === "perdida") {
    return (
      <Button variant="outline" size="sm" disabled={salvando} onClick={() => decidir("aprovada", "Resultado desfeito.")}>
        <RotateCcw aria-hidden />
        Desfazer resultado
      </Button>
    );
  }
  return (
    <Button variant="outline" size="sm" disabled={salvando} onClick={() => decidir("nova", "Oportunidade reaberta.")}>
      <Check aria-hidden />
      Reabrir
    </Button>
  );
}
