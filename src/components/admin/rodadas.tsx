import { Badge } from "@/components/ui/badge";

const STATUS: Record<string, { rotulo: string; variante: "secondary" | "destructive" | "outline" | "default" }> = {
  sucesso: { rotulo: "Sucesso", variante: "secondary" },
  parcial: { rotulo: "Parcial", variante: "outline" },
  erro: { rotulo: "Erro", variante: "destructive" },
  em_andamento: { rotulo: "Em andamento", variante: "default" },
};

export function SeloDeStatus({ status }: { status: string }) {
  const s = STATUS[status] ?? { rotulo: status, variante: "outline" as const };
  return <Badge variant={s.variante}>{s.rotulo}</Badge>;
}

/** "3 min 12 s" entre o início e o fim da rodada. */
export function duracao(inicio: string, fim: string | null): string {
  if (!fim) return "—";
  const segundos = Math.max(0, Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 1000));
  return segundos < 60 ? `${segundos} s` : `${Math.floor(segundos / 60)} min ${segundos % 60} s`;
}
