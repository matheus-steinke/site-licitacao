// Converte as respostas do PNCP nos registros que gravamos. Código puro.

import type { ArquivoPncp, ContratacaoPncp, ItemBusca, ItemPncp } from "./pncp";

export type CompraColetada = {
  controle_pncp: string;
  orgao_cnpj: string;
  orgao_razao_social: string;
  orgao_esfera: string | null;
  orgao_poder: string | null;
  ano: number;
  sequencial: number;
  numero_compra: string | null;
  processo: string | null;
  unidade_codigo: string | null;
  unidade_nome: string | null;
  uf: string | null;
  municipio: string | null;
  codigo_ibge: string | null;
  modalidade_id: number;
  modalidade_nome: string;
  modo_disputa: string | null;
  objeto: string;
  situacao_id: number | null;
  data_publicacao: string | null;
  data_abertura_proposta: string | null;
  /** dataEncerramentoProposta: fim do recebimento de propostas, abertura da sessão. */
  data_disputa: string | null;
  valor_total_estimado: number | null;
  srp: boolean | null;
  link_sistema_origem: string | null;
  pncp_atualizado_em: string | null;
};

export type ItemColetado = {
  numero_item: number;
  descricao: string;
  quantidade: number | null;
  unidade: string | null;
  valor_unitario_estimado: number | null;
  valor_total: number | null;
  grupo: string | null;
  tipo_beneficio_id: number | null;
  exclusivo_me_epp: boolean;
  situacao_item: string | null;
};

export type ArquivoColetado = {
  sequencial_documento: number;
  titulo: string | null;
  tipo_documento: string | null;
  url: string;
  publicado_em: string | null;
};

const ESFERAS: Record<string, string> = { F: "Federal", E: "Estadual", M: "Municipal", D: "Distrital", N: "Não se aplica" };
const PODERES: Record<string, string> = { E: "Executivo", L: "Legislativo", J: "Judiciário", N: "Não se aplica" };
export const MODALIDADES: Record<number, string> = {
  6: "Pregão - Eletrônico",
  8: "Dispensa",
};

/**
 * As datas do PNCP vêm sem fuso ("2026-12-03T10:00" ou com segundos) e estão no
 * horário de Brasília (UTC-3, sem horário de verão desde 2019).
 */
export function dataDoPncp(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const texto = valor.trim();
  const partes = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(texto);
  if (!partes) return null;
  const [, dia, hora = "00", minuto = "00", segundo = "00"] = partes;
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(texto)) {
    const data = new Date(texto);
    return Number.isNaN(data.getTime()) ? null : data.toISOString();
  }
  const data = new Date(`${dia}T${hora}:${minuto}:${segundo}-03:00`);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

function limpo(valor: string | null | undefined): string | null {
  const texto = (valor ?? "").replace(/\s+/g, " ").trim();
  return texto || null;
}

function inteiro(valor: string | number | null | undefined): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const numero = Number(valor);
  return Number.isInteger(numero) ? numero : null;
}

/** "Controle PNCP": {cnpj}-1-{sequencial com 6 dígitos}/{ano}. */
export function controlePncp(cnpj: string, sequencial: number, ano: number): string {
  return `${cnpj}-1-${String(sequencial).padStart(6, "0")}/${ano}`;
}

export function mapearBusca(item: ItemBusca): CompraColetada | null {
  const ano = inteiro(item.ano);
  const sequencial = inteiro(item.numero_sequencial);
  const modalidade = inteiro(item.modalidade_licitacao_id);
  if (!item.orgao_cnpj || ano === null || sequencial === null || modalidade === null) return null;

  return {
    controle_pncp: controlePncp(item.orgao_cnpj, sequencial, ano),
    orgao_cnpj: item.orgao_cnpj,
    orgao_razao_social: limpo(item.orgao_nome) ?? "Órgão não informado",
    orgao_esfera: limpo(item.esfera_nome),
    orgao_poder: limpo(item.poder_nome),
    ano,
    sequencial,
    numero_compra: limpo(item.numero),
    processo: null,
    unidade_codigo: limpo(item.unidade_codigo),
    unidade_nome: limpo(item.unidade_nome),
    uf: limpo(item.uf)?.toUpperCase() ?? null,
    municipio: limpo(item.municipio_nome),
    codigo_ibge: limpo(item.codigo_ibge),
    modalidade_id: modalidade,
    modalidade_nome: limpo(item.modalidade_licitacao_nome) ?? MODALIDADES[modalidade] ?? `Modalidade ${modalidade}`,
    modo_disputa: limpo(item.modo_disputa_nome),
    objeto: limpo(item.description) ?? limpo(item.title) ?? "Objeto não informado",
    situacao_id: inteiro(item.situacao_id),
    data_publicacao: dataDoPncp(item.data_publicacao_pncp),
    data_abertura_proposta: dataDoPncp(item.data_inicio_vigencia),
    data_disputa: dataDoPncp(item.data_fim_vigencia),
    valor_total_estimado: typeof item.valor_total_estimado === "number" ? item.valor_total_estimado : null,
    srp: typeof item.srp === "boolean" ? item.srp : null,
    link_sistema_origem: limpo(item.link_sistema_origem),
    pncp_atualizado_em: dataDoPncp(item.data_atualizacao_pncp),
  };
}

export function mapearContratacao(c: ContratacaoPncp): CompraColetada | null {
  const cnpj = c.orgaoEntidade?.cnpj;
  if (!cnpj || !Number.isInteger(c.anoCompra) || !Number.isInteger(c.sequencialCompra)) return null;

  return {
    controle_pncp: controlePncp(cnpj, c.sequencialCompra, c.anoCompra),
    orgao_cnpj: cnpj,
    orgao_razao_social: limpo(c.orgaoEntidade.razaoSocial) ?? "Órgão não informado",
    orgao_esfera: ESFERAS[c.orgaoEntidade.esferaId ?? ""] ?? null,
    orgao_poder: PODERES[c.orgaoEntidade.poderId ?? ""] ?? null,
    ano: c.anoCompra,
    sequencial: c.sequencialCompra,
    numero_compra: limpo(c.numeroCompra),
    processo: limpo(c.processo),
    unidade_codigo: limpo(c.unidadeOrgao?.codigoUnidade),
    unidade_nome: limpo(c.unidadeOrgao?.nomeUnidade),
    uf: limpo(c.unidadeOrgao?.ufSigla)?.toUpperCase() ?? null,
    municipio: limpo(c.unidadeOrgao?.municipioNome),
    codigo_ibge: limpo(c.unidadeOrgao?.codigoIbge),
    modalidade_id: c.modalidadeId,
    modalidade_nome: limpo(c.modalidadeNome) ?? MODALIDADES[c.modalidadeId] ?? `Modalidade ${c.modalidadeId}`,
    modo_disputa: limpo(c.modoDisputaNome),
    objeto: limpo(c.objetoCompra) ?? "Objeto não informado",
    situacao_id: c.situacaoCompraId ?? null,
    data_publicacao: dataDoPncp(c.dataPublicacaoPncp),
    data_abertura_proposta: dataDoPncp(c.dataAberturaProposta),
    data_disputa: dataDoPncp(c.dataEncerramentoProposta),
    valor_total_estimado: typeof c.valorTotalEstimado === "number" ? c.valorTotalEstimado : null,
    srp: typeof c.srp === "boolean" ? c.srp : null,
    link_sistema_origem: limpo(c.linkSistemaOrigem),
    pncp_atualizado_em: dataDoPncp(c.dataAtualizacaoGlobal ?? c.dataAtualizacao),
  };
}

/** tipoBeneficio do PNCP: 1 = participação exclusiva para ME/EPP. */
const BENEFICIO_EXCLUSIVO_ME_EPP = 1;

/**
 * A API de itens do PNCP não informa lote/grupo (conferido em 59 mil itens reais, em
 * 23/11/2026). Estes nomes ficam só para o caso de o campo passar a existir.
 */
const CAMPOS_DE_GRUPO = ["numeroGrupo", "grupo", "numeroLote", "lote", "grupoItem", "loteItem"];

function grupoDoItem(item: ItemPncp): string | null {
  for (const campo of CAMPOS_DE_GRUPO) {
    const valor = item[campo];
    if (typeof valor === "number") return String(valor);
    if (typeof valor === "string" && valor.trim()) return valor.trim();
  }
  return null;
}

export function mapearItem(item: ItemPncp): ItemColetado | null {
  if (!Number.isInteger(item.numeroItem)) return null;
  const descricao = limpo(item.descricao);
  const complemento = limpo(item.informacaoComplementar);
  const numero = (valor: unknown) => (typeof valor === "number" && Number.isFinite(valor) ? valor : null);
  const beneficio = inteiro(item.tipoBeneficio ?? null);

  return {
    numero_item: item.numeroItem,
    // Alguns sistemas põem a especificação em "informacaoComplementar".
    descricao:
      descricao && complemento && !descricao.includes(complemento)
        ? `${descricao} ${complemento}`.slice(0, 4000)
        : (descricao ?? complemento ?? "Item sem descrição").slice(0, 4000),
    quantidade: numero(item.quantidade),
    unidade: limpo(item.unidadeMedida),
    valor_unitario_estimado: numero(item.valorUnitarioEstimado),
    valor_total: numero(item.valorTotal),
    grupo: grupoDoItem(item),
    tipo_beneficio_id: beneficio,
    exclusivo_me_epp: beneficio === BENEFICIO_EXCLUSIVO_ME_EPP,
    situacao_item: limpo(item.situacaoCompraItemNome),
  };
}

export function mapearArquivo(arquivo: ArquivoPncp): ArquivoColetado | null {
  const url = limpo(arquivo.url) ?? limpo(arquivo.uri);
  if (!Number.isInteger(arquivo.sequencialDocumento) || !url) return null;
  if (arquivo.statusAtivo === false) return null;
  return {
    sequencial_documento: arquivo.sequencialDocumento,
    titulo: limpo(arquivo.titulo),
    tipo_documento: limpo(arquivo.tipoDocumentoNome) ?? limpo(arquivo.tipoDocumentoDescricao),
    url,
    publicado_em: dataDoPncp(arquivo.dataPublicacaoPncp),
  };
}
