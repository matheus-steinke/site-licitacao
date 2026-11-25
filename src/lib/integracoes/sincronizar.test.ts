import { describe, expect, it } from "vitest";

import { ArquivoGrandeDemais } from "./arquivos";
import { SUBPASTAS, type EventoDaAgenda, type LicitacaoParaIntegrar } from "./conteudo";
import { ErroDeAcesso, ESCOPO_AGENDA, ESCOPO_DRIVE } from "./google/oauth";
import { ErroDoGoogle } from "./google/servico";
import {
  MENSAGEM_DE_ACESSO,
  sincronizarOportunidade,
  sincronizarOrganizacao,
  type Armazenamento,
  type CamposDoVinculo,
  type Dependencias,
  type GoogleDaSincronizacao,
  type Integracao,
  type OportunidadeParaIntegrar,
  type Vinculo,
} from "./sincronizar";

const AGORA = new Date("2026-11-25T15:00:00Z").getTime();
const ORG = "org-1";

function licitacao(extras: Partial<LicitacaoParaIntegrar> = {}): LicitacaoParaIntegrar {
  return {
    oportunidadeId: "op-1",
    numeroCompra: "780",
    ano: 2026,
    modalidade: "Pregão - Eletrônico",
    orgao: "SECRETARIA DE ESTADO DA ADMINISTRACAO",
    objeto: "Materiais de urologia",
    uf: "SC",
    municipio: "Florianópolis",
    dataDisputa: "2026-12-03T16:15:00+00:00",
    situacao: null,
    linkPncp: "https://pncp.gov.br/app/editais/1/2026/780",
    itens: [{ numero: 45, descricao: "CATETER DUPLO J", quantidade: 10, unidade: "UN", nivel: "compativel", produto: "26 - Cateter" }],
    alertas: [],
    ...extras,
  };
}

function mundo(inicial: { integracao?: Partial<Integracao> | null; oportunidades?: Record<string, Partial<OportunidadeParaIntegrar>> } = {}) {
  let relogio = AGORA;
  const integracao: Integracao | null =
    inicial.integracao === null
      ? null
      : {
          id: "integ-1",
          conta: "dono@empresa.com",
          credenciais: "cifrado",
          escopos: [ESCOPO_AGENDA, ESCOPO_DRIVE],
          agendaAtiva: true,
          agendaId: "primary",
          driveAtivo: true,
          pastaRaizNome: "Licitações",
          pastaRaizId: null,
          automatico: true,
          erro: null,
          ...inicial.integracao,
        };
  const oportunidades = new Map<string, OportunidadeParaIntegrar>();
  for (const [id, parcial] of Object.entries(inicial.oportunidades ?? { "op-1": {} })) {
    oportunidades.set(id, {
      status: "aprovada",
      licitacao: licitacao({ oportunidadeId: id }),
      arquivos: [
        { id: "arq-1", sequencial: 1, titulo: "Edital.pdf", url: "https://pncp.gov.br/arquivos/1" },
        { id: "arq-2", sequencial: 2, titulo: "TR.pdf", url: "https://pncp.gov.br/arquivos/2" },
      ],
      ...parcial,
    });
  }
  const vinculos: (Vinculo & { oportunidadeId: string })[] = [];
  let proximo = 0;

  const armazenamento: Armazenamento = {
    async carregarIntegracao() {
      return integracao ? { ...integracao } : null;
    },
    async carregarOportunidade(_org, id) {
      return oportunidades.get(id) ?? null;
    },
    async listarVinculos(_org, id) {
      return vinculos.filter((v) => v.oportunidadeId === id).map((v) => ({ ...v }));
    },
    async reservarVinculo(_org, id, tipo) {
      const existente = vinculos.find((v) => v.oportunidadeId === id && v.tipo === tipo);
      if (existente) return { vinculo: { ...existente }, novo: false };
      const novo = {
        id: `v${++proximo}`, oportunidadeId: id, tipo, idExterno: null, link: null, dados: {},
        situacao: "pendente" as const, erro: null, atualizadoEm: new Date(relogio).toISOString(),
      };
      vinculos.push(novo);
      return { vinculo: { ...novo }, novo: true };
    },
    async salvarVinculo(id, campos: CamposDoVinculo) {
      const v = vinculos.find((x) => x.id === id);
      if (v) Object.assign(v, JSON.parse(JSON.stringify(campos)), { atualizadoEm: new Date(relogio).toISOString() });
    },
    async removerVinculo(id) {
      vinculos.splice(vinculos.findIndex((x) => x.id === id), 1);
    },
    async registrarEstado(_id, estado) {
      if (!integracao) return;
      if (estado.pastaRaizId !== undefined) integracao.pastaRaizId = estado.pastaRaizId;
      if (estado.erro !== undefined) integracao.erro = estado.erro;
    },
    async listarCandidatas() {
      return [...oportunidades.keys()];
    },
  };

  // Google falso: guarda eventos e pastas em memória e registra cada chamada.
  const chamadas: string[] = [];
  const eventos = new Map<string, { agenda: string; evento: EventoDaAgenda }>();
  const pastas = new Map<string, { nome: string; pai: string | null }>();
  const enviados: { nome: string; tipo: string; pai: string; bytes: number }[] = [];
  const falhar: { abrir?: Error; criarEvento?: Error; enviar?: (nome: string) => Error | null } = {};
  let n = 0;
  const google: GoogleDaSincronizacao = {
    async criarEvento(agenda, evento) {
      chamadas.push("criarEvento");
      if (falhar.criarEvento) throw falhar.criarEvento;
      const id = `ev${++n}`;
      eventos.set(id, { agenda, evento });
      return { id, link: `https://agenda/${id}` };
    },
    async atualizarEvento(agenda, id, evento) {
      chamadas.push("atualizarEvento");
      if (!eventos.has(id)) throw new ErroDoGoogle("Not Found", 404);
      eventos.set(id, { agenda, evento });
      return { id, link: `https://agenda/${id}` };
    },
    async removerEvento(_agenda, id) {
      chamadas.push("removerEvento");
      eventos.delete(id);
    },
    async criarPasta(nome, pai) {
      chamadas.push(`criarPasta:${nome}`);
      const id = `p${++n}`;
      pastas.set(id, { nome, pai });
      return { id, link: `https://drive/${id}` };
    },
    async pastaExiste(id) {
      return pastas.has(id);
    },
    async buscarPasta(nome, pai) {
      const achada = [...pastas.entries()].find(([, p]) => p.nome === nome && p.pai === pai);
      return achada ? { id: achada[0], link: `https://drive/${achada[0]}` } : null;
    },
    async enviarArquivo(nome, tipo, conteudo, pai) {
      chamadas.push(`enviar:${nome}`);
      const erro = falhar.enviar?.(nome);
      if (erro) throw erro;
      enviados.push({ nome, tipo, pai, bytes: conteudo.byteLength });
      return { id: `f${++n}`, nome };
    },
  };

  const baixados: string[] = [];
  const grandes = new Set<string>();
  const deps: Dependencias = {
    armazenamento,
    abrirGoogle: async () => {
      chamadas.push("abrirGoogle");
      if (falhar.abrir) throw falhar.abrir;
      return google;
    },
    baixar: async (arquivo) => {
      baixados.push(arquivo.id);
      if (grandes.has(arquivo.id)) throw new ArquivoGrandeDemais("Arquivo com mais de 40 MB.");
      return { nome: arquivo.titulo ?? "arquivo", tipo: "application/pdf", conteudo: new Uint8Array(10) };
    },
    linkDoApp: (id) => `https://app.exemplo/oportunidades/${id}`,
    agora: () => relogio,
  };

  return {
    deps, integracao, oportunidades, vinculos, chamadas, eventos, pastas, enviados, baixados, grandes, falhar,
    avancar: (ms: number) => { relogio += ms; },
    nomesDasPastas: () => [...pastas.values()].map((p) => p.nome),
    limpar: () => { chamadas.length = 0; },
  };
}

describe("oportunidade aprovada", () => {
  it("cria o evento, a árvore de pastas e envia os arquivos do edital", async () => {
    const m = mundo();
    const r = await sincronizarOportunidade(m.deps, ORG, "op-1");
    expect(r).toEqual({ evento: "criado", pasta: "criada", arquivos: { enviados: 2, pendentes: 0, falhas: 0 }, erroDeAcesso: null, erros: [] });

    const [evento] = [...m.eventos.values()];
    expect(evento.agenda).toBe("primary");
    expect(evento.evento.summary).toBe("PE 780/2026 - SECRETARIA DE ESTADO DA ADMINISTRACAO");
    expect(evento.evento.description).toContain("https://app.exemplo/oportunidades/op-1");

    expect(m.nomesDasPastas()).toEqual([
      "Licitações",
      "Dezembro 2026",
      "PE 780.2026 - SECRETARIA DE ESTADO DA ADMINISTRACAO 03.12",
      ...SUBPASTAS,
    ]);
    const idDoEdital = [...m.pastas.entries()].find(([, p]) => p.nome === "1. Edital e Anexos")![0];
    expect(m.enviados).toEqual([
      { nome: "Edital.pdf", tipo: "application/pdf", pai: idDoEdital, bytes: 10 },
      { nome: "TR.pdf", tipo: "application/pdf", pai: idDoEdital, bytes: 10 },
    ]);
    expect(m.integracao?.pastaRaizId).toBeTruthy();

    const evt = m.vinculos.find((v) => v.tipo === "evento")!;
    const pasta = m.vinculos.find((v) => v.tipo === "pasta")!;
    expect(evt).toMatchObject({ situacao: "ok", link: expect.stringContaining("https://agenda/"), dados: { data_disputa: "2026-12-03T16:15:00+00:00", agenda_id: "primary" } });
    expect(pasta).toMatchObject({ situacao: "ok", link: expect.stringContaining("https://drive/") });
    expect(Object.keys(pasta.dados.subpastas ?? {})).toEqual([...SUBPASTAS]);
    expect(Object.keys(pasta.dados.arquivos ?? {})).toEqual(["arq-1", "arq-2"]);
  });

  it("rodar de novo não duplica nada nem chama o Google à toa", async () => {
    const m = mundo();
    await sincronizarOportunidade(m.deps, ORG, "op-1");
    m.limpar();
    const r = await sincronizarOportunidade(m.deps, ORG, "op-1");
    expect(r).toMatchObject({ evento: "igual", pasta: "igual", arquivos: { enviados: 0, pendentes: 0, falhas: 0 } });
    expect(m.chamadas).toEqual([]);
    expect(m.eventos.size).toBe(1);
    expect(m.pastas.size).toBe(8);
  });

  it("duas oportunidades do mesmo mês dividem a pasta-raiz e a pasta do mês", async () => {
    const m = mundo({ oportunidades: { "op-1": {}, "op-2": { licitacao: licitacao({ oportunidadeId: "op-2", numeroCompra: "84", orgao: "MUNICIPIO DE TAMBOARA" }) } } });
    await sincronizarOportunidade(m.deps, ORG, "op-1");
    await sincronizarOportunidade(m.deps, ORG, "op-2");
    const nomes = m.nomesDasPastas();
    expect(nomes.filter((n) => n === "Licitações")).toHaveLength(1);
    expect(nomes.filter((n) => n === "Dezembro 2026")).toHaveLength(1);
    expect(nomes.filter((n) => n.startsWith("PE "))).toHaveLength(2);
  });

  it("atualiza o evento quando a data da disputa muda; a pasta fica como está", async () => {
    const m = mundo();
    await sincronizarOportunidade(m.deps, ORG, "op-1");
    m.oportunidades.get("op-1")!.licitacao = licitacao({ dataDisputa: "2026-12-10T13:00:00+00:00" });
    m.limpar();
    const r = await sincronizarOportunidade(m.deps, ORG, "op-1");
    expect(r).toMatchObject({ evento: "atualizado", pasta: "igual" });
    expect(m.chamadas).toEqual(["abrirGoogle", "atualizarEvento"]);
    expect(m.eventos.size).toBe(1);
    expect([...m.eventos.values()][0].evento.start.dateTime).toBe("2026-12-10T13:00:00.000Z");
    expect(m.vinculos.find((v) => v.tipo === "evento")?.dados.data_disputa).toBe("2026-12-10T13:00:00+00:00");
  });

  it("se o evento sumiu da agenda, cria outro ao atualizar", async () => {
    const m = mundo();
    await sincronizarOportunidade(m.deps, ORG, "op-1");
    m.eventos.clear();
    m.oportunidades.get("op-1")!.licitacao = licitacao({ situacao: "Suspensa" });
    const r = await sincronizarOportunidade(m.deps, ORG, "op-1");
    expect(r.evento).toBe("criado");
    expect(m.eventos.size).toBe(1);
    expect([...m.eventos.values()][0].evento.description).toContain("Suspensa");
  });

  it("com o automático desligado só cria pelo botão, mas continua atualizando o que existe", async () => {
    const m = mundo({ integracao: { automatico: false } });
    expect(await sincronizarOportunidade(m.deps, ORG, "op-1")).toMatchObject({ evento: "ignorado", pasta: "ignorada" });
    expect(m.chamadas).toEqual([]);

    expect(await sincronizarOportunidade(m.deps, ORG, "op-1", { manual: true })).toMatchObject({ evento: "criado", pasta: "criada" });
    m.oportunidades.get("op-1")!.licitacao = licitacao({ dataDisputa: "2026-12-11T13:00:00+00:00" });
    expect((await sincronizarOportunidade(m.deps, ORG, "op-1")).evento).toBe("atualizado");
  });

  it("respeita o que foi desligado ou não foi autorizado no Google", async () => {
    const semDrive = mundo({ integracao: { driveAtivo: false } });
    expect(await sincronizarOportunidade(semDrive.deps, ORG, "op-1")).toMatchObject({ evento: "criado", pasta: "ignorada" });
    expect(semDrive.pastas.size).toBe(0);

    const semEscopoDaAgenda = mundo({ integracao: { escopos: [ESCOPO_DRIVE] } });
    expect(await sincronizarOportunidade(semEscopoDaAgenda.deps, ORG, "op-1")).toMatchObject({ evento: "ignorado", pasta: "criada" });
    expect(semEscopoDaAgenda.eventos.size).toBe(0);
  });

  it("disputa que já passou não ganha evento nem pasta automaticamente; pelo botão, sim", async () => {
    const m = mundo({ oportunidades: { "op-1": { licitacao: licitacao({ dataDisputa: "2026-11-20T13:00:00+00:00" }) } } });
    expect(await sincronizarOportunidade(m.deps, ORG, "op-1")).toMatchObject({ evento: "ignorado", pasta: "ignorada" });
    expect(await sincronizarOportunidade(m.deps, ORG, "op-1", { manual: true })).toMatchObject({ evento: "criado", pasta: "criada" });
    expect(m.nomesDasPastas()).toContain("Novembro 2026");
  });

  it("sem organização conectada ou sem a oportunidade, não faz nada", async () => {
    const semIntegracao = mundo({ integracao: null });
    expect((await sincronizarOportunidade(semIntegracao.deps, ORG, "op-1")).evento).toBe("ignorado");
    const m = mundo();
    expect((await sincronizarOportunidade(m.deps, ORG, "nao-existe")).evento).toBe("ignorado");
    expect(m.chamadas).toEqual([]);
  });
});

describe("deixou de estar aprovada", () => {
  it("desfazer a aprovação ou descartar remove o evento e mantém as pastas", async () => {
    for (const status of ["nova", "descartada"] as const) {
      const m = mundo();
      await sincronizarOportunidade(m.deps, ORG, "op-1");
      m.oportunidades.get("op-1")!.status = status;
      const r = await sincronizarOportunidade(m.deps, ORG, "op-1");
      expect(r).toMatchObject({ evento: "removido", pasta: "ignorada" });
      expect(m.eventos.size).toBe(0);
      expect(m.vinculos.map((v) => v.tipo)).toEqual(["pasta"]);
      expect(m.pastas.size).toBe(8);
    }
  });

  it("aprovar de novo cria outro evento e reaproveita a pasta", async () => {
    const m = mundo();
    await sincronizarOportunidade(m.deps, ORG, "op-1");
    m.oportunidades.get("op-1")!.status = "nova";
    await sincronizarOportunidade(m.deps, ORG, "op-1");
    m.oportunidades.get("op-1")!.status = "aprovada";
    expect(await sincronizarOportunidade(m.deps, ORG, "op-1")).toMatchObject({ evento: "criado", pasta: "igual" });
    expect(m.eventos.size).toBe(1);
    expect(m.pastas.size).toBe(8);
  });

  it("ganha ou perdida: o evento fica na agenda e nada novo é criado", async () => {
    const m = mundo();
    await sincronizarOportunidade(m.deps, ORG, "op-1");
    m.oportunidades.get("op-1")!.status = "perdida";
    m.limpar();
    expect(await sincronizarOportunidade(m.deps, ORG, "op-1")).toMatchObject({ evento: "ignorado", pasta: "igual" });
    expect(m.eventos.size).toBe(1);
    expect(m.chamadas).toEqual([]);
  });
});

describe("arquivos do edital", () => {
  it("sem tempo, deixa os arquivos como pendentes e termina na vez seguinte", async () => {
    const m = mundo();
    const r1 = await sincronizarOportunidade(m.deps, ORG, "op-1", { semArquivos: true });
    expect(r1).toMatchObject({ evento: "criado", pasta: "criada", arquivos: { enviados: 0, pendentes: 2 } });
    expect(m.vinculos.find((v) => v.tipo === "pasta")?.situacao).toBe("pendente");

    const r2 = await sincronizarOportunidade(m.deps, ORG, "op-1", { prazo: AGORA - 1 });
    expect(r2.arquivos).toEqual({ enviados: 0, pendentes: 2, falhas: 0 });

    const r3 = await sincronizarOportunidade(m.deps, ORG, "op-1");
    expect(r3.arquivos).toEqual({ enviados: 2, pendentes: 0, falhas: 0 });
    expect(m.vinculos.find((v) => v.tipo === "pasta")?.situacao).toBe("ok");
    expect(m.baixados).toEqual(["arq-1", "arq-2"]);
  });

  it("um arquivo que falha é tentado até 3 vezes; os outros seguem", async () => {
    const m = mundo();
    m.falhar.enviar = (nome) => (nome === "TR.pdf" ? new ErroDoGoogle("Backend Error", 500) : null);
    const r1 = await sincronizarOportunidade(m.deps, ORG, "op-1");
    expect(r1.arquivos).toEqual({ enviados: 1, pendentes: 1, falhas: 0 });
    expect(r1.pasta).toBe("criada");
    await sincronizarOportunidade(m.deps, ORG, "op-1");
    const r3 = await sincronizarOportunidade(m.deps, ORG, "op-1");
    expect(r3.arquivos).toEqual({ enviados: 0, pendentes: 0, falhas: 1 });
    const pasta = m.vinculos.find((v) => v.tipo === "pasta")!;
    expect(pasta.situacao).toBe("ok");
    expect(pasta.dados.arquivos?.["arq-2"]).toMatchObject({ tentativas: 3, erro: expect.stringContaining("500") });

    m.limpar();
    await sincronizarOportunidade(m.deps, ORG, "op-1");
    expect(m.chamadas).toEqual([]);
  });

  it("arquivo grande demais não é tentado de novo e aponta para o PNCP", async () => {
    const m = mundo();
    m.grandes.add("arq-1");
    const r = await sincronizarOportunidade(m.deps, ORG, "op-1");
    expect(r.arquivos).toEqual({ enviados: 1, pendentes: 0, falhas: 1 });
    expect(m.vinculos.find((v) => v.tipo === "pasta")?.dados.arquivos?.["arq-1"]).toEqual({
      nome: "Edital.pdf",
      grande: true,
      erro: "Arquivo com mais de 40 MB. Baixe pelo PNCP.",
    });
    await sincronizarOportunidade(m.deps, ORG, "op-1");
    expect(m.baixados.filter((id) => id === "arq-1")).toHaveLength(1);
  });

  it("arquivo novo publicado depois (retificação) é enviado na vez seguinte", async () => {
    const m = mundo();
    await sincronizarOportunidade(m.deps, ORG, "op-1");
    m.oportunidades.get("op-1")!.arquivos.push({ id: "arq-3", sequencial: 3, titulo: "Errata.pdf", url: "https://pncp.gov.br/arquivos/3" });
    const r = await sincronizarOportunidade(m.deps, ORG, "op-1");
    expect(r.arquivos.enviados).toBe(1);
    expect(m.enviados.map((e) => e.nome)).toEqual(["Edital.pdf", "TR.pdf", "Errata.pdf"]);
  });
});

describe("falhas", () => {
  it("erro da agenda fica no vínculo e não impede o Drive; a vez seguinte tenta de novo", async () => {
    const m = mundo({ integracao: { agendaId: "nao-existe" } });
    m.falhar.criarEvento = new ErroDoGoogle("Not Found", 404);
    const r = await sincronizarOportunidade(m.deps, ORG, "op-1");
    expect(r.evento).toBe("erro");
    expect(r.pasta).toBe("criada");
    expect(r.erros).toEqual(["Agenda: Agenda não encontrada. Confira o ID da agenda em Integrações."]);
    expect(m.vinculos.find((v) => v.tipo === "evento")).toMatchObject({ situacao: "erro", idExterno: null });

    m.falhar.criarEvento = undefined;
    expect((await sincronizarOportunidade(m.deps, ORG, "op-1")).evento).toBe("criado");
    expect(m.eventos.size).toBe(1);
    expect(m.vinculos.filter((v) => v.tipo === "evento")).toHaveLength(1);
  });

  it("acesso revogado marca a integração; o coletor para de insistir e o botão tenta de novo", async () => {
    const m = mundo();
    m.falhar.abrir = new ErroDeAcesso("revogado");
    const r = await sincronizarOportunidade(m.deps, ORG, "op-1");
    expect(r.erroDeAcesso).toBe(MENSAGEM_DE_ACESSO);
    expect(m.integracao?.erro).toBe(MENSAGEM_DE_ACESSO);

    m.limpar();
    expect((await sincronizarOportunidade(m.deps, ORG, "op-1")).erroDeAcesso).toBe(MENSAGEM_DE_ACESSO);
    expect(m.chamadas).toEqual([]);

    // O dono reconectou (o erro some ao conectar) ou o acesso voltou: o botão limpa o erro.
    m.falhar.abrir = undefined;
    const r3 = await sincronizarOportunidade(m.deps, ORG, "op-1", { manual: true });
    expect(r3).toMatchObject({ evento: "criado", erroDeAcesso: null });
    expect(m.integracao?.erro).toBeNull();
  });

  it("reserva recente de outra sincronização não é atropelada; reserva velha é retomada", async () => {
    const m = mundo({ integracao: { driveAtivo: false } });
    await m.deps.armazenamento.reservarVinculo(ORG, "op-1", "evento");
    expect((await sincronizarOportunidade(m.deps, ORG, "op-1")).evento).toBe("ignorado");
    expect(m.eventos.size).toBe(0);
    m.avancar(5 * 60_000);
    expect((await sincronizarOportunidade(m.deps, ORG, "op-1")).evento).toBe("criado");
    expect(m.eventos.size).toBe(1);
  });

  it("pelo botão, a pasta apagada do Drive é refeita", async () => {
    const m = mundo();
    await sincronizarOportunidade(m.deps, ORG, "op-1");
    m.pastas.clear();
    m.integracao!.pastaRaizId = "sumiu";
    expect((await sincronizarOportunidade(m.deps, ORG, "op-1")).pasta).toBe("igual");
    const r = await sincronizarOportunidade(m.deps, ORG, "op-1", { manual: true });
    expect(r).toMatchObject({ pasta: "criada", arquivos: { enviados: 2 } });
    expect(m.pastas.size).toBe(8);
  });
});

describe("organização inteira (coletor)", () => {
  it("confere todas as candidatas e soma o que fez", async () => {
    const m = mundo({
      oportunidades: {
        "op-1": {},
        "op-2": { licitacao: licitacao({ oportunidadeId: "op-2", numeroCompra: "84" }), arquivos: [] },
        "op-3": { status: "descartada" },
      },
    });
    const r = await sincronizarOrganizacao(m.deps, ORG);
    expect(r).toEqual({
      conferidas: 3,
      eventos: { criados: 2, atualizados: 0, removidos: 0 },
      pastas: 2,
      arquivos: 2,
      erros: [],
      erroDeAcesso: null,
    });
  });

  it("para na primeira falha de acesso e nem começa se a conta já está marcada", async () => {
    const m = mundo({ oportunidades: { "op-1": {}, "op-2": {} } });
    m.falhar.abrir = new ErroDeAcesso("revogado");
    const r = await sincronizarOrganizacao(m.deps, ORG);
    expect(r).toMatchObject({ conferidas: 1, erroDeAcesso: MENSAGEM_DE_ACESSO });
    m.limpar();
    expect(await sincronizarOrganizacao(m.deps, ORG)).toMatchObject({ conferidas: 0, erroDeAcesso: MENSAGEM_DE_ACESSO });
    expect(m.chamadas).toEqual([]);
  });

  it("respeita o prazo", async () => {
    const m = mundo({ oportunidades: { "op-1": {}, "op-2": {} } });
    expect((await sincronizarOrganizacao(m.deps, ORG, { prazo: AGORA - 1 })).conferidas).toBe(0);
  });
});
