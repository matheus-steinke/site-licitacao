// Validação da tabela de preços, linha a linha. Código puro (sem banco, sem
// navegador): roda igual na pré-visualização, no servidor e nos testes.

import { COLUNAS, LIMITE_LINHAS, type ChaveColuna } from "./colunas";

/** Valor de uma célula depois de lida do Excel/CSV. */
export type Celula = string | number | null;

export type ProdutoImportado = {
  codigo: string;
  referencia: string;
  nome: string;
  preco_proposta: number;
  lance_minimo: number;
  segmento_id: string | null;
  palavras_chave: string[];
  medidas: string | null;
  marca: string | null;
  fabricante: string | null;
  registro_anvisa: string | null;
};

export type LinhaValidada = {
  /** Número da linha na planilha (a do cabeçalho é a 1). */
  linha: number;
  codigo: string;
  /** Presente só quando a linha não tem erros. */
  dados?: ProdutoImportado;
  /** Para mostrar na pré-visualização mesmo quando há erro. */
  resumo: { referencia: string; nome: string; preco_proposta: string; lance_minimo: string };
  erros: string[];
  avisos: string[];
};

export type Mapeamento = {
  /** Índice da coluna na planilha para cada campo reconhecido. */
  indices: Partial<Record<ChaveColuna, number>>;
  /** Títulos das colunas obrigatórias que não foram encontradas. */
  faltando: string[];
  /** Cabeçalhos da planilha que não correspondem a nenhum campo (serão ignorados). */
  ignoradas: string[];
  /** Títulos dos campos que apareceram em mais de uma coluna (vale a primeira). */
  repetidas: string[];
};

export type SegmentoRef = { id: string; nome: string };

export type ResultadoValidacao = {
  mapeamento: Mapeamento;
  linhas: LinhaValidada[];
  /** Erro que impede a importação inteira (ex.: falta coluna obrigatória). */
  erroGeral?: string;
};

/** Minúsculas, sem acento, só letras e números separados por um espaço. */
export function normalizarTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function textoDaCelula(valor: Celula | undefined): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "number") {
    // 1 -> "1" (e não "1.0"); evita notação científica em códigos longos.
    return Number.isInteger(valor) ? valor.toFixed(0) : String(valor);
  }
  return valor.replace(/\s+/g, " ").trim();
}

/** Descobre, pelo cabeçalho, em que coluna está cada campo. */
export function mapearColunas(cabecalho: Celula[]): Mapeamento {
  const indices: Partial<Record<ChaveColuna, number>> = {};
  const ignoradas: string[] = [];
  const repetidas: string[] = [];

  cabecalho.forEach((celula, indice) => {
    const original = textoDaCelula(celula);
    const normalizado = normalizarTexto(original);
    if (!normalizado) return;
    const coluna = COLUNAS.find(
      (c) => normalizarTexto(c.titulo) === normalizado || c.apelidos.includes(normalizado),
    );
    if (!coluna) {
      ignoradas.push(original);
    } else if (indices[coluna.chave] !== undefined) {
      repetidas.push(coluna.titulo);
    } else {
      indices[coluna.chave] = indice;
    }
  });

  const faltando = COLUNAS.filter((c) => c.obrigatoria && indices[c.chave] === undefined).map(
    (c) => c.titulo,
  );
  return { indices, faltando, ignoradas, repetidas };
}

export type PrecoInterpretado = { valor: number; aviso?: string } | { erro: string };

/**
 * Interpreta um preço escrito com vírgula ou com ponto.
 * "1.234,56" -> 1234.56 | "1234.56" -> 1234.56 | "R$ 98,5" -> 98.5 | "1,234.56" -> 1234.56
 */
export function interpretarPreco(valor: Celula | undefined): PrecoInterpretado {
  if (valor === null || valor === undefined || valor === "") return { erro: "em branco" };

  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) return { erro: "não é um número" };
    if (valor < 0) return { erro: "não pode ser negativo" };
    return { valor: arredondar(valor) };
  }

  let texto = valor.replace(/r\$/i, "").replace(/\s/g, "");
  if (texto === "") return { erro: "em branco" };
  if (/^-/.test(texto)) return { erro: "não pode ser negativo" };
  if (!/^[0-9.,]+$/.test(texto) || !/[0-9]/.test(texto)) {
    return { erro: `"${valor.trim()}" não é um número` };
  }

  let aviso: string | undefined;
  const virgulas = (texto.match(/,/g) ?? []).length;
  const pontos = (texto.match(/\./g) ?? []).length;

  if (virgulas > 0 && pontos > 0) {
    // O separador que aparece por último é o decimal.
    if (texto.lastIndexOf(",") > texto.lastIndexOf(".")) {
      texto = texto.replace(/\./g, "").replace(",", ".");
    } else {
      texto = texto.replace(/,/g, "");
    }
  } else if (virgulas === 1) {
    texto = texto.replace(",", ".");
  } else if (virgulas > 1) {
    texto = texto.replace(/,/g, "");
  } else if (pontos > 1) {
    texto = texto.replace(/\./g, "");
  } else if (pontos === 1 && /^\d{1,3}\.\d{3}$/.test(texto)) {
    // "1.234": pode ser mil duzentos e trinta e quatro ou um vírgula duzentos e trinta e quatro.
    const comoDecimal = Number(texto);
    aviso = `"${texto}" foi lido como ${comoDecimal.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}. Se for milhar, escreva sem o ponto`;
  }

  const numero = Number(texto);
  if (!Number.isFinite(numero)) return { erro: `"${valor.trim()}" não é um número` };
  if (numero >= 1e10) return { erro: "valor alto demais" };
  return aviso ? { valor: arredondar(numero), aviso } : { valor: arredondar(numero) };
}

function arredondar(valor: number): number {
  return Math.round(valor * 10000) / 10000;
}

/** Separa palavras-chave por ponto e vírgula, barra vertical ou quebra de linha. */
export function lerPalavrasChave(texto: string): string[] {
  const vistas = new Set<string>();
  for (const pedaco of texto.split(/[;|\n]/)) {
    const termo = pedaco.replace(/\s+/g, " ").trim().toLowerCase();
    if (termo) vistas.add(termo);
  }
  return [...vistas];
}

function localizarSegmento(texto: string, segmentos: SegmentoRef[]): SegmentoRef | undefined {
  const procurado = normalizarTexto(texto);
  if (!procurado) return undefined;
  return (
    segmentos.find((s) => normalizarTexto(s.nome) === procurado) ??
    // "Urologia" casa com "Urologia/Endourologia".
    segmentos.find((s) => s.nome.split("/").some((parte) => normalizarTexto(parte) === procurado))
  );
}

/** Valida a planilha inteira: a primeira linha é o cabeçalho. */
export function validarPlanilha(
  planilha: Celula[][],
  segmentos: SegmentoRef[],
): ResultadoValidacao {
  const indiceCabecalho = planilha.findIndex((linha) => linha.some((c) => textoDaCelula(c) !== ""));
  if (indiceCabecalho === -1) {
    return {
      mapeamento: { indices: {}, faltando: [], ignoradas: [], repetidas: [] },
      linhas: [],
      erroGeral: "A planilha está vazia.",
    };
  }

  const mapeamento = mapearColunas(planilha[indiceCabecalho]);
  if (mapeamento.faltando.length > 0) {
    return {
      mapeamento,
      linhas: [],
      erroGeral: `Não encontrei ${mapeamento.faltando.length === 1 ? "a coluna obrigatória" : "as colunas obrigatórias"}: ${mapeamento.faltando.join(", ")}. Confira a primeira linha da planilha ou use o modelo.`,
    };
  }

  const { indices } = mapeamento;
  const celula = (linha: Celula[], chave: ChaveColuna): Celula | undefined =>
    indices[chave] === undefined ? undefined : linha[indices[chave]];

  const linhas: LinhaValidada[] = [];
  for (let i = indiceCabecalho + 1; i < planilha.length; i++) {
    const bruta = planilha[i];
    if (!bruta.some((c) => textoDaCelula(c) !== "")) continue; // linha vazia

    const erros: string[] = [];
    const avisos: string[] = [];

    const codigo = textoDaCelula(celula(bruta, "codigo"));
    const referencia = textoDaCelula(celula(bruta, "referencia"));
    const nome = textoDaCelula(celula(bruta, "nome"));
    if (!codigo) erros.push("ID em branco");
    else if (codigo.length > 60) erros.push("ID com mais de 60 caracteres");
    if (!referencia) erros.push("REFERÊNCIA em branco");
    else if (referencia.length > 120) erros.push("REFERÊNCIA com mais de 120 caracteres");
    if (!nome) erros.push("PRODUTO em branco");
    else if (nome.length > 500) erros.push("PRODUTO com mais de 500 caracteres");

    const preco = interpretarPreco(celula(bruta, "preco_proposta"));
    const lance = interpretarPreco(celula(bruta, "lance_minimo"));
    if ("erro" in preco) erros.push(`PREÇO PROPOSTA ${preco.erro}`);
    else if (preco.aviso) avisos.push(`PREÇO PROPOSTA: ${preco.aviso}`);
    if ("erro" in lance) erros.push(`LANCE MÍNIMO ${lance.erro}`);
    else if (lance.aviso) avisos.push(`LANCE MÍNIMO: ${lance.aviso}`);

    if (!("erro" in preco) && !("erro" in lance)) {
      if (lance.valor > preco.valor) avisos.push("LANCE MÍNIMO maior que o PREÇO PROPOSTA");
      if (preco.valor === 0) avisos.push("PREÇO PROPOSTA igual a zero");
      if (lance.valor === 0) avisos.push("LANCE MÍNIMO igual a zero");
    }

    let segmentoId: string | null = null;
    const textoSegmento = textoDaCelula(celula(bruta, "segmento"));
    if (textoSegmento) {
      const segmento = localizarSegmento(textoSegmento, segmentos);
      if (segmento) segmentoId = segmento.id;
      else avisos.push(`Segmento "${textoSegmento}" não reconhecido; ficará em branco`);
    }

    const opcional = (chave: ChaveColuna) => textoDaCelula(celula(bruta, chave)) || null;
    const resumo = {
      referencia,
      nome,
      preco_proposta: textoDaCelula(celula(bruta, "preco_proposta")),
      lance_minimo: textoDaCelula(celula(bruta, "lance_minimo")),
    };

    const linha: LinhaValidada = { linha: i + 1, codigo, resumo, erros, avisos };
    if (erros.length === 0 && !("erro" in preco) && !("erro" in lance)) {
      linha.dados = {
        codigo,
        referencia,
        nome,
        preco_proposta: preco.valor,
        lance_minimo: lance.valor,
        segmento_id: segmentoId,
        palavras_chave: lerPalavrasChave(textoDaCelula(celula(bruta, "palavras_chave"))),
        medidas: opcional("medidas"),
        marca: opcional("marca"),
        fabricante: opcional("fabricante"),
        registro_anvisa: opcional("registro_anvisa"),
      };
    }
    linhas.push(linha);
  }

  // IDs repetidos: nenhuma das linhas repetidas entra, para não importar a errada.
  const porCodigo = new Map<string, LinhaValidada[]>();
  for (const linha of linhas) {
    if (!linha.codigo) continue;
    const grupo = porCodigo.get(linha.codigo) ?? [];
    grupo.push(linha);
    porCodigo.set(linha.codigo, grupo);
  }
  for (const grupo of porCodigo.values()) {
    if (grupo.length < 2) continue;
    const numeros = grupo.map((l) => l.linha);
    for (const linha of grupo) {
      const outras = numeros.filter((n) => n !== linha.linha).join(", ");
      linha.erros.push(`ID repetido (também na linha ${outras})`);
      delete linha.dados;
    }
  }

  if (linhas.length === 0) {
    return { mapeamento, linhas, erroGeral: "A planilha só tem o cabeçalho, sem produtos." };
  }
  if (linhas.length > LIMITE_LINHAS) {
    return {
      mapeamento,
      linhas: [],
      erroGeral: `A planilha tem ${linhas.length.toLocaleString("pt-BR")} produtos. O limite por importação é ${LIMITE_LINHAS.toLocaleString("pt-BR")}; divida em arquivos menores e use "Atualizar pelo ID".`,
    };
  }
  return { mapeamento, linhas };
}

export type Resumo = { total: number; validas: number; comErro: number; comAviso: number };

export function resumir(linhas: LinhaValidada[]): Resumo {
  return {
    total: linhas.length,
    validas: linhas.filter((l) => l.dados).length,
    comErro: linhas.filter((l) => l.erros.length > 0).length,
    comAviso: linhas.filter((l) => l.erros.length === 0 && l.avisos.length > 0).length,
  };
}
