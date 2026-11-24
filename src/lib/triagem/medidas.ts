// Extração e comparação de medidas (French, cm, mm, µm, ml, polegadas, gauge), sem IA.
// "6Fr", "CH 6", "calibre: 18", "22-30CM", "26 a 28cm", "270 µm", "0,035\"", "18G".

export type TipoDeMedida = "fr" | "cm" | "mm" | "um" | "ml" | "pol" | "g";

/** Uma medida é sempre uma faixa; valor único tem min = max. */
export type Medida = { tipo: TipoDeMedida; min: number; max: number };

export type MedidasExtraidas = {
  medidas: Medida[];
  /** Números de um "6 x 26" ou "nº 8" sem unidade: podem ser French, cm ou mm. */
  soltos: number[];
};

const UNIDADES: [TipoDeMedida | "m", string][] = [
  ["fr", "french|frenchs|fr|charriere|ch|f"],
  ["cm", "centimetros?|cms?"],
  ["mm", "milimetros?|mm"],
  ["um", "micrometros?|microns?|micras?|mcm|um"],
  ["ml", "mililitros?|ml"],
  ["pol", "polegadas?|pol|\"|''"],
  ["g", "gauge|ga|g"],
  ["m", "metros?|mts?"],
];

const NUMERO = String.raw`(\d+(?:\.\d+)?)`;
const TODAS = UNIDADES.map(([, formas]) => formas).join("|");
/** 22-30cm, 26 a 28 cm, 11/13fr, 6fr, 0.035" */
const COM_UNIDADE = new RegExp(
  String.raw`(?<![\d.a-wyz])${NUMERO}(?:\s*(?:-|/|a|ate)\s*${NUMERO})?\s?(${TODAS})(?![a-wyz0-9])`,
  "g",
);
/** CH 6, FR 12, calibre: 18, calibre nº 10 */
const UNIDADE_ANTES = new RegExp(
  String.raw`(?<![a-z0-9])(?:ch|fr|french|calibre)\s*[:.]?\s*(?:n[o°º]?\.?\s*)?${NUMERO}(?![\d.]|\s?(?:${TODAS})(?![a-z0-9]))`,
  "g",
);
/** 0.035 ou .032 sem unidade: por convenção, diâmetro de fio guia em polegadas. */
const POLEGADA_SEM_UNIDADE = /(?<![\d.])(0?\.0\d{2,3})(?![\d"']|\s?(?:pol|mm|cm|ml))/g;
/** x 3m (comprimento em metros depois de um "x") */
const METROS_DEPOIS_DE_X = new RegExp(String.raw`x\s*${NUMERO}\s?m(?![a-z0-9])`, "g");
const DIMENSOES = new RegExp(String.raw`(?<![\d.])${NUMERO}\s*([a-z"']*)\s*x\s*${NUMERO}\s*([a-z"']*)`, "g");
const NUMERO_DE_TAMANHO = new RegExp(String.raw`(?<![a-z])n(?:[°º]\.?|\.)\s*${NUMERO}(?![\d.])`, "g");

const EH_UNIDADE = new RegExp(`^(?:${TODAS}|m)$`);

function tipoDaUnidade(unidade: string): TipoDeMedida | "m" {
  for (const [tipo, formas] of UNIDADES) {
    if (new RegExp(`^(?:${formas})$`).test(unidade)) return tipo;
  }
  throw new Error(`unidade desconhecida: ${unidade}`);
}

/** Minúsculas, sem acento, vírgula decimal vira ponto, µm vira "micra". */
export function normalizarParaMedidas(texto: string): string {
  return texto
    .replace(/[µμ]\s?m\b/g, "micra")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[“”″]/g, '"')
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/(?<![\d.])\.(\d)/g, "0.$1");
}

export function extrairMedidas(textoOriginal: string): MedidasExtraidas {
  const texto = normalizarParaMedidas(textoOriginal);
  const medidas: Medida[] = [];
  const incluir = (tipo: TipoDeMedida, a: number, b = a) => {
    if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return;
    const [min, max] = a <= b ? [a, b] : [b, a];
    if (!medidas.some((m) => m.tipo === tipo && m.min === min && m.max === max)) medidas.push({ tipo, min, max });
  };

  for (const achado of texto.matchAll(COM_UNIDADE)) {
    const [inteiro, primeiro, segundo, unidade] = achado;
    const tipo = tipoDaUnidade(unidade);
    const a = Number(primeiro);
    const b = segundo === undefined ? a : Number(segundo);
    if (tipo === "g") {
      // Só calibres de agulha: "500 g" é peso e "27050G" é código de catálogo.
      if (segundo === undefined && Number.isInteger(a) && a >= 10 && a <= 34) incluir("g", a);
    } else if (tipo === "fr") {
      // "6F" só vale colado ao número e em valores plausíveis de French.
      const soF = unidade === "f";
      if (Math.max(a, b) <= 60 && (!soF || /\df$/.test(inteiro))) incluir("fr", a, b);
    } else if (tipo === "m") {
      if (segundo === undefined && a <= 20 && unidade !== "m") incluir("cm", a * 100);
    } else if (tipo === "um" && unidade === "um" && a < 50) {
      // "com 1 um" é o artigo, não micrômetro.
    } else {
      incluir(tipo, a, b);
    }
  }
  for (const achado of texto.matchAll(UNIDADE_ANTES)) {
    const valor = Number(achado[1]);
    if (valor <= 60) incluir("fr", valor);
  }
  for (const achado of texto.matchAll(POLEGADA_SEM_UNIDADE)) incluir("pol", Number(achado[1]));
  for (const achado of texto.matchAll(METROS_DEPOIS_DE_X)) {
    const valor = Number(achado[1]);
    if (valor <= 20) incluir("cm", valor * 100);
  }

  const soltos: number[] = [];
  const solto = (valor: number) => {
    const ehPolegada = valor < 0.1;
    if (valor > 0 && !ehPolegada && !soltos.includes(valor)) soltos.push(valor);
  };
  DIMENSOES.lastIndex = 0;
  for (let achado = DIMENSOES.exec(texto); achado; achado = DIMENSOES.exec(texto)) {
    const [, a, unidadeA, b, unidadeB] = achado;
    if (!EH_UNIDADE.test(unidadeA)) solto(Number(a));
    if (!EH_UNIDADE.test(unidadeB)) solto(Number(b));
    // "6 x 26 x 150": o segundo número também pode abrir o próximo par.
    DIMENSOES.lastIndex = achado.index + achado[0].lastIndexOf(b);
  }
  for (const achado of texto.matchAll(NUMERO_DE_TAMANHO)) solto(Number(achado[1]));

  // "4.7fr x 22-30cm": o 22 é o começo de uma faixa com unidade, não um número solto.
  const comUnidade = new Set(medidas.flatMap((m) => [m.min, m.max]));
  return { medidas, soltos: soltos.filter((valor) => !comUnidade.has(valor)) };
}

/** Quanto dois valores podem diferir e ainda contar como a mesma medida. */
function tolerancia(tipo: TipoDeMedida, valor: number): number {
  switch (tipo) {
    case "fr":
      return 0.35; // 4,7 Fr, 4,8 Fr e 5 Fr são tratados como equivalentes
    case "pol":
      return 0.0011; // 0,035" não é 0,032"
    case "g":
      return 0;
    case "cm":
      return Math.max(0.5, valor * 0.1);
    case "mm":
      return Math.max(0.2, valor * 0.1);
    default:
      return valor * 0.1;
  }
}

function sobrepoe(a: Medida, b: Medida): boolean {
  const folga = tolerancia(a.tipo, Math.max(a.max, b.max));
  return a.min - folga <= b.max && b.min - folga <= a.max;
}

const SIMBOLO: Record<TipoDeMedida, string> = { fr: " Fr", cm: " cm", mm: " mm", um: " µm", ml: " ml", pol: '"', g: "G" };

function numero(valor: number): string {
  return String(Number(valor.toFixed(4))).replace(".", ",");
}

/** "6 Fr", "22-30 cm", "0,035\"" */
export function descreverMedida(medida: Medida): string {
  const faixa = medida.min === medida.max ? numero(medida.min) : `${numero(medida.min)}-${numero(medida.max)}`;
  return `${faixa}${SIMBOLO[medida.tipo]}`;
}

export type ComparacaoDeMedidas = {
  /** Medidas do produto que o item confirma. */
  confirmadas: string[];
  /** Divergências, já em texto: "pede 6 Fr; produto 4,7 Fr". */
  diferentes: string[];
};

/**
 * Compara as medidas do produto com as do item. Uma medida só conta como diferente quando
 * os dois lados informam o mesmo tipo e nenhum valor bate. O que só um lado informa não
 * confirma nem contradiz.
 */
export function compararMedidas(produto: MedidasExtraidas, item: MedidasExtraidas): ComparacaoDeMedidas {
  const confirmadas: string[] = [];
  const diferentes: string[] = [];
  const tipos = [...new Set(produto.medidas.map((m) => m.tipo))];
  const semPar: Medida[] = [];

  for (const tipo of tipos) {
    const doProduto = produto.medidas.filter((m) => m.tipo === tipo);
    const doItem = item.medidas.filter((m) => m.tipo === tipo);
    if (doItem.length === 0) {
      semPar.push(...doProduto);
      continue;
    }
    const iguais = doProduto.filter((p) => doItem.some((i) => sobrepoe(p, i)));
    if (iguais.length > 0) confirmadas.push(...iguais.map(descreverMedida));
    else {
      diferentes.push(
        `pede ${doItem.map(descreverMedida).join(" ou ")}; produto ${doProduto.map(descreverMedida).join(" ou ")}`,
      );
    }
  }

  // "6 x 26" sem unidade: confirma o que bater; se nada bater, é outra medida.
  const dimensionais = semPar.filter((m) => m.tipo === "fr" || m.tipo === "cm" || m.tipo === "mm");
  if (item.soltos.length > 0 && dimensionais.length > 0) {
    const bate = (p: Medida, valor: number) => sobrepoe(p, { tipo: p.tipo, min: valor, max: valor });
    const batem = dimensionais.filter((p) => item.soltos.some((valor) => bate(p, valor)));
    confirmadas.push(...batem.map(descreverMedida));
    // Sobrou número do item sem par e tipo de medida do produto sem confirmação: é outra medida.
    const tiposConfirmados = new Set(batem.map((p) => p.tipo));
    const semConfirmar = dimensionais.filter((p) => !tiposConfirmados.has(p.tipo));
    const sobraram = item.soltos.filter((valor) => !dimensionais.some((p) => bate(p, valor)));
    if (item.soltos.length >= 2 && sobraram.length > 0 && semConfirmar.length > 0) {
      diferentes.push(
        `pede ${sobraram.map(numero).join(" x ")}; produto ${semConfirmar.map(descreverMedida).join(" x ")}`,
      );
    }
  }
  return { confirmadas, diferentes };
}
