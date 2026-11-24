// Uma cor para cada segmento de interesse da empresa, para destacar os itens na tela.
// As classes ficam escritas por extenso: o Tailwind só gera o que encontra no código.

export type CorDeSegmento = {
  /** Fundo da linha da tabela. */
  linha: string;
  /** Faixa na borda esquerda da primeira célula. */
  faixa: string;
  /** Etiqueta com o nome do segmento. */
  etiqueta: string;
  /** Bolinha da legenda. */
  ponto: string;
};

const CORES: CorDeSegmento[] = [
  {
    linha: "bg-sky-50 hover:bg-sky-100/70 dark:bg-sky-950/40 dark:hover:bg-sky-950/60",
    faixa: "border-l-4 border-l-sky-500",
    etiqueta: "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-200",
    ponto: "bg-sky-500",
  },
  {
    linha: "bg-violet-50 hover:bg-violet-100/70 dark:bg-violet-950/40 dark:hover:bg-violet-950/60",
    faixa: "border-l-4 border-l-violet-500",
    etiqueta: "border-violet-300 bg-violet-100 text-violet-900 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-200",
    ponto: "bg-violet-500",
  },
  {
    linha: "bg-teal-50 hover:bg-teal-100/70 dark:bg-teal-950/40 dark:hover:bg-teal-950/60",
    faixa: "border-l-4 border-l-teal-500",
    etiqueta: "border-teal-300 bg-teal-100 text-teal-900 dark:border-teal-700 dark:bg-teal-950 dark:text-teal-200",
    ponto: "bg-teal-500",
  },
  {
    linha: "bg-rose-50 hover:bg-rose-100/70 dark:bg-rose-950/40 dark:hover:bg-rose-950/60",
    faixa: "border-l-4 border-l-rose-500",
    etiqueta: "border-rose-300 bg-rose-100 text-rose-900 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-200",
    ponto: "bg-rose-500",
  },
  {
    linha: "bg-orange-50 hover:bg-orange-100/70 dark:bg-orange-950/40 dark:hover:bg-orange-950/60",
    faixa: "border-l-4 border-l-orange-500",
    etiqueta: "border-orange-300 bg-orange-100 text-orange-900 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-200",
    ponto: "bg-orange-500",
  },
  {
    linha: "bg-indigo-50 hover:bg-indigo-100/70 dark:bg-indigo-950/40 dark:hover:bg-indigo-950/60",
    faixa: "border-l-4 border-l-indigo-500",
    etiqueta: "border-indigo-300 bg-indigo-100 text-indigo-900 dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-200",
    ponto: "bg-indigo-500",
  },
  {
    linha: "bg-lime-50 hover:bg-lime-100/70 dark:bg-lime-950/40 dark:hover:bg-lime-950/60",
    faixa: "border-l-4 border-l-lime-500",
    etiqueta: "border-lime-300 bg-lime-100 text-lime-900 dark:border-lime-700 dark:bg-lime-950 dark:text-lime-200",
    ponto: "bg-lime-500",
  },
  {
    linha: "bg-fuchsia-50 hover:bg-fuchsia-100/70 dark:bg-fuchsia-950/40 dark:hover:bg-fuchsia-950/60",
    faixa: "border-l-4 border-l-fuchsia-500",
    etiqueta: "border-fuchsia-300 bg-fuchsia-100 text-fuchsia-900 dark:border-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-200",
    ponto: "bg-fuchsia-500",
  },
  {
    linha: "bg-cyan-50 hover:bg-cyan-100/70 dark:bg-cyan-950/40 dark:hover:bg-cyan-950/60",
    faixa: "border-l-4 border-l-cyan-500",
    etiqueta: "border-cyan-300 bg-cyan-100 text-cyan-900 dark:border-cyan-700 dark:bg-cyan-950 dark:text-cyan-200",
    ponto: "bg-cyan-500",
  },
  {
    linha: "bg-stone-100 hover:bg-stone-200/70 dark:bg-stone-900/60 dark:hover:bg-stone-900",
    faixa: "border-l-4 border-l-stone-500",
    etiqueta: "border-stone-300 bg-stone-200 text-stone-900 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200",
    ponto: "bg-stone-500",
  },
];

/** Cor do segmento pela posição dele entre os segmentos da empresa (repete depois de 10). */
export function corDoSegmento(posicao: number): CorDeSegmento {
  return CORES[((posicao % CORES.length) + CORES.length) % CORES.length];
}
