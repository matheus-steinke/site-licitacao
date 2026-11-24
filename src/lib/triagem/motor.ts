// Triagem sem IA: compara cada item de uma licitação com o catálogo de uma organização.
// Biblioteca pura (sem banco): o coletor e o app usam o mesmo código, e os testes também.

import {
  contemTermo,
  prepararTermos,
  prepararTexto,
  primeiroTermo,
  radical,
  type Termo,
  type TextoPreparado,
} from "../texto/normalizar";
import { compararMedidas, extrairMedidas, normalizarParaMedidas, type MedidasExtraidas } from "./medidas";
import { FRACAS, marcasDoCatalogo, prepararProduto, type ProdutoBruto, type ProdutoPreparado } from "./produto";

/**
 * Mude este número sempre que a regra da triagem mudar: as organizações são triadas de
 * novo quando a versão gravada nelas é diferente desta.
 */
export const VERSAO_DA_TRIAGEM = 1;

export const LIMITES_PADRAO = { compativel: 60, verificar: 50 };

export type ConfiguracaoDaTriagem = {
  porte: "me_epp" | "demais";
  /** Score a partir do qual o item é "compatível". */
  limiteCompativel: number;
  /** Score a partir do qual o item aparece como "verificar". */
  limiteVerificar: number;
  /** Segmentos de interesse da organização. */
  segmentoIds: string[];
  /** Termos que a empresa não fornece. */
  exclusoes: string[];
  produtos: ProdutoBruto[];
};

export type ItemDaCompra = {
  id: string;
  numero: number;
  descricao: string;
  quantidade: number | null;
  valorUnitario: number | null;
  exclusivoMeEpp: boolean;
  /** Segmentos com que o item casou na coleta (compra_item_segmentos). */
  segmentoIds: string[];
};

export type CompraParaTriar = { objeto: string; itens: ItemDaCompra[] };

export type Nivel = "compativel" | "verificar";

export type AlertaDeItem = "exclusivo_me_epp" | "referencia_abaixo_minimo";

export type DetalheDoCasamento = {
  /** Palavra-chave do produto que apareceu no item (casamento mais forte). */
  palavraChave?: string;
  /** Parte das palavras do nome do produto encontrada no item, de 0 a 1. */
  cobertura: number;
  /** Semelhança de escrita (trigramas) entre as palavras do produto e as do item, de 0 a 1. */
  similaridade: number;
  medidasConfirmadas: string[];
  medidasDiferentes: string[];
  /** Palavras do item que apontam para outro produto do catálogo ("duplo", "j"). */
  palavrasDeOutroProduto: string[];
  /** Outros produtos do catálogo que também passaram do limite para este item. */
  outrosProdutos: number;
};

export type ItemTriado = {
  itemId: string;
  numero: number;
  produtoId: string;
  nivel: Nivel;
  score: number;
  detalhe: DetalheDoCasamento;
  alertas: AlertaDeItem[];
  lote: string | null;
};

export type Alerta =
  | { tipo: "me_epp_repassar"; itens: number[] }
  | { tipo: "exclusivo_me_epp"; itens: number[] }
  | { tipo: "referencia_abaixo_minimo"; itens: number[] }
  | { tipo: "lote_completo"; lote: string }
  | { tipo: "lote_incompleto"; lote: string; faltam: number[] }
  | { tipo: "amostra" | "comodato" | "visita_tecnica" | "exclusiva_me_epp" };

/** 3 = tem item compatível com o catálogo; 2 = só itens a verificar; 1 = só o segmento; 0 = nada. */
export type Prioridade = 0 | 1 | 2 | 3;

export type ResultadoDaTriagem = {
  prioridade: Prioridade;
  /** Melhor score entre os itens. */
  score: number;
  itens: ItemTriado[];
  itensCompativeis: number;
  itensAVerificar: number;
  /** Itens dos segmentos da organização (já sem os excluídos). */
  itensDoSegmento: number;
  segmentoIds: string[];
  /** Soma de quantidade x valor de referência dos itens compatíveis. */
  valorEstimado: number;
  alertas: Alerta[];
};

export type TriagemPreparada = {
  configuracao: Omit<ConfiguracaoDaTriagem, "produtos" | "exclusoes" | "segmentoIds">;
  segmentoIds: Set<string>;
  exclusoes: Termo[];
  produtos: ProdutoPreparado[];
  /** Palavra do nome -> produtos que a têm no nome. */
  porPalavra: Map<string, ProdutoPreparado[]>;
  /** Primeira palavra de cada palavra-chave -> produtos. */
  porChave: Map<string, ProdutoPreparado[]>;
};

export function prepararTriagem(configuracao: ConfiguracaoDaTriagem): TriagemPreparada {
  const marcas = marcasDoCatalogo(configuracao.produtos);
  const produtos = configuracao.produtos.map((produto) => prepararProduto(produto, marcas));
  const porPalavra = new Map<string, ProdutoPreparado[]>();
  const porChave = new Map<string, ProdutoPreparado[]>();
  const indexar = (indice: Map<string, ProdutoPreparado[]>, palavra: string, produto: ProdutoPreparado) => {
    const lista = indice.get(palavra);
    if (!lista) indice.set(palavra, [produto]);
    else if (!lista.includes(produto)) lista.push(produto);
  };
  for (const produto of produtos) {
    for (const { palavra } of produto.nucleo) indexar(porPalavra, palavra, produto);
    for (const termo of produto.palavrasChave) indexar(porChave, termo.palavras[0], produto);
  }
  return {
    configuracao: {
      porte: configuracao.porte,
      limiteCompativel: configuracao.limiteCompativel,
      limiteVerificar: configuracao.limiteVerificar,
    },
    segmentoIds: new Set(configuracao.segmentoIds),
    exclusoes: prepararTermos(configuracao.exclusoes),
    produtos,
    porPalavra,
    porChave,
  };
}

/**
 * Palavras que não dizem o que o item é: o que costuma vir antes do nome ("Código GHC: 123
 * Especificação: CATETER...", "ITEM EXCLUSIVO PARA ME/EPP - SONDA...", "LOTE 1 - KIT ...") e os
 * rótulos do catálogo federal ("Fio Guia aplicação: vascular, material: nitinol").
 */
const SEM_SIGNIFICADO = new Set(
  [
    "codigo", "cod", "ghc", "especificacao", "descricao", "item", "exclusivo", "mei", "me", "epp", "lote",
    "grupo", "cota", "reservada", "principal", "ampla", "disputa", "catmat", "br", "unidade", "un", "und",
    "idem", "aplicacao", "modelo", "identificacao", "tamanho", "numero", "materia", "prima", "caracteristica",
    "adicional", "componente", "formato", "apresentacao", "dimensao", "medida", "cor", "medico", "hospitalar",
    // unidades, materiais e quantificadores: descrevem o item, não dizem o que ele é
    "fr", "french", "ch", "cm", "mm", "ml", "calibre", "diametro", "comprimento", "capacidade", "volume",
    "poliuretano", "silicone", "pvc", "latex", "aco", "inox", "inoxidavel", "nylon", "polimero", "plastico",
    "diverso", "variado", "nao", "sem", "cerca", "aproximadamente", "esterilidade", "medio", "pequeno", "grande",
  ].map(radical),
);

/**
 * As primeiras palavras que dizem o que o item é. Em "CATETER INTRAVENOSO 18G COM AGULHA
 * SILICONIZADA", o item é um cateter intravenoso: a agulha é só um detalhe da descrição.
 */
export function comecoDoItem(palavras: string[], quantas = 3): string[] {
  const comeco: string[] = [];
  for (const palavra of palavras) {
    if (palavra.length < 2 || /\d/.test(palavra) || SEM_SIGNIFICADO.has(palavra) || FRACAS.has(palavra)) continue;
    if (!comeco.includes(palavra)) comeco.push(palavra);
    if (comeco.length === quantas) break;
  }
  return comeco;
}

// ---------------------------------------------------------------------------
// Semelhança de escrita por trigramas (o mesmo princípio do pg_trgm)
// ---------------------------------------------------------------------------

const trigramasDe = new Map<string, Set<string>>();

function trigramas(palavra: string): Set<string> {
  let conjunto = trigramasDe.get(palavra);
  if (!conjunto) {
    conjunto = new Set();
    const texto = `  ${palavra} `;
    for (let i = 0; i + 3 <= texto.length; i++) conjunto.add(texto.slice(i, i + 3));
    if (trigramasDe.size > 50_000) trigramasDe.clear();
    trigramasDe.set(palavra, conjunto);
  }
  return conjunto;
}

/** De 0 a 1: trigramas em comum sobre o total (como similarity() do pg_trgm). */
export function semelhanca(a: string, b: string): number {
  if (a === b) return 1;
  const ta = trigramas(a);
  const tb = trigramas(b);
  let comuns = 0;
  for (const t of ta) if (tb.has(t)) comuns++;
  return comuns / (ta.size + tb.size - comuns);
}

/** Abaixo disto, duas palavras parecidas não contam como a mesma. */
const SEMELHANCA_MINIMA = 0.5;

// ---------------------------------------------------------------------------
// Item x produto
// ---------------------------------------------------------------------------

type Candidato = {
  produto: ProdutoPreparado;
  score: number;
  nivel: Nivel | null;
  detalhe: Omit<DetalheDoCasamento, "outrosProdutos">;
};

/** A palavra do produto aparece no item? 1 = igual; entre 0,5 e 1 = escrita parecida; 0 = não. */
function presenca(
  nucleo: ProdutoPreparado["nucleo"],
  indice: number,
  texto: TextoPreparado,
  palavrasDoItem: string[],
): number {
  const { palavra } = nucleo[indice];
  const posicoes = texto.posicoes.get(palavra);
  // Palavra muito curta ("j" de "duplo j", "ii") só vale colada à palavra anterior do nome.
  if (palavra.length <= 2) {
    const anteriores = indice > 0 ? texto.posicoes.get(nucleo[indice - 1].palavra) : undefined;
    return posicoes && anteriores?.some((p) => posicoes.includes(p + 1)) ? 1 : 0;
  }
  if (posicoes) return 1;
  let melhor = 0;
  for (const outra of palavrasDoItem) {
    if (Math.abs(outra.length - palavra.length) > 3) continue;
    const s = semelhanca(palavra, outra);
    if (s > melhor) melhor = s;
  }
  return melhor >= SEMELHANCA_MINIMA ? melhor : 0;
}

function avaliar(
  produto: ProdutoPreparado,
  texto: TextoPreparado,
  palavrasDoItem: string[],
  medidasDoItem: () => MedidasExtraidas,
  limites: { limiteCompativel: number; limiteVerificar: number },
  /** As primeiras palavras do item: o que ele é. */
  comeco: string[],
  /** Palavras fortes dos produtos candidatos que aparecem no item. */
  vocabulario: Set<string>,
): Candidato | null {
  const palavraChave = primeiroTermo(texto, produto.palavrasChave, { proximas: false });
  const doNome = new Set(produto.nucleo.map((n) => n.palavra));

  let pesoTotal = 0;
  let pesoExato = 0;
  let pesoParecido = 0;
  let fortes = 0;
  let fortesAchadas = 0;
  let temOTipoDoProduto: boolean | null = null;
  const presencas = produto.nucleo.map((_, indice) => presenca(produto.nucleo, indice, texto, palavrasDoItem));
  // "duplo j" é uma coisa só: sem o "j" colado, o "duplo" de "duplo lúmen" não conta.
  produto.nucleo.forEach(({ palavra }, indice) => {
    if (palavra.length <= 2 && presencas[indice] === 0 && indice > 0) presencas[indice - 1] = 0;
  });
  produto.nucleo.forEach(({ peso }, indice) => {
    const achou = presencas[indice];
    pesoTotal += peso;
    if (achou === 1) pesoExato += peso;
    pesoParecido += peso * achou;
    if (peso === 1) {
      fortes++;
      if (achou > 0) fortesAchadas++;
      // A primeira palavra forte do nome diz o tipo do produto ("cateter", "processador").
      temOTipoDoProduto ??= achou > 0;
    }
  });
  const cobertura = pesoTotal > 0 ? pesoExato / pesoTotal : 0;
  const similaridade = pesoTotal > 0 ? pesoParecido / pesoTotal : 0;

  let textoCasa = 1;
  const deOutroProduto: string[] = [];
  if (!palavraChave) {
    // O item precisa SER do tipo do produto: a primeira palavra da descrição está no nome do
    // produto. "SONDA de aspiração flexível" não é "BAINHA para aspiração flexível".
    if (comeco.length === 0 || !doNome.has(comeco[0])) return null;
    // E ter ao menos duas palavras fortes do nome: "cateter" sozinho não liga cateter
    // ureteral a cateter venoso.
    if (fortesAchadas < Math.min(2, fortes)) return null;

    // Pesa contra: o item cita o que define OUTRO produto do catálogo ("duplo j" num cateter
    // ureteral simples) ou se apresenta com palavras que o produto não tem ("cateter VENOSO
    // CENTRAL"). A primeira pesa mais: é sinal claro de que o item é o outro produto.
    let desconto = 0;
    for (const palavra of vocabulario) {
      if (doNome.has(palavra)) continue;
      deOutroProduto.push(palavra);
      desconto += 0.2;
    }
    for (const palavra of comeco.slice(1)) {
      if (doNome.has(palavra) || deOutroProduto.includes(palavra)) continue;
      deOutroProduto.push(palavra);
      desconto += 0.1;
    }
    textoCasa = (0.7 * cobertura + 0.3 * similaridade) * (1 - Math.min(desconto, 0.5));
    // O item não cita o tipo do produto (um "endoscópio" para o produto "processador de
    // imagem para endoscópio"): só passa se o resto casar muito bem.
    if (temOTipoDoProduto === false) textoCasa *= 0.75;
  }

  const { confirmadas, diferentes } = compararMedidas(produto.medidas, medidasDoItem());
  // A medida ajusta o score do texto, não o substitui: confirmada mantém; sem medida para
  // comparar tira um pouco; diferente tira mais, e mais ainda se nenhuma outra medida bater.
  const fatorDaMedida =
    diferentes.length > 0 ? (confirmadas.length > 0 ? 0.75 : 0.6) : confirmadas.length > 0 ? 1 : 0.825;
  const score = Math.round(100 * textoCasa * fatorDaMedida);

  let nivel: Nivel | null = null;
  // Medida diferente nunca é "compatível": no máximo fica para verificar.
  if (score >= limites.limiteCompativel && diferentes.length === 0) nivel = "compativel";
  else if (score >= limites.limiteVerificar) nivel = "verificar";

  return {
    produto,
    score,
    nivel,
    detalhe: {
      ...(palavraChave ? { palavraChave: palavraChave.original } : {}),
      cobertura: Number(cobertura.toFixed(2)),
      similaridade: Number(similaridade.toFixed(2)),
      medidasConfirmadas: confirmadas,
      medidasDiferentes: diferentes,
      palavrasDeOutroProduto: deOutroProduto,
    },
  };
}

/** Do melhor para o pior: nível, score, medidas confirmadas, cobertura e, por fim, o código. */
function comparar(a: Candidato, b: Candidato): number {
  const peso = (c: Candidato) => (c.nivel === "compativel" ? 2 : c.nivel === "verificar" ? 1 : 0);
  return (
    peso(b) - peso(a) ||
    b.score - a.score ||
    b.detalhe.medidasConfirmadas.length - a.detalhe.medidasConfirmadas.length ||
    b.detalhe.cobertura - a.detalhe.cobertura ||
    a.produto.codigo.localeCompare(b.produto.codigo, "pt-BR", { numeric: true })
  );
}

// ---------------------------------------------------------------------------
// Lote, ME/EPP e alertas por palavra
// ---------------------------------------------------------------------------

/** "LOTE 1 - ...", "Lote 001: ...", "GRUPO 2 - ...", "(L3) ..." no começo da descrição. */
const LOTE =
  /^\s*(?:[[(]\s*(?:lote|grupo|l|g)\s*[-.:]?\s*0*(\d{1,4})\s*[\])]|(?:lote|grupo)\s*(?:n[°º.]?\s*)?[-.:]?\s*0*(\d{1,4})\s*[-–—:.)])/i;

export function extrairLote(descricao: string): string | null {
  const achado = LOTE.exec(descricao);
  return achado ? (achado[1] ?? achado[2]) : null;
}

const ME_EPP = String.raw`(?:mei\b|me\b|me\s*\/\s*epp|microempresas?|epp\b|empresas? de pequeno porte)`;
const EXCLUSIVO_ME_EPP = new RegExp(
  String.raw`\bexclusiv\w+\s+(?:(?:para|a|de|as|aos?)\s+)?(?:participacao\s+de\s+)?${ME_EPP}`,
);

const ALERTAS_DO_OBJETO: [Extract<Alerta, { tipo: "amostra" | "comodato" | "visita_tecnica" | "exclusiva_me_epp" }>["tipo"], RegExp][] = [
  ["amostra", /\bamostras?\b/],
  ["comodato", /\bcomodato\b/],
  ["visita_tecnica", /\bvisitas?\s+tecnicas?\b|\bvistoria\b/],
  ["exclusiva_me_epp", EXCLUSIVO_ME_EPP],
];

// ---------------------------------------------------------------------------
// A licitação inteira
// ---------------------------------------------------------------------------

export function triarCompra(triagem: TriagemPreparada, compra: CompraParaTriar): ResultadoDaTriagem {
  const { configuracao } = triagem;
  const itens: ItemTriado[] = [];
  const segmentos = new Set<string>();
  let itensDoSegmento = 0;
  let valorEstimado = 0;
  const lotes = new Map<string, { todos: number[]; compativeis: Set<number> }>();
  let citaComodato = false;

  for (const item of compra.itens) {
    const lote = extrairLote(item.descricao);
    if (lote) {
      const grupo = lotes.get(lote) ?? { todos: [], compativeis: new Set<number>() };
      grupo.todos.push(item.numero);
      lotes.set(lote, grupo);
    }

    const texto = prepararTexto(item.descricao);
    // O que a empresa não fornece não conta nem para o catálogo nem para o segmento.
    if (triagem.exclusoes.some((termo) => contemTermo(texto, termo, { proximas: false }))) continue;

    const doSegmento = item.segmentoIds.filter((id) => triagem.segmentoIds.has(id));
    if (doSegmento.length > 0) {
      itensDoSegmento++;
      for (const id of doSegmento) segmentos.add(id);
    }

    // Candidatos: produtos cujo nome tem a primeira palavra do item, e os que têm palavra-chave no item.
    const comeco = comecoDoItem(texto.palavras);
    const candidatos = new Set(comeco.length > 0 ? triagem.porPalavra.get(comeco[0]) : []);
    if (triagem.porChave.size > 0) {
      for (const palavra of texto.posicoes.keys()) {
        for (const produto of triagem.porChave.get(palavra) ?? []) candidatos.add(produto);
      }
    }
    if (candidatos.size === 0) continue;

    const palavrasDoItem = [...texto.posicoes.keys()];
    let medidas: MedidasExtraidas | null = null;
    const medidasDoItem = () => (medidas ??= extrairMedidas(item.descricao));
    // Palavras fortes dos candidatos presentes no item.
    const vocabulario = new Set<string>();
    for (const produto of candidatos) {
      for (const { palavra, peso } of produto.nucleo) {
        if (peso === 1 && palavra.length > 2 && texto.posicoes.has(palavra)) vocabulario.add(palavra);
      }
    }
    const avaliados: Candidato[] = [];
    for (const produto of candidatos) {
      const candidato = avaliar(produto, texto, palavrasDoItem, medidasDoItem, configuracao, comeco, vocabulario);
      if (candidato?.nivel) avaliados.push(candidato);
    }
    if (avaliados.length === 0) continue;
    avaliados.sort(comparar);
    const melhor = avaliados[0];

    const descricao = normalizarParaMedidas(item.descricao);
    if (melhor.detalhe.palavrasDeOutroProduto.length > 0) {
      // Para a tela: a palavra como está escrita no item, não o radical.
      const escritas = new Map<string, string>();
      for (const palavra of descricao.split(/[^a-z0-9]+/)) {
        if (palavra && !escritas.has(radical(palavra))) escritas.set(radical(palavra), palavra);
      }
      melhor.detalhe.palavrasDeOutroProduto = melhor.detalhe.palavrasDeOutroProduto.map((p) => escritas.get(p) ?? p);
    }
    const exclusivo = item.exclusivoMeEpp || EXCLUSIVO_ME_EPP.test(descricao);
    const alertas: AlertaDeItem[] = [];
    if (exclusivo) alertas.push("exclusivo_me_epp");
    if (item.valorUnitario && item.valorUnitario > 0 && item.valorUnitario < melhor.produto.lanceMinimo) {
      alertas.push("referencia_abaixo_minimo");
    }
    if (/\bcomodato\b/.test(descricao)) citaComodato = true;

    if (melhor.nivel === "compativel") {
      valorEstimado += (item.quantidade ?? 0) * (item.valorUnitario ?? 0);
      if (lote) lotes.get(lote)?.compativeis.add(item.numero);
    }
    itens.push({
      itemId: item.id,
      numero: item.numero,
      produtoId: melhor.produto.id,
      nivel: melhor.nivel as Nivel,
      score: melhor.score,
      detalhe: { ...melhor.detalhe, outrosProdutos: avaliados.length - 1 },
      alertas,
      lote,
    });
  }

  const compativeis = itens.filter((item) => item.nivel === "compativel");
  const alertas: Alerta[] = [];

  const exclusivos = itens.filter((item) => item.alertas.includes("exclusivo_me_epp")).map((item) => item.numero);
  if (exclusivos.length > 0) {
    // Quem não é ME/EPP não pode disputar o item, mas pode repassar a um parceiro.
    alertas.push({ tipo: configuracao.porte === "demais" ? "me_epp_repassar" : "exclusivo_me_epp", itens: exclusivos });
  }
  const abaixo = itens.filter((item) => item.alertas.includes("referencia_abaixo_minimo")).map((item) => item.numero);
  if (abaixo.length > 0) alertas.push({ tipo: "referencia_abaixo_minimo", itens: abaixo });

  for (const [lote, grupo] of [...lotes].sort((a, b) => Number(a[0]) - Number(b[0]))) {
    if (grupo.compativeis.size === 0 || grupo.todos.length < 2) continue;
    const faltam = grupo.todos.filter((numero) => !grupo.compativeis.has(numero)).sort((a, b) => a - b);
    alertas.push(faltam.length === 0 ? { tipo: "lote_completo", lote } : { tipo: "lote_incompleto", lote, faltam });
  }

  const objeto = normalizarParaMedidas(compra.objeto);
  for (const [tipo, padrao] of ALERTAS_DO_OBJETO) {
    if (padrao.test(objeto) || (tipo === "comodato" && citaComodato)) alertas.push({ tipo });
  }

  const prioridade: Prioridade = compativeis.length > 0 ? 3 : itens.length > 0 ? 2 : itensDoSegmento > 0 ? 1 : 0;
  return {
    prioridade,
    score: itens.reduce((maior, item) => Math.max(maior, item.score), 0),
    itens,
    itensCompativeis: compativeis.length,
    itensAVerificar: itens.length - compativeis.length,
    itensDoSegmento,
    segmentoIds: [...segmentos].sort(),
    valorEstimado: Number(valorEstimado.toFixed(2)),
    alertas: prioridade === 0 ? [] : alertas,
  };
}
