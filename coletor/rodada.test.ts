import { describe, expect, it } from "vitest";

import type { ArquivoPncp, ClientePncp, ContratacaoPncp, ItemBusca, ItemPncp } from "./pncp";
import { ErroPncp } from "./pncp";
import { criarRepositorioMemoria } from "./repositorio";
import { executarRodada, type ConfiguracaoDaRodada } from "./rodada";

const AGORA = new Date("2026-11-22T15:00:00Z"); // 12:00 em Brasília
const SEGMENTOS = [
  { id: "uro", nome: "Urologia", palavras_chave: ["cateter duplo j", "sonda de foley"], sinonimos: ["pigtail"], exclusoes: ["veterinário"] },
  { id: "lap", nome: "Laparoscopia", palavras_chave: ["trocarte"], sinonimos: [], exclusoes: [] },
];

function daBusca(sequencial: number, extras: Partial<ItemBusca> = {}): ItemBusca {
  return {
    numero_controle_pncp: `11111111000111-1-${String(sequencial).padStart(6, "0")}/2026`,
    orgao_cnpj: "11111111000111",
    orgao_nome: "HOSPITAL DE TESTE",
    ano: "2026",
    numero_sequencial: String(sequencial),
    numero: String(sequencial),
    title: `Edital nº ${sequencial}/2026`,
    description: "Aquisição de materiais",
    unidade_codigo: "1",
    unidade_nome: "Unidade",
    esfera_nome: "Municipal",
    poder_nome: "Executivo",
    municipio_nome: "Curitiba",
    codigo_ibge: "4106902",
    uf: "PR",
    modalidade_licitacao_id: "6",
    modalidade_licitacao_nome: "Pregão - Eletrônico",
    situacao_id: "1",
    data_publicacao_pncp: "2026-11-18T10:00:00",
    data_atualizacao_pncp: "2026-11-18T10:00:00",
    data_inicio_vigencia: "2026-11-18T10:00:00",
    data_fim_vigencia: "2026-12-03T10:00",
    cancelado: false,
    srp: false,
    modo_disputa_nome: "Aberto",
    valor_total_estimado: 1000,
    link_sistema_origem: null,
    ...extras,
  };
}

function doDetalhe(sequencial: number, extras: Partial<ContratacaoPncp> = {}): ContratacaoPncp {
  return {
    numeroControlePNCP: `11111111000111-1-${String(sequencial).padStart(6, "0")}/2026`,
    orgaoEntidade: { cnpj: "11111111000111", razaoSocial: "HOSPITAL DE TESTE", esferaId: "M", poderId: "E" },
    unidadeOrgao: { ufSigla: "PR", municipioNome: "Curitiba" },
    anoCompra: 2026,
    sequencialCompra: sequencial,
    numeroCompra: String(sequencial),
    objetoCompra: "Aquisição de materiais",
    modalidadeId: 6,
    modalidadeNome: "Pregão - Eletrônico",
    situacaoCompraId: 1,
    dataEncerramentoProposta: "2026-12-03T10:00:00",
    ...extras,
  };
}

type Mundo = {
  busca?: Record<string, ItemBusca[]> | "fora";
  /** Termos cuja primeira busca falha (queda de conexão passageira). */
  buscaFalhaNaPrimeira?: string[];
  /** Termos cuja busca falha sempre. */
  buscaFalhaSempre?: string[];
  itens?: Record<number, ItemPncp[] | "fora">;
  arquivos?: Record<number, ArquivoPncp[] | "fora">;
  detalhes?: Record<number, ContratacaoPncp>;
  propostas?: Record<number, ContratacaoPncp[]>;
};

function pncpFalso(mundo: Mundo) {
  const chamadas: string[] = [];
  const falhas: { url: string; status?: number; mensagem: string }[] = [];
  const falhar = (url: string): never => {
    falhas.push({ url, status: 503, mensagem: "HTTP 503" });
    throw new ErroPncp("HTTP 503", url, 503);
  };
  const pncp = {
    chamadas: 0,
    async obterJson() {
      throw new Error("não usado");
    },
    async buscar(termo: string, pagina: number) {
      chamadas.push(`busca:${termo}:${pagina}`);
      if (mundo.busca === "fora" || !mundo.busca) return falhar(`https://pncp.gov.br/api/search/?q=${termo}`);
      const jaTentou = chamadas.filter((c) => c === `busca:${termo}:${pagina}`).length > 1;
      if (mundo.buscaFalhaSempre?.includes(termo) || (mundo.buscaFalhaNaPrimeira?.includes(termo) && !jaTentou)) {
        return falhar(`https://pncp.gov.br/api/search/?q=${termo}`);
      }
      const itens = mundo.busca[termo] ?? [];
      return { items: pagina === 1 ? itens : [], total: itens.length };
    },
    async listarPropostasAbertas(modalidade: number, _dataFinal: string, pagina: number) {
      chamadas.push(`proposta:${modalidade}:${pagina}`);
      const data = pagina === 1 ? (mundo.propostas?.[modalidade] ?? []) : [];
      return { data, totalRegistros: data.length, totalPaginas: 1, numeroPagina: pagina, paginasRestantes: 0, empty: data.length === 0 };
    },
    async detalhe(_cnpj: string, _ano: number, sequencial: number) {
      chamadas.push(`detalhe:${sequencial}`);
      return mundo.detalhes?.[sequencial];
    },
    async itens(_cnpj: string, _ano: number, sequencial: number) {
      chamadas.push(`itens:${sequencial}`);
      const itens = mundo.itens?.[sequencial] ?? [];
      if (itens === "fora") return falhar(`https://pncp.gov.br/api/pncp/v1/orgaos/x/compras/2026/${sequencial}/itens`);
      return itens;
    },
    async arquivos(_cnpj: string, _ano: number, sequencial: number) {
      chamadas.push(`arquivos:${sequencial}`);
      const arquivos = mundo.arquivos?.[sequencial] ?? [];
      if (arquivos === "fora") return falhar(`https://pncp.gov.br/api/pncp/v1/orgaos/x/compras/2026/${sequencial}/arquivos`);
      return arquivos;
    },
  } as unknown as ClientePncp;
  return { pncp, chamadas, falhas };
}

const CFG: Partial<ConfiguracaoDaRodada> = { agora: () => AGORA, registrar: () => {}, paralelas: 2 };
const chave = (sequencial: number) => `11111111000111-1-${String(sequencial).padStart(6, "0")}/2026`;

async function rodar(mundo: Mundo, memoria = criarRepositorioMemoria(SEGMENTOS, () => AGORA), cfg = CFG) {
  const { pncp, chamadas, falhas } = pncpFalso(mundo);
  const totais = await executarRodada(pncp, memoria.repositorio, cfg, falhas);
  return { totais, memoria, chamadas };
}

describe("rodada do coletor", () => {
  it("busca pelos termos de todos os segmentos, baixa os itens e mantém só a área da saúde", async () => {
    const { totais, memoria, chamadas } = await rodar({
      busca: {
        "cateter duplo j": [daBusca(1), daBusca(2)],
        trocarte: [daBusca(1), daBusca(3)],
      },
      itens: {
        1: [
          { numeroItem: 1, descricao: "CATETER URETERAL DUPLO J 6FR", quantidade: 10, tipoBeneficio: 1 },
          { numeroItem: 2, descricao: "TROCARTES 5 MM" },
          { numeroItem: 3, descricao: "PAPEL A4" },
        ],
        2: [{ numeroItem: 1, descricao: "CANETA ESFEROGRÁFICA" }],
        3: [{ numeroItem: 1, descricao: "SONDA DE FOLEY USO VETERINÁRIO" }],
      },
      arquivos: { 1: [{ sequencialDocumento: 1, titulo: "Edital", url: "https://pncp.gov.br/a/1" }] },
    });

    expect(totais).toMatchObject({
      status: "sucesso",
      fonte: "busca",
      termos_buscados: 3,
      compras_encontradas: 3,
      compras_novas: 1,
      compras_descartadas: 2,
      compras_pendentes: 0,
      erros: 0,
    });
    const compra = memoria.compras.get(chave(1))!;
    expect(compra.area_saude).toBe(true);
    expect(compra.segmento_ids.sort()).toEqual(["lap", "uro"]);
    expect(compra.itens.map((i) => i.segmento_ids)).toEqual([["uro"], ["lap"], []]);
    expect(compra.itens[0].exclusivo_me_epp).toBe(true);
    expect(compra.arquivos).toHaveLength(1);
    // Fora da saúde: fica o registro (para não baixar de novo), sem itens; exclusão do segmento vale.
    expect(memoria.compras.get(chave(2))).toMatchObject({ area_saude: false, itens: [] });
    expect(memoria.compras.get(chave(3))).toMatchObject({ area_saude: false });
    expect(memoria.fases).toEqual([
      "buscando 3 termos no PNCP",
      "baixando itens de 3 editais",
      "conferindo editais já conhecidos",
    ]);
    // Só busca arquivos do que é da saúde, e cada compra é baixada uma vez.
    expect(chamadas.filter((c) => c.startsWith("arquivos"))).toEqual(["arquivos:1"]);
    expect(chamadas.filter((c) => c === "itens:1")).toHaveLength(1);
  });

  it("ignora o que está fora da janela de 30 dias, outras modalidades e cancelados", async () => {
    const { totais } = await rodar({
      busca: {
        trocarte: [
          daBusca(1, { data_fim_vigencia: "2026-11-22T08:00" }), // já passou hoje
          daBusca(2, { data_fim_vigencia: "2026-12-23T10:00" }), // mais de 30 dias
          daBusca(3, { modalidade_licitacao_id: "12" }), // credenciamento
          daBusca(4, { cancelado: true }),
          daBusca(5, { data_fim_vigencia: "2026-12-22T11:00" }), // dentro (30 dias menos 1 hora)
        ],
      },
      itens: { 5: [{ numeroItem: 1, descricao: "TROCARTE 10MM" }] },
    });
    expect(totais.compras_encontradas).toBe(1);
    expect(totais.compras_novas).toBe(1);
  });

  it("não repete o trabalho na rodada seguinte e registra adiamento e suspensão", async () => {
    const memoria = criarRepositorioMemoria(SEGMENTOS, () => AGORA);
    const itens = { 1: [{ numeroItem: 1, descricao: "TROCARTE 5 MM" }], 2: [{ numeroItem: 1, descricao: "CANETA" }] };
    await rodar({ busca: { trocarte: [daBusca(1), daBusca(2)] }, itens }, memoria);

    const segunda = await rodar(
      {
        busca: {
          trocarte: [
            daBusca(1, { data_fim_vigencia: "2026-12-10T09:00", situacao_id: "4" }),
            daBusca(2),
          ],
        },
        itens,
      },
      memoria,
    );
    expect(segunda.chamadas.filter((c) => c.startsWith("itens"))).toEqual([]);
    expect(segunda.totais).toMatchObject({ compras_novas: 0, compras_atualizadas: 1, alteracoes: 2, compras_descartadas: 0 });
    expect(memoria.alteracoes).toEqual([
      { controle_pncp: chave(1), campo: "situacao_id", de: 1, para: 4 },
      { controle_pncp: chave(1), campo: "data_disputa", de: "2026-12-03T13:00:00.000Z", para: "2026-12-10T12:00:00.000Z" },
    ]);
  });

  it("baixa os itens de novo quando o PNCP informa atualização depois da nossa coleta (retificação)", async () => {
    const memoria = criarRepositorioMemoria(SEGMENTOS, () => AGORA);
    await rodar({ busca: { trocarte: [daBusca(1)] }, itens: { 1: [{ numeroItem: 1, descricao: "CANETA" }] } }, memoria);
    expect(memoria.compras.get(chave(1))?.area_saude).toBe(false);

    const { chamadas } = await rodar(
      {
        busca: { trocarte: [daBusca(1, { data_atualizacao_pncp: "2026-11-22T13:00:00" })] }, // 16:00Z, depois da coleta
        itens: { 1: [{ numeroItem: 1, descricao: "TROCARTE 5 MM" }] },
      },
      memoria,
    );
    expect(chamadas).toContain("itens:1");
    expect(memoria.compras.get(chave(1))?.area_saude).toBe(true);
  });

  it("reclassifica o que já foi coletado quando um segmento é editado", async () => {
    const segmentos = structuredClone(SEGMENTOS);
    const memoria = criarRepositorioMemoria(segmentos, () => AGORA);
    const mundo = {
      busca: { trocarte: [daBusca(1), daBusca(2)] },
      itens: {
        1: [{ numeroItem: 1, descricao: "TROCARTE 5 MM" }],
        2: [{ numeroItem: 1, descricao: "BOLSA DE COLOSTOMIA" }],
      },
    };
    await rodar(mundo, memoria);
    expect(memoria.compras.get(chave(2))?.area_saude).toBe(false);

    // Sem mudança de regra, nada é baixado de novo.
    const semMudanca = await rodar(mundo, memoria);
    expect(semMudanca.chamadas.filter((c) => c.startsWith("itens"))).toEqual([]);

    // O admin acrescenta um termo: as duas compras são reavaliadas, e a descartada entra.
    segmentos[0].palavras_chave.push("bolsa de colostomia");
    const depois = await rodar({ ...mundo, busca: { ...mundo.busca, "bolsa de colostomia": [daBusca(2)] } }, memoria);
    expect(depois.chamadas.filter((c) => c.startsWith("itens")).sort()).toEqual(["itens:1", "itens:2"]);
    expect(memoria.compras.get(chave(2))).toMatchObject({ area_saude: true, segmento_ids: ["uro"] });
    expect(depois.totais).toMatchObject({ compras_novas: 0, compras_atualizadas: 2, status: "sucesso" });

    // E a partir daí volta a não repetir.
    const estavel = await rodar({ ...mundo, busca: { ...mundo.busca, "bolsa de colostomia": [daBusca(2)] } }, memoria);
    expect(estavel.chamadas.filter((c) => c.startsWith("itens"))).toEqual([]);
  });

  it("casa itens descritos no formato do catálogo federal (palavras distantes)", async () => {
    const segmentos = [
      { id: "c", nome: "Consumo", palavras_chave: ["seringa descartável"], sinonimos: [], exclusoes: [] },
    ];
    const { memoria } = await rodar(
      {
        busca: { "seringa descartável": [daBusca(1)] },
        itens: {
          1: [
            {
              numeroItem: 1,
              descricao:
                "SERINGA - ADICIONAL: GRADUADA (ESCALA ML), NUMERADA; APRESENTAÇÃO: EMBALAGEM INDIVIDUAL; CAPACIDADE: 1 ML; ESTERILIDADE: ESTÉRIL, DESCARTÁVEL",
            },
          ],
        },
      },
      criarRepositorioMemoria(segmentos, () => AGORA),
    );
    expect(memoria.compras.get(chave(1))).toMatchObject({ area_saude: true, segmento_ids: ["c"] });
  });

  it("com a API de itens fora do ar, guarda a compra como pendente e tenta de novo depois", async () => {
    const memoria = criarRepositorioMemoria(SEGMENTOS, () => AGORA);
    const primeira = await rodar({ busca: { trocarte: [daBusca(1)] }, itens: { 1: "fora" } }, memoria);
    expect(primeira.totais).toMatchObject({ status: "parcial", compras_pendentes: 1, compras_novas: 1, erros: 1 });
    expect(memoria.compras.get(chave(1))).toMatchObject({ area_saude: null, tentativas_itens: 1 });
    expect(memoria.erros[0]).toMatchObject({ etapa: "itens", status_http: 503 });
    expect(primeira.totais.mensagem).toContain("itens pendentes");

    // Na rodada seguinte a compra nem aparece na busca, mas é revisitada pelo detalhe.
    const segunda = await rodar(
      { busca: { trocarte: [] }, detalhes: { 1: doDetalhe(1) }, itens: { 1: [{ numeroItem: 1, descricao: "TROCARTE" }] } },
      memoria,
      { ...CFG, agora: () => new Date("2026-11-22T17:00:00Z") },
    );
    expect(segunda.chamadas).toEqual(expect.arrayContaining(["detalhe:1", "itens:1"]));
    expect(memoria.compras.get(chave(1))?.area_saude).toBe(true);
    expect(segunda.totais.status).toBe("sucesso");
  });

  it("para de insistir nos itens depois de várias falhas seguidas", async () => {
    const sequenciais = Array.from({ length: 12 }, (_, i) => i + 1);
    const { totais, chamadas, memoria } = await rodar(
      {
        busca: { trocarte: sequenciais.map((n) => daBusca(n)) },
        itens: Object.fromEntries(sequenciais.map((n) => [n, "fora" as const])),
      },
      criarRepositorioMemoria(SEGMENTOS, () => AGORA),
      { ...CFG, paralelas: 1 },
    );
    expect(chamadas.filter((c) => c.startsWith("itens"))).toHaveLength(5);
    expect(totais).toMatchObject({ status: "parcial", compras_pendentes: 12, compras_novas: 12, erros: 5 });
    expect(totais.mensagem).toContain("API de itens do PNCP está fora do ar");
    expect([...memoria.compras.values()].every((c) => c.area_saude === null)).toBe(true);
  });

  it("falha na lista de arquivos não impede a compra de entrar", async () => {
    const { totais, memoria } = await rodar({
      busca: { trocarte: [daBusca(1)] },
      itens: { 1: [{ numeroItem: 1, descricao: "TROCARTE" }] },
      arquivos: { 1: "fora" },
    });
    expect(memoria.compras.get(chave(1))).toMatchObject({ area_saude: true, arquivos: [] });
    expect(totais).toMatchObject({ status: "parcial", erros: 1, compras_novas: 1 });
  });

  it("repete, no fim da busca, os termos que falharam; só conta como erro o que falhar de novo", async () => {
    const segmentos = [
      { id: "s", nome: "S", palavras_chave: ["a1", "a2", "a3", "a4", "trocarte", "zz"], sinonimos: [], exclusoes: [] },
    ];
    const { totais, memoria, chamadas } = await rodar(
      {
        busca: { trocarte: [daBusca(1)] },
        buscaFalhaNaPrimeira: ["trocarte"],
        buscaFalhaSempre: ["zz"],
        itens: { 1: [{ numeroItem: 1, descricao: "TROCARTE 5 MM" }] },
      },
      criarRepositorioMemoria(segmentos, () => AGORA),
    );
    expect(chamadas.filter((c) => c === "busca:trocarte:1")).toHaveLength(2);
    expect(chamadas.filter((c) => c === "busca:zz:1")).toHaveLength(2);
    expect(memoria.fases).toContain("repetindo 2 termos que falharam na busca");
    expect(memoria.compras.get(chave(1))?.area_saude).toBe(true);
    // O termo que se recuperou não vira erro; o que falhou duas vezes, sim.
    expect(totais).toMatchObject({ status: "parcial", fonte: "busca", termos_buscados: 5, erros: 1, compras_novas: 1 });
    expect(totais.mensagem).toContain("1 de 6 termos falharam na busca");
  });

  it("com a busca fora do ar, usa o plano B e filtra pelo objeto", async () => {
    const { totais, memoria, chamadas } = await rodar({
      busca: "fora",
      propostas: {
        6: [
          doDetalhe(1, { objetoCompra: "Aquisição de trocartes e pinças" }),
          doDetalhe(2, { objetoCompra: "Sementes e fertilizantes" }),
          doDetalhe(3, { objetoCompra: "Sondas de Foley", dataEncerramentoProposta: "2026-11-20T10:00:00" }),
        ],
        8: [doDetalhe(4, { objetoCompra: "Cateter duplo J", modalidadeId: 8, modalidadeNome: "Dispensa" })],
      },
      itens: {
        1: [{ numeroItem: 1, descricao: "TROCARTE 5 MM" }],
        4: [{ numeroItem: 1, descricao: "CATETER DUPLO J 6FR" }],
      },
    });
    expect(totais).toMatchObject({ fonte: "plano_b", compras_encontradas: 2, compras_novas: 2, status: "parcial" });
    expect(totais.mensagem).toContain("plano B");
    expect([...memoria.compras.keys()].sort()).toEqual([chave(1), chave(4)]);
    // Sondou a busca com poucos termos e desistiu; consultou as duas modalidades.
    expect(chamadas.filter((c) => c.startsWith("busca")).length).toBeLessThanOrEqual(4);
    expect(chamadas).toEqual(expect.arrayContaining(["proposta:6:1", "proposta:8:1"]));
  });

  it("confere no detalhe as compras conhecidas que sumiram da busca (ex.: revogadas)", async () => {
    const memoria = criarRepositorioMemoria(SEGMENTOS, () => AGORA);
    await rodar({ busca: { trocarte: [daBusca(1)] }, itens: { 1: [{ numeroItem: 1, descricao: "TROCARTE" }] } }, memoria);

    const depois = new Date("2026-11-22T17:00:00Z");
    const { totais, chamadas } = await rodar(
      { busca: { trocarte: [] }, detalhes: { 1: doDetalhe(1, { situacaoCompraId: 2 }) } },
      memoria,
      { ...CFG, agora: () => depois },
    );
    expect(chamadas).toContain("detalhe:1");
    expect(chamadas.filter((c) => c.startsWith("itens"))).toEqual([]);
    expect(totais).toMatchObject({ compras_atualizadas: 1, alteracoes: 1 });
    expect(memoria.compras.get(chave(1))?.compra.situacao_id).toBe(2);
    expect(memoria.alteracoes.at(-1)).toMatchObject({ campo: "situacao_id", de: 1, para: 2 });
  });

  it("respeita o máximo de compras por rodada, começando pelas disputas mais próximas", async () => {
    const { totais, memoria } = await rodar(
      {
        busca: {
          trocarte: [
            daBusca(1, { data_fim_vigencia: "2026-12-10T10:00" }),
            daBusca(2, { data_fim_vigencia: "2026-11-25T10:00" }),
            daBusca(3, { data_fim_vigencia: "2026-12-01T10:00" }),
          ],
        },
        itens: { 1: [{ numeroItem: 1, descricao: "TROCARTE" }], 2: [{ numeroItem: 1, descricao: "TROCARTE" }], 3: [{ numeroItem: 1, descricao: "TROCARTE" }] },
      },
      criarRepositorioMemoria(SEGMENTOS, () => AGORA),
      { ...CFG, maximoDeCompras: 2, paralelas: 1 },
    );
    expect(totais).toMatchObject({ compras_pendentes: 1, status: "sucesso" });
    expect(memoria.compras.get(chave(2))?.area_saude).toBe(true);
    expect(memoria.compras.get(chave(3))?.area_saude).toBe(true);
    expect(memoria.compras.get(chave(1))?.area_saude).toBeNull();
  });

  it("termina como erro quando não consegue consultar o PNCP de jeito nenhum", async () => {
    const { pncp, falhas } = pncpFalso({ busca: "fora" });
    (pncp as unknown as { listarPropostasAbertas: () => never }).listarPropostasAbertas = () => {
      falhas.push({ url: "https://pncp.gov.br/api/consulta/v1/contratacoes/proposta", status: 503, mensagem: "HTTP 503" });
      throw new ErroPncp("HTTP 503", "https://pncp.gov.br/api/consulta/v1/contratacoes/proposta", 503);
    };
    const memoria = criarRepositorioMemoria(SEGMENTOS, () => AGORA);
    const totais = await executarRodada(pncp, memoria.repositorio, CFG, falhas);
    expect(totais.status).toBe("erro");
    expect(totais.mensagem).toContain("Não foi possível consultar o PNCP");
    expect(memoria.erros.map((e) => e.etapa)).toEqual(expect.arrayContaining(["busca", "plano_b"]));
    expect(memoria.rodadas[0]).toMatchObject({ status: "erro" });
  });

  it("termina como erro se não houver segmentos com palavras-chave", async () => {
    const memoria = criarRepositorioMemoria([], () => AGORA);
    const { totais } = await rodar({ busca: {} }, memoria);
    expect(totais).toMatchObject({ status: "erro", mensagem: "Nenhum segmento ativo com palavras-chave." });
  });
});

describe("falhas do banco durante a rodada", () => {
  const itens = Object.fromEntries(
    Array.from({ length: 8 }, (_, i) => [i + 1, [{ numeroItem: 1, descricao: "TROCARTE 5 MM" }]]),
  );
  const busca = { trocarte: Array.from({ length: 8 }, (_, i) => daBusca(i + 1)) };

  it("uma gravação que falha não derruba a rodada: a compra fica para a próxima", async () => {
    const memoria = criarRepositorioMemoria(SEGMENTOS, () => AGORA);
    const original = memoria.repositorio.gravarCompra;
    memoria.repositorio.gravarCompra = async (gravacao) => {
      if (gravacao.compra.sequencial === 3) throw new Error("Banco (gravar x): resposta HTML: supabase.co | 522: Connection timed out");
      return original(gravacao);
    };
    const { totais } = await rodar({ busca, itens }, memoria, { ...CFG, paralelas: 1 });
    expect(totais).toMatchObject({ status: "parcial", compras_novas: 7, erros: 1 });
    expect(memoria.compras.has(chave(3))).toBe(false);
    expect(memoria.erros).toEqual([
      { etapa: "banco", mensagem: "Banco (gravar x): resposta HTML: supabase.co | 522: Connection timed out" },
    ]);
  });

  it("encerra como erro se o banco falhar várias vezes seguidas", async () => {
    const memoria = criarRepositorioMemoria(SEGMENTOS, () => AGORA);
    let chamadas = 0;
    memoria.repositorio.gravarCompra = async () => {
      chamadas++;
      throw new Error("Banco (gravar x): fetch failed");
    };
    const { totais } = await rodar({ busca, itens }, memoria, { ...CFG, paralelas: 1 });
    expect(chamadas).toBe(5);
    expect(totais.status).toBe("erro");
    expect(totais.mensagem).toContain("O banco falhou 5 vezes seguidas");
  });
});
