import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Contagem, MesDoDashboard, UfDoDashboard } from "@/lib/dashboard/resumo";
import { formatarMoeda } from "@/lib/formato";
import { cn } from "@/lib/utils";

/** Quantos meses cabem no gráfico (a tabela mostra todos). */
export const MESES_NO_GRAFICO = 12;
/** Quantos estados cabem no gráfico; o resto vira "Outros" (a tabela mostra todos). */
export const UFS_NO_GRAFICO = 8;

const ALTURA_DAS_COLUNAS = 144;

const plural = (n: number, um: string, varios: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;

function descrever(nome: string, c: Contagem): string {
  return `${nome}: ${plural(c.disputadas, "disputada", "disputadas")}, ${plural(c.agendadas, "agendada", "agendadas")}, ${formatarMoeda(c.valor)} pelo lance mínimo`;
}

export function LegendaDosGraficos() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legenda">
      <li className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-[2px] bg-(--grafico-disputadas)" aria-hidden />
        Disputadas
      </li>
      <li className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-[2px] bg-(--grafico-agendadas)" aria-hidden />
        Agendadas
      </li>
    </ul>
  );
}

/** Aparece ao passar o mouse ou focar com o teclado; os mesmos números estão na tabela. */
function Dica({ titulo, c, className }: { titulo: string; c: Contagem; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute z-10 hidden w-max max-w-60 rounded-lg border bg-popover px-2.5 py-2 text-left text-xs text-popover-foreground shadow-md group-hover:block group-focus-visible:block",
        className,
      )}
    >
      <span className="block font-medium">{titulo}</span>
      <span className="mt-1 flex items-center gap-1.5">
        <span className="h-0.5 w-3 bg-(--grafico-disputadas)" />
        <span className="font-semibold tabular-nums">{c.disputadas}</span>
        <span className="text-muted-foreground">{c.disputadas === 1 ? "disputada" : "disputadas"}</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-3 bg-(--grafico-agendadas)" />
        <span className="font-semibold tabular-nums">{c.agendadas}</span>
        <span className="text-muted-foreground">{c.agendadas === 1 ? "agendada" : "agendadas"}</span>
      </span>
      <span className="mt-1 block">
        <span className="font-semibold tabular-nums">{formatarMoeda(c.valor)}</span>{" "}
        <span className="text-muted-foreground">pelo lance mínimo</span>
      </span>
    </span>
  );
}

function TabelaEquivalente({
  rotulo,
  linhas,
}: {
  rotulo: string;
  linhas: (Contagem & { chave: string; nome: string })[];
}) {
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-muted-foreground underline-offset-4 hover:underline">Ver em tabela</summary>
      <div className="mt-2 overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{rotulo}</TableHead>
              <TableHead className="text-right">Disputadas</TableHead>
              <TableHead className="text-right">Agendadas</TableHead>
              <TableHead className="text-right">Valor pelo lance mínimo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((linha) => (
              <TableRow key={linha.chave}>
                <TableCell>{linha.nome}</TableCell>
                <TableCell className="text-right tabular-nums">{linha.disputadas}</TableCell>
                <TableCell className="text-right tabular-nums">{linha.agendadas}</TableCell>
                <TableCell className="text-right tabular-nums">{formatarMoeda(linha.valor)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </details>
  );
}

/** Colunas empilhadas: licitações por mês da disputa, disputadas embaixo e agendadas em cima. */
export function GraficoPorMes({ meses }: { meses: MesDoDashboard[] }) {
  const visiveis = meses.slice(-MESES_NO_GRAFICO);
  const maximo = Math.max(1, ...visiveis.map((m) => m.disputadas + m.agendadas));

  return (
    <figure data-testid="grafico-por-mes">
      <ol
        className="flex items-end gap-1 border-b"
        style={{ height: ALTURA_DAS_COLUNAS + 24 }}
        aria-label="Licitações por mês da disputa"
      >
        {visiveis.map((m, indice) => {
          const total = m.disputadas + m.agendadas;
          const altura = total > 0 ? Math.max(4, Math.round((total / maximo) * ALTURA_DAS_COLUNAS)) : 0;
          return (
            <li
              key={m.mes}
              tabIndex={0}
              aria-label={descrever(m.nome, m)}
              className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span aria-hidden className="mb-1 text-xs text-muted-foreground tabular-nums">
                {total > 0 ? total : ""}
              </span>
              <span
                aria-hidden
                className="flex w-full max-w-6 flex-col-reverse gap-0.5 group-hover:brightness-110 group-focus-visible:brightness-110"
                style={{ height: altura }}
              >
                {m.disputadas > 0 ? (
                  <span
                    className={cn("min-h-[3px] bg-(--grafico-disputadas)", m.agendadas === 0 && "rounded-t-[4px]")}
                    style={{ flex: `${m.disputadas} 1 0` }}
                  />
                ) : null}
                {m.agendadas > 0 ? (
                  <span
                    className="min-h-[3px] rounded-t-[4px] bg-(--grafico-agendadas)"
                    style={{ flex: `${m.agendadas} 1 0` }}
                  />
                ) : null}
              </span>
              <Dica
                titulo={m.nome}
                c={m}
                className={cn(
                  "bottom-full mb-1",
                  indice < visiveis.length / 3
                    ? "left-0"
                    : indice >= (visiveis.length * 2) / 3
                      ? "right-0"
                      : "left-1/2 -translate-x-1/2",
                )}
              />
            </li>
          );
        })}
      </ol>
      <ol className="mt-1 flex gap-1 text-center text-[11px] leading-tight text-muted-foreground" aria-hidden>
        {visiveis.map((m, indice) => (
          <li key={m.mes} className="min-w-0 flex-1">
            <span className="block">{m.rotulo}</span>
            {/* O ano só aparece na primeira coluna e em cada janeiro. */}
            <span className="block">{indice === 0 || m.rotulo === "jan" ? m.ano : " "}</span>
          </li>
        ))}
      </ol>
      {meses.length > visiveis.length ? (
        <figcaption className="mt-2 text-xs text-muted-foreground">
          O gráfico mostra os {MESES_NO_GRAFICO} meses mais recentes do período; a tabela tem todos.
        </figcaption>
      ) : null}
      <TabelaEquivalente rotulo="Mês" linhas={meses.map((m) => ({ ...m, chave: m.mes, nome: m.nome }))} />
    </figure>
  );
}

/** Barras deitadas: licitações por estado, do que tem mais para o que tem menos. */
export function GraficoPorUf({ ufs }: { ufs: UfDoDashboard[] }) {
  const principais = ufs.slice(0, UFS_NO_GRAFICO);
  const resto = ufs.slice(UFS_NO_GRAFICO);
  const linhas: (Contagem & { chave: string; rotulo: string; nome: string })[] = principais.map((u) => ({
    ...u,
    chave: u.uf,
    rotulo: u.uf,
    nome: u.uf,
  }));
  if (resto.length > 0) {
    linhas.push({
      chave: "outros",
      rotulo: "Outros",
      nome: `Outros ${resto.length} estados`,
      disputadas: resto.reduce((soma, u) => soma + u.disputadas, 0),
      agendadas: resto.reduce((soma, u) => soma + u.agendadas, 0),
      valor: resto.reduce((soma, u) => soma + u.valor, 0),
    });
  }
  const maximo = Math.max(1, ...linhas.map((l) => l.disputadas + l.agendadas));

  return (
    <figure data-testid="grafico-por-uf">
      <ol className="flex flex-col gap-2.5" aria-label="Licitações por estado">
        {linhas.map((linha) => {
          const total = linha.disputadas + linha.agendadas;
          return (
            <li
              key={linha.chave}
              tabIndex={0}
              aria-label={descrever(linha.nome, linha)}
              className="group relative grid grid-cols-[3.25rem_1fr] items-center gap-2 rounded-sm text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="font-medium">{linha.rotulo}</span>
              <span className="flex items-center gap-2" aria-hidden>
                <span
                  className="flex h-4 gap-0.5 group-hover:brightness-110 group-focus-visible:brightness-110"
                  style={{ width: `calc((100% - 2.5rem) * ${total / maximo})`, minWidth: 4 }}
                >
                  {linha.disputadas > 0 ? (
                    <span
                      className={cn("min-w-[3px] bg-(--grafico-disputadas)", linha.agendadas === 0 && "rounded-r-[4px]")}
                      style={{ flex: `${linha.disputadas} 1 0` }}
                    />
                  ) : null}
                  {linha.agendadas > 0 ? (
                    <span
                      className="min-w-[3px] rounded-r-[4px] bg-(--grafico-agendadas)"
                      style={{ flex: `${linha.agendadas} 1 0` }}
                    />
                  ) : null}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">{total}</span>
              </span>
              <Dica titulo={linha.nome} c={linha} className="bottom-full left-13 mb-1" />
            </li>
          );
        })}
      </ol>
      <TabelaEquivalente rotulo="Estado" linhas={ufs.map((u) => ({ ...u, chave: u.uf, nome: u.uf }))} />
    </figure>
  );
}
