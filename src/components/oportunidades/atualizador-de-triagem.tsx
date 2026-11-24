"use client";

import { LoaderCircle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { atualizarTriagem } from "@/app/(app)/oportunidades/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Aparece quando há licitações ainda não comparadas com o catálogo (o cliente mudou catálogo,
 * exclusões, segmentos, estados ou limites, ou o coletor trouxe novidades). Compara em lotes,
 * mostrando o andamento, e recarrega a lista no fim.
 */
export function AtualizadorDeTriagem({ pendentes }: { pendentes: number }) {
  const router = useRouter();
  const [feitas, setFeitas] = useState(0);
  const [total, setTotal] = useState(pendentes);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const rodando = useRef(false);

  useEffect(() => {
    if (rodando.current) return;
    rodando.current = true;
    let cancelado = false;

    (async () => {
      let somadas = 0;
      // Limite de segurança: nunca fica chamando o servidor para sempre.
      for (let lote = 0; lote < 200 && !cancelado; lote++) {
        const r = await atualizarTriagem();
        if (cancelado) return;
        if (!r.ok) {
          setErro(r.erro);
          break;
        }
        somadas += r.feitas;
        setFeitas(somadas);
        setTotal(somadas + r.restantes);
        if (r.restantes === 0) {
          router.refresh();
          break;
        }
      }
      rodando.current = false;
    })();

    return () => {
      cancelado = true;
      rodando.current = false;
    };
  }, [router, tentativa]);

  if (erro) {
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertTitle>A triagem não foi atualizada</AlertTitle>
        <AlertDescription>
          <p>{erro}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => {
              setErro(null);
              setTentativa((n) => n + 1);
            }}
          >
            <RefreshCw aria-hidden />
            Tentar de novo
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const porcento = total > 0 ? Math.min(100, Math.round((feitas / total) * 100)) : 0;
  return (
    <Alert className="mb-4" data-testid="atualizador-de-triagem">
      <LoaderCircle className="animate-spin" aria-hidden />
      <AlertTitle>Comparando as licitações com o seu catálogo</AlertTitle>
      <AlertDescription>
        <p role="status">
          {total > 0 ? `${feitas} de ${total} licitações` : "Preparando…"}. A lista abaixo é atualizada ao terminar.
        </p>
        <div
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={porcento}
          aria-label="Andamento da triagem"
        >
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${porcento}%` }} />
        </div>
      </AlertDescription>
    </Alert>
  );
}
