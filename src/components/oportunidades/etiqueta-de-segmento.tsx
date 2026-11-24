import { corDoSegmento } from "@/lib/segmentos-cores";
import { cn } from "@/lib/utils";

/**
 * Etiqueta colorida com o nome de um segmento de interesse da empresa. A cor nunca é a única
 * pista: o nome vai junto. A posição é a do segmento entre os segmentos da empresa.
 */
export function EtiquetaDeSegmento({
  nome,
  posicao,
  quantidade,
}: {
  nome: string;
  posicao: number;
  /** Quantos itens da licitação são deste segmento. */
  quantidade?: number;
}) {
  const cor = corDoSegmento(posicao);
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium", cor.etiqueta)}
      data-testid="etiqueta-de-segmento"
    >
      <span className={cn("size-2 shrink-0 rounded-full", cor.ponto)} aria-hidden />
      {nome}
      {quantidade === undefined ? null : (
        <span className="tabular-nums opacity-80">
          · {quantidade} {quantidade === 1 ? "item" : "itens"}
        </span>
      )}
    </span>
  );
}
