// Leitura do texto do edital e do termo de referência, sem IA: procura frases sobre amostra,
// comodato e visita técnica e guarda só os trechos. Sem banco e sem rede: serve ao coletor, às
// telas (tipos e textos) e aos testes.
//
// Regra de ouro, pedida pelo dono do projeto: o sistema nunca afirma que o edital NÃO exige
// alguma coisa. Há dois níveis: "exige" (frase clara) e "cita" (a pessoa confere o trecho).
// Uma frase como "não há exigência de amostra" entra como "cita", com o trecho à vista.

/** Aumente quando as regras mudarem: o coletor relê os editais já lidos. */
export const VERSAO_DAS_REGRAS = 1;

export const TIPOS_DE_ALERTA_DO_EDITAL = ["amostra", "comodato", "visita_tecnica"] as const;
export type TipoDeAlertaDoEdital = (typeof TIPOS_DE_ALERTA_DO_EDITAL)[number];
export type NivelDoAlertaDoEdital = "exige" | "cita";

export type AlertaDoEdital = { tipo: TipoDeAlertaDoEdital; nivel: NivelDoAlertaDoEdital };
export type TrechoDoEdital = { tipo: TipoDeAlertaDoEdital; texto: string; arquivo: string | null };
export type LeituraDoEdital = { alertas: AlertaDoEdital[]; trechos: TrechoDoEdital[] };

export const MAXIMO_DE_TRECHOS_POR_ALERTA = 3;
const ANTES = 170;
const DEPOIS = 230;

/**
 * O texto em duas versões do mesmo tamanho: a original (espaços simples) e a "plana" (sem
 * acento, minúscula). As regras casam na plana e o trecho sai da original, na mesma posição.
 */
export function alinhar(texto: string): { original: string; plano: string } {
  const original = texto
    .normalize("NFKC")
    .replace(/[​-‍﻿­]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const partes: string[] = [];
  for (let i = 0; i < original.length; i++) {
    const codigo = original.charCodeAt(i);
    if (codigo < 128) {
      partes.push(codigo >= 65 && codigo <= 90 ? String.fromCharCode(codigo + 32) : original[i]);
      continue;
    }
    const base = original[i].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    partes.push(base.length === 1 ? base : base.length === 0 ? " " : base[0]);
  }
  return { original, plano: partes.join("") };
}

/** Uma palavra (com a pontuação colada) e o espaço depois dela. */
const P = String.raw`(?:[\w/().,-]+\s+)`;
const re = (fonte: string) => new RegExp(fonte, "g");

type Classe = "exige" | "nega" | "condicional" | "cita";
type Regras = Record<Classe, RegExp[]>;

const REGRAS: Record<TipoDeAlertaDoEdital, Regras> = {
  amostra: {
    exige: [
      re(String.raw`(?<!nao\s)\bhavera\s+${P}{0,3}amostras?`),
      re(String.raw`(?<!nao\s)\bsera[o]?\s+(?:exigid[ao]s?|solicitad[ao]s?|obrigatori[ao]s?)\s+${P}{0,5}amostras?`),
      re(
        String.raw`\b(?:devera[o]?|deve[m]?|obriga-se\s+a)\s+${P}{0,6}(?:apresentar|entregar|enviar|encaminhar)\s+${P}{0,5}amostras?[^.;]{0,160}\b(?:prazo|dias|horas)\b`,
      ),
      re(String.raw`\bprazo\s+${P}{0,8}(?:apresentacao|entrega|envio)\s+d[aeo]s?\s+amostras?`),
      /\bamostras?\s*(?:,\s*prototipo[^:?]{0,40})?[:?]\s*sim\b/g,
      re(String.raw`\b(?:e|sera)\s+obrigatori[ao]\s+${P}{0,4}amostras?`),
      re(String.raw`\bapresentar\s*,?\s*obrigatoriamente\s*,?\s+${P}{0,3}amostras?`),
      /\bamostras?\s+(?:devera[o]?|devem)\s+ser\s+(?:entregues?|enviadas?|encaminhadas?|apresentadas?)\s+(?:n[oa]s?|em|a[os]?|para|ate|dentro)\b/g,
    ],
    nega: [
      re(
        String.raw`\bnao\s+(?:sera[o]?|havera|ha|e|sao)\s+${P}{0,3}(?:exigid[ao]s?|solicitad[ao]s?|necessari[ao]s?|exigencia|necessidade)\s+${P}{0,4}amostras?`,
      ),
      re(String.raw`\bnao\s+havera\s+${P}{0,4}amostras?`),
      /\bamostras?\s*(?:,\s*prototipo[^:?]{0,40})?[:?]\s*nao\b/g,
      /\b(?:sem|dispensad[ao]s?)\s+(?:a\s+)?(?:exigencia|necessidade|apresentacao)\s+de\s+amostras?/g,
      /\bnao\s+se\s+aplica\s+(?:a\s+)?(?:exigencia|apresentacao)\s+de\s+amostras?/g,
    ],
    condicional: [
      re(
        String.raw`\b(?:caso|quando|se|desde\s+que)\s+${P}{0,10}(?:exij\w*|exig\w*|solicit\w*|requer\w*|indique|previst\w*|houver|haja|necessari\w*)\s+${P}{0,6}amostras?`,
      ),
      re(String.raw`\bpodera[o]?\s+${P}{0,10}amostras?`),
      re(String.raw`\ba\s+criterio\s+d\w+\s+${P}{0,8}amostras?`),
    ],
    cita: [/\bamostras?\b/g],
  },
  comodato: {
    exige: [
      /\b(?:em|sob|regime\s+de|por|contrato\s+de|termo\s+de|cessao\s+em|fornecimento\s+em|disponibiliza\w+\s+em|equipamentos?\s+em)\s+comodato\b/g,
    ],
    nega: [/\bnao\s+(?:havera|sera|se\s+aplica)\s+(?:\w+\s+){0,4}comodato/g],
    condicional: [],
    cita: [/\bcomodato\b/g],
  },
  // Visita técnica nunca sobe para "exige": na medição, as frases que pareciam exigir eram
  // cláusulas condicionais. As classes aqui só escolhem o trecho mais útil.
  visita_tecnica: {
    exige: [
      /\b(?:visitas?\s+tecnicas?|vistorias?)\s+(?:\w+\s+){0,4}(?:e\s+obrigatoria|sera\s+obrigatoria|obrigatoria)\b/g,
      /\b(?:atestado|declaracao|termo)\s+de\s+(?:visita\s+tecnica|vistoria)\b/g,
    ],
    nega: [
      /\bnao\s+(?:sera[o]?|havera|ha|e)\s+(?:\w+\s+){0,4}(?:visitas?\s+tecnicas?|vistorias?)/g,
      /\b(?:visitas?\s+tecnicas?|vistorias?)\s+(?:\w+\s+){0,4}(?:nao\s+e\s+obrigatoria|e\s+facultativa|sera\s+facultativa|facultad[ao])/g,
    ],
    condicional: [],
    cita: [/\bvisitas?\s+tecnicas?\b|\bvistorias?\b/g],
  },
};

/** Quais tipos podem chegar a "exige". */
const PODE_EXIGIR: Record<TipoDeAlertaDoEdital, boolean> = { amostra: true, comodato: true, visita_tecnica: false };
/** Ordem dos trechos: primeiro o que mais ajuda a decidir. */
const ORDEM: Classe[] = ["exige", "nega", "condicional", "cita"];

type Achado = { inicio: number; fim: number; classe: Classe };

function achar(plano: string, regras: Regras): Record<Classe, Achado[]> {
  const todos = {} as Record<Classe, Achado[]>;
  for (const classe of ORDEM) {
    todos[classe] = regras[classe].flatMap((regra) =>
      [...plano.matchAll(regra)].map((m) => ({ inicio: m.index, fim: m.index + m[0].length, classe })),
    );
  }
  const cruza = (a: Achado, lista: Achado[]) => lista.some((b) => b.inicio <= a.fim && a.inicio <= b.fim);
  // "Caso o termo de referência exija amostra, o licitante deverá apresentá-la no prazo…" não
  // é exigência: é cláusula padrão. O mesmo para o que está dentro de uma negação.
  todos.exige = todos.exige.filter(
    (a) =>
      !cruza(a, todos.condicional) &&
      !cruza(a, todos.nega) &&
      !/\b(?:caso|quando|se)\b[^.;]{0,90}$/.test(plano.slice(Math.max(0, a.inicio - 100), a.inicio)),
  );
  return todos;
}

function recortar(original: string, achado: Achado): { texto: string; inicio: number; fim: number } {
  let inicio = Math.max(0, achado.inicio - ANTES);
  let fim = Math.min(original.length, achado.fim + DEPOIS);
  // Não corta palavra no meio.
  if (inicio > 0) {
    const espaco = original.indexOf(" ", inicio);
    if (espaco >= 0 && espaco < achado.inicio) inicio = espaco + 1;
  }
  if (fim < original.length) {
    const espaco = original.lastIndexOf(" ", fim);
    if (espaco > achado.fim) fim = espaco;
  }
  const texto = `${inicio > 0 ? "…" : ""}${original.slice(inicio, fim).trim()}${fim < original.length ? "…" : ""}`;
  return { texto, inicio, fim };
}

export type DocumentoDoEdital = { titulo: string | null; texto: string };

/**
 * Lê os documentos de uma licitação. Só há alerta do tipo que o texto cita; o nível é "exige"
 * quando alguma frase clara aparece em qualquer documento.
 */
export function lerEdital(documentos: DocumentoDoEdital[]): LeituraDoEdital {
  const alertas: AlertaDoEdital[] = [];
  const trechos: TrechoDoEdital[] = [];
  const preparados = documentos.map((d) => ({ titulo: d.titulo, ...alinhar(d.texto) }));

  for (const tipo of TIPOS_DE_ALERTA_DO_EDITAL) {
    let exige = false;
    const candidatos: { classe: Classe; documento: number; achado: Achado }[] = [];
    for (const [documento, { plano }] of preparados.entries()) {
      const achados = achar(plano, REGRAS[tipo]);
      if (achados.exige.length > 0 && PODE_EXIGIR[tipo]) exige = true;
      for (const classe of ORDEM) for (const achado of achados[classe]) candidatos.push({ classe, documento, achado });
    }
    if (candidatos.length === 0) continue;
    alertas.push({ tipo, nivel: exige ? "exige" : "cita" });

    candidatos.sort(
      (a, b) => ORDEM.indexOf(a.classe) - ORDEM.indexOf(b.classe) || a.documento - b.documento || a.achado.inicio - b.achado.inicio,
    );
    const escolhidos: { documento: number; inicio: number; fim: number; chave: string }[] = [];
    for (const { documento, achado } of candidatos) {
      if (escolhidos.length >= MAXIMO_DE_TRECHOS_POR_ALERTA) break;
      const { original, plano, titulo } = preparados[documento];
      const recorte = recortar(original, achado);
      // A mesma cláusula repetida no edital e no termo de referência conta uma vez só.
      const chave = plano.slice(Math.max(0, achado.inicio - 60), achado.fim + 60);
      const repetido = escolhidos.some(
        (e) => e.chave === chave || (e.documento === documento && e.inicio < recorte.fim && recorte.inicio < e.fim),
      );
      if (repetido) continue;
      escolhidos.push({ documento, inicio: recorte.inicio, fim: recorte.fim, chave });
      trechos.push({ tipo, texto: recorte.texto, arquivo: titulo });
    }
  }
  return { alertas, trechos };
}

// ---------------------------------------------------------------------------
// Do banco para as telas
// ---------------------------------------------------------------------------

const TIPOS = new Set<string>(TIPOS_DE_ALERTA_DO_EDITAL);

/** Os alertas chegam do banco como JSON: aproveita só os de formato conhecido. */
export function lerAlertasDoEdital(valor: unknown): AlertaDoEdital[] {
  if (!Array.isArray(valor)) return [];
  return valor.flatMap((a) => {
    if (typeof a !== "object" || a === null) return [];
    const { tipo, nivel } = a as { tipo?: unknown; nivel?: unknown };
    if (typeof tipo !== "string" || !TIPOS.has(tipo)) return [];
    return [{ tipo: tipo as TipoDeAlertaDoEdital, nivel: nivel === "exige" ? "exige" : "cita" } satisfies AlertaDoEdital];
  });
}

export function lerTrechosDoEdital(valor: unknown): TrechoDoEdital[] {
  if (!Array.isArray(valor)) return [];
  return valor.flatMap((t) => {
    if (typeof t !== "object" || t === null) return [];
    const { tipo, texto, arquivo } = t as { tipo?: unknown; texto?: unknown; arquivo?: unknown };
    if (typeof tipo !== "string" || !TIPOS.has(tipo) || typeof texto !== "string" || !texto) return [];
    return [{ tipo: tipo as TipoDeAlertaDoEdital, texto, arquivo: typeof arquivo === "string" && arquivo ? arquivo : null }];
  });
}
