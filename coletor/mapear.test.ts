import { describe, expect, it } from "vitest";

import arquivos from "./fixtures/arquivos.json";
import busca from "./fixtures/busca.json";
import detalhe from "./fixtures/detalhe.json";
import itens from "./fixtures/itens.json";
import proposta from "./fixtures/proposta.json";
import {
  controlePncp,
  dataDoPncp,
  mapearArquivo,
  mapearBusca,
  mapearContratacao,
  mapearItem,
} from "./mapear";
import type { ArquivoPncp, ContratacaoPncp, ItemBusca, ItemPncp } from "./pncp";

describe("datas do PNCP", () => {
  it("interpreta datas sem fuso como horário de Brasília", () => {
    expect(dataDoPncp("2026-12-03T10:00")).toBe("2026-12-03T13:00:00.000Z");
    expect(dataDoPncp("2026-12-03T10:00:00")).toBe("2026-12-03T13:00:00.000Z");
    expect(dataDoPncp("2026-11-18T14:21:56.400752")).toBe("2026-11-18T17:21:56.000Z");
    expect(dataDoPncp("2026-12-03")).toBe("2026-12-03T03:00:00.000Z");
  });

  it("respeita o fuso quando ele vem informado e recusa lixo", () => {
    expect(dataDoPncp("2026-12-03T10:00:00Z")).toBe("2026-12-03T10:00:00.000Z");
    expect(dataDoPncp("")).toBeNull();
    expect(dataDoPncp(null)).toBeNull();
    expect(dataDoPncp("amanhã")).toBeNull();
  });
});

describe("controle PNCP", () => {
  it("usa o sequencial com 6 dígitos", () => {
    expect(controlePncp("04092680000171", 156, 2026)).toBe("04092680000171-1-000156/2026");
  });
});

describe("respostas reais do PNCP", () => {
  it("converte um resultado da busca", () => {
    const compra = mapearBusca(busca.items[0] as unknown as ItemBusca);
    expect(compra).toMatchObject({
      controle_pncp: "04092680000171-1-000156/2026",
      orgao_cnpj: "04092680000171",
      orgao_razao_social: "MUNICIPIO DE PIMENTA BUENO",
      orgao_esfera: "Municipal",
      ano: 2026,
      sequencial: 156,
      numero_compra: "98",
      uf: "RO",
      municipio: "Pimenta Bueno",
      modalidade_id: 6,
      modalidade_nome: "Pregão - Eletrônico",
      situacao_id: 1,
      data_disputa: "2026-12-03T13:00:00.000Z",
      valor_total_estimado: 78619.91,
      srp: true,
      link_sistema_origem: "https://licitanet.com.br/sessao/208313",
    });
    expect(compra?.objeto).toContain("Cânulas e Cateteres");
    // O número de controle montado bate com o que a busca informa.
    expect(compra?.controle_pncp).toBe(busca.items[0].numero_controle_pncp);
  });

  it("converte o detalhe e a listagem do plano B do mesmo jeito", () => {
    const doDetalhe = mapearContratacao(detalhe as unknown as ContratacaoPncp);
    expect(doDetalhe).toMatchObject({
      controle_pncp: "04092680000171-1-000156/2026",
      processo: "7871/2026",
      uf: "RO",
      orgao_esfera: "Municipal",
      situacao_id: 1,
      data_disputa: "2026-12-03T13:00:00.000Z",
      data_abertura_proposta: "2026-11-18T17:21:49.000Z",
    });
    expect(doDetalhe?.controle_pncp).toBe(detalhe.numeroControlePNCP);

    for (const contratacao of proposta.data) {
      const compra = mapearContratacao(contratacao as unknown as ContratacaoPncp);
      expect(compra?.controle_pncp).toBe(contratacao.numeroControlePNCP);
      expect(compra?.uf).toMatch(/^[A-Z]{2}$/);
    }
    expect(mapearContratacao(proposta.data[0] as unknown as ContratacaoPncp)?.situacao_id).toBe(4);
  });

  it("recusa registros sem identificação", () => {
    expect(mapearBusca({ ...busca.items[0], numero_sequencial: "" } as unknown as ItemBusca)).toBeNull();
    expect(mapearContratacao({ ...detalhe, orgaoEntidade: {} } as unknown as ContratacaoPncp)).toBeNull();
  });
});

describe("itens e arquivos reais do PNCP", () => {
  it("converte um item real (o número do item pode ser um identificador grande)", () => {
    expect(mapearItem(itens[0] as unknown as ItemPncp)).toEqual({
      numero_item: 8230631,
      descricao: "DRENO DE TORAX Nº 10 ESTERIL DESCARTAVEL C/ FRASCO 2000 ML",
      quantidade: 10,
      unidade: "UND",
      valor_unitario_estimado: 49.27,
      valor_total: 492.7,
      // A API de itens não informa lote/grupo.
      grupo: null,
      tipo_beneficio_id: 1,
      exclusivo_me_epp: true,
      situacao_item: "Em andamento",
    });
    for (const item of itens) expect(mapearItem(item as unknown as ItemPncp)).not.toBeNull();
  });

  it("converte um arquivo real", () => {
    expect(mapearArquivo(arquivos[0] as unknown as ArquivoPncp)).toEqual({
      sequencial_documento: 1,
      titulo: "208313_editais_1795022463.zip",
      tipo_documento: "Edital",
      url: "https://pncp.gov.br/pncp-api/v1/orgaos/04092680000171/compras/2026/156/arquivos/1",
      publicado_em: "2026-11-18T17:21:56.000Z",
    });
  });
});

describe("itens e arquivos", () => {
  it("converte um item e marca o exclusivo ME/EPP", () => {
    expect(
      mapearItem({
        numeroItem: 3,
        descricao: "  CATETER DUPLO J   6FR ",
        quantidade: 200,
        unidadeMedida: "UN",
        valorUnitarioEstimado: 185,
        valorTotal: 37000,
        tipoBeneficio: 1,
        tipoBeneficioNome: "Participação exclusiva para ME/EPP",
        situacaoCompraItemNome: "Em andamento",
      }),
    ).toEqual({
      numero_item: 3,
      descricao: "CATETER DUPLO J 6FR",
      quantidade: 200,
      unidade: "UN",
      valor_unitario_estimado: 185,
      valor_total: 37000,
      grupo: null,
      tipo_beneficio_id: 1,
      exclusivo_me_epp: true,
      situacao_item: "Em andamento",
    });
    expect(mapearItem({ numeroItem: 1, descricao: "X", tipoBeneficio: 4 })?.exclusivo_me_epp).toBe(false);
  });

  it("junta a informação complementar e lê o lote com qualquer um dos nomes", () => {
    expect(mapearItem({ numeroItem: 1, descricao: "SERINGA", informacaoComplementar: "10 ML LUER LOCK" })?.descricao).toBe(
      "SERINGA 10 ML LUER LOCK",
    );
    expect(mapearItem({ numeroItem: 1, descricao: "X", numeroGrupo: 2 })?.grupo).toBe("2");
    expect(mapearItem({ numeroItem: 1, descricao: "X", lote: " A " })?.grupo).toBe("A");
    expect(mapearItem({ numeroItem: 1 })?.descricao).toBe("Item sem descrição");
    expect(mapearItem({ numeroItem: 1.5, descricao: "X" })).toBeNull();
  });

  it("converte arquivos ativos e ignora os inativos", () => {
    expect(
      mapearArquivo({
        sequencialDocumento: 1,
        titulo: "Edital",
        tipoDocumentoNome: "Edital",
        url: "https://pncp.gov.br/pncp-api/v1/orgaos/04092680000171/compras/2026/156/arquivos/1",
        dataPublicacaoPncp: "2026-11-18T14:21:56",
        statusAtivo: true,
      }),
    ).toEqual({
      sequencial_documento: 1,
      titulo: "Edital",
      tipo_documento: "Edital",
      url: "https://pncp.gov.br/pncp-api/v1/orgaos/04092680000171/compras/2026/156/arquivos/1",
      publicado_em: "2026-11-18T17:21:56.000Z",
    });
    expect(mapearArquivo({ sequencialDocumento: 2, url: "https://x", statusAtivo: false })).toBeNull();
    expect(mapearArquivo({ sequencialDocumento: 3 })).toBeNull();
  });
});
