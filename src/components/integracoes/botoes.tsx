"use client";

import { LoaderCircle, RefreshCw, Unplug } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { desconectarGoogle, sincronizarComGoogle } from "@/app/(app)/integracoes/actions";
import { Button } from "@/components/ui/button";

/** Cria ou atualiza o evento, as pastas e os arquivos da oportunidade no Google. */
export function BotaoSincronizar({ oportunidadeId, rotulo }: { oportunidadeId: string; rotulo: string }) {
  const [rodando, iniciar] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={rodando}
      aria-busy={rodando}
      onClick={() =>
        iniciar(async () => {
          const r = await sincronizarComGoogle(oportunidadeId);
          if (r.ok) toast.success(r.mensagem);
          else toast.error(r.erro);
        })
      }
    >
      {rodando ? <LoaderCircle className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
      {rodando ? "Sincronizando…" : rotulo}
    </Button>
  );
}

/** Desconectar pede confirmação: os próximos eventos e pastas deixam de ser criados. */
export function BotaoDesconectar() {
  const [rodando, iniciar] = useTransition();
  const [confirmando, setConfirmando] = useState(false);

  if (!confirmando) {
    return (
      <Button variant="outline" size="sm" onClick={() => setConfirmando(true)}>
        <Unplug aria-hidden />
        Desconectar
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span>Desconectar o Google?</span>
      <Button
        variant="destructive"
        size="sm"
        disabled={rodando}
        onClick={() =>
          iniciar(async () => {
            const r = await desconectarGoogle();
            if (r.ok) toast.success(r.mensagem);
            else toast.error(r.erro);
            setConfirmando(false);
          })
        }
      >
        {rodando ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
        Sim, desconectar
      </Button>
      <Button variant="ghost" size="sm" disabled={rodando} onClick={() => setConfirmando(false)}>
        Cancelar
      </Button>
    </div>
  );
}
