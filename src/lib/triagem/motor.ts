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
import { marcasDoCatalogo, prepararProduto, type ProdutoBruto, type ProdutoPreparado } from "./produto";

/**
 * Mude este número sempre que a regra da triagem mudar: as organizações são triadas de
 * novo quando a versão gravada nelas é diferente desta.
 */
export const VERSAO_DA_TRIAGEM = 1;

export const LIMITES_PADRAO = { compativel: 60, verificar: 40 };

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
  /** Palavra -> produtos que podem casar com um item que a contenha. */
  porPalavra: Map<string, ProdutoPreparado[]>;
};

export function prepararTriagem(configuracao: ConfiguracaoDaTriagem): TriagemPreparada {
  const marcas = marcasDoCatalogo(configuracao.produtos);
  const produtos = configuracao.produtos.map((produto) => prepararProduto(produto, marcas));
  const porPalavra = new Map<string, ProdutoPreparado[]>();
  const indexar = (palavra: string | null | undefined, produto: ProdutoPreparado) => {
    if (!palavra) return;
    const lista = porPalavra.get(palavra);
    if (!lista) porPalavra.set(palavra, [produto]);
    else if (!lista.includes(produto)) lista.push(produto);
  };
  for (const produto of produtos) {
    indexar(produto.cabeca, produto);
    for (const termo of produto.palavrasChave) indexar(termo.palavras[0], produto);
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
  };
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

function avaliar(
  produto: ProdutoPreparado,
  texto: TextoPreparado,
  palavrasDoItem: string[],
  medidasDoItem: () => MedidasExtraidas,
  limites: { limiteCompativel: number; limiteVerificar: number },
  /** Palavras fortes dos produtos candidatos que aparecem no item. */
  vocabulario: Map<string, string>,
): Candidato | null {
  const palavraChave = primeiroTermo(texto, produto.palavrasChave, { proximas: false });

  let pesoTotal = 0;
  let pesoExato = 0;
  let pesoParecido = 0;
  let fortes = 0;
  let fortesAchadas = 0;
  for (const { palavra, peso } of produto.nucleo) {
    pesoTotal += peso;
    if (peso === 1) fortes++;
    if (texto.posicoes.has(palavra)) {
      pesoExato += peso;
      pesoParecido += peso;
      if (peso === 1) fortesAchadas++;
      continue;
    }
    let melhor = 0;
    for (const outra of palavrasDoItem) {
      if (Math.abs(outra.length - palavra.length) > 3) continue;
      const s = semelhanca(palavra, outra);
      if (s > melhor) melhor = s;
    }
    if (melhor >= SEMELHANCA_MINIMA) {
      pesoParecido += peso * melhor;
      if (peso === 1) fortesAchadas++;
    }
  }
  const cobertura = pesoTotal > 0 ? pesoExato / pesoTotal : 0;
  const similaridade = pesoTotal > 0 ? pesoParecido / pesoTotal : 0;

  // Sem palavra-chave, o item precisa citar o tipo do produto ("cateter", "bainha") e mais
  // uma palavra forte do nome: "cateter" sozinho não liga cateter ureteral a cateter venoso.
  const citaOTipo = produto.cabeca !== null && texto.posicoes.has(produto.cabeca);
  if (!palavraChave && (!citaOTipo || fortesAchadas < Math.min(2, fortes))) return null;

  // O item cita palavras que definem OUTRO produto do catálogo e que este não tem
  // ("duplo j" num cateter ureteral simples): cada uma pesa contra.
  const deOutroProduto: string[] = [];
  if (!palavraChave) {
    for (const [palavra, original] of vocabulario) {
      if (!produto.nucleo.some((n) => n.palavra === palavra)) deOutroProduto.push(original);
    }
  }
  const precisao = 1 - 0.12 * Math.min(deOutroProduto.length, 3);

  const textoCasa = palavraChave ? 1 : (0.7 * cobertura + 0.3 * similaridade) * precisao;
  const { confirmadas, diferentes } = compararMedidas(produto.medidas, medidasDoItem());
  const medida = diferentes.length > 0 ? (confirmadas.length > 0 ? 0.25 : 0) : confirmadas.length > 0 ? 1 : 0.5;
  const score = Math.round(75 * textoCasa + 25 * medida);

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

    const candidatos = new Set<ProdutoPreparado>();
    for (const palavra of texto.posicoes.keys()) {
      for (const produto of triagem.porPalavra.get(palavra) ?? []) candidatos.add(produto);
    }
    if (candidatos.size === 0) continue;

    const palavrasDoItem = [...texto.posicoes.keys()];
    let medidas: MedidasExtraidas | null = null;
    const medidasDoItem = () => (medidas ??= extrairMedidas(item.descricao));
    // Palavras fortes dos candidatos presentes no item (radical -> como aparece no item).
    const vocabulario = new Map<string, string>();
    for (const produto of candidatos) {
      for (const { palavra, peso } of produto.nucleo) {
        if (peso === 1 && texto.posicoes.has(palavra)) vocabulario.set(palavra, palavra);
      }
    }
    const avaliados: Candidato[] = [];
    for (const produto of candidatos) {
      const candidato = avaliar(produto, texto, palavrasDoItem, medidasDoItem, configuracao, vocabulario);
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
