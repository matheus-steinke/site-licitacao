import { describe, expect, it } from "vitest";

import type { OportunidadeDoEmail } from "./diario";
import { diaEHora, enviarEmailsDiarios, inicioDaJanela, type ArmazenamentoDoEmail, type EnvioDoDia } from "./envio-diario";

const CONFIG = { apiKey: "re_teste", remetente: "Licita <avisos@exemplo.com.br>" };
const SITE = "https://app.exemplo.com.br";
/** 10:30 UTC = 07:30 em Brasília. */
const SETE_E_MEIA = new Date("2026-11-26T10:30:00Z");

type Oportunidade = OportunidadeDoEmail & { criadoEm: string };
function op(id: string, criadoEm: string, parcial: Partial<OportunidadeDoEmail> = {}): Oportunidade {
  return {
    id, criadoEm, orgao: "Hospital", modalidade: "Pregão", numeroCompra: "1/2026", uf: "SP", municipio: "Campinas",
    dataDisputa: "2026-12-10T12:00:00Z", objeto: "Luvas", prioridade: 3, itensCompativeis: 1, itensAVerificar: 0, itensDoSegmento: 1, ...parcial,
  };
}

/** Banco em memória. O relógio do "banco" é o mesmo do teste. */
function bancoFalso(dados: {
  empresas?: { id: string; razaoSocial: string; hora: number }[];
  destinatarios?: Record<string, { userId: string; email: string }[]>;
  oportunidades?: Record<string, Oportunidade[]>;
  envios?: (EnvioDoDia & { orgId: string; dia: string; destinatarios?: number; oportunidades?: number; erro?: string | null })[];
  agora: () => Date;
}) {
  const envios = dados.envios ?? [];
  const consultas: { orgId: string; desde: string; ate: string }[] = [];
  const banco: ArmazenamentoDoEmail = {
    empresas: async (soUma) => (dados.empresas ?? [{ id: "org1", razaoSocial: "Boa Saúde", hora: 7 }]).filter((e) => !soUma || e.id === soUma),
    envioDoDia: async (orgId, dia) => envios.find((e) => e.orgId === orgId && e.dia === dia) ?? null,
    ultimoConcluido: async (orgId, antes) =>
      envios.filter((e) => e.orgId === orgId && e.dia < antes && e.status !== "erro").sort((a, b) => b.dia.localeCompare(a.dia))[0]?.criadoEm ?? null,
    reservar: async (orgId, dia) => {
      const envio = { id: `e${envios.length + 1}`, orgId, dia, status: "erro" as const, criadoEm: dados.agora().toISOString(), erro: "O envio não foi concluído." };
      envios.push(envio);
      return envio;
    },
    concluir: async (id, resultado) => {
      Object.assign(envios.find((e) => e.id === id)!, resultado);
    },
    destinatarios: async (orgId) => (dados.destinatarios ?? { org1: [{ userId: "u1", email: "ana@exemplo.com.br" }] })[orgId] ?? [],
    oportunidadesNovas: async (orgId, desde, ate, agora) => {
      consultas.push({ orgId, desde, ate });
      return (dados.oportunidades?.[orgId] ?? []).filter(
        (o) => o.criadoEm > desde && o.criadoEm <= ate && (o.dataDisputa ?? "") >= agora,
      );
    },
  };
  return { banco, envios, consultas };
}

function resendFalso(falharPara: string[] = []) {
  const enviados: { para: string; assunto: string; chave: string }[] = [];
  const buscar = (async (_url: string | URL | Request, init?: RequestInit) => {
    const corpo = JSON.parse(String(init?.body)) as { to: string[]; subject: string };
    if (falharPara.includes(corpo.to[0])) {
      return new Response(JSON.stringify({ message: "You can only send testing emails to your own email address. Please verify a domain." }), { status: 403 });
    }
    enviados.push({ para: corpo.to[0], assunto: corpo.subject, chave: (init?.headers as Record<string, string>)["Idempotency-Key"] });
    return new Response(JSON.stringify({ id: `m${enviados.length}` }), { status: 200 });
  }) as typeof fetch;
  return { buscar, enviados };
}

describe("diaEHora", () => {
  it("usa o horário de Brasília, inclusive na virada do dia", () => {
    expect(diaEHora(new Date("2026-11-26T10:30:00Z"))).toEqual({ dia: "2026-11-26", hora: 7 });
    expect(diaEHora(new Date("2026-11-27T02:59:00Z"))).toEqual({ dia: "2026-11-26", hora: 23 });
    expect(diaEHora(new Date("2026-11-27T03:00:00Z"))).toEqual({ dia: "2026-11-27", hora: 0 });
  });
});

describe("inicioDaJanela", () => {
  const fim = "2026-11-26T10:30:00.000Z";
  it("primeiro envio: 24 horas", () => {
    expect(inicioDaJanela(null, fim)).toBe("2026-11-25T10:30:00.000Z");
  });
  it("continua de onde o último envio parou", () => {
    expect(inicioDaJanela("2026-11-25T10:07:00.000Z", fim)).toBe("2026-11-25T10:07:00.000Z");
  });
  it("não volta mais que 72 horas", () => {
    expect(inicioDaJanela("2026-11-10T10:00:00.000Z", fim)).toBe("2026-11-23T10:30:00.000Z");
  });
});

describe("enviarEmailsDiarios", () => {
  it("envia para quem recebe, com as oportunidades desde o último envio, e registra", async () => {
    const { banco, envios, consultas } = bancoFalso({
      agora: () => SETE_E_MEIA,
      destinatarios: { org1: [{ userId: "u1", email: "ana@exemplo.com.br" }, { userId: "u2", email: "joao@exemplo.com.br" }] },
      envios: [{ id: "e0", orgId: "org1", dia: "2026-11-25", status: "enviado", criadoEm: "2026-11-25T10:10:00.000Z" }],
      oportunidades: {
        org1: [
          op("antiga", "2026-11-25T09:00:00.000Z"),
          op("nova1", "2026-11-25T15:00:00.000Z"),
          op("nova2", "2026-11-26T08:00:00.000Z", { prioridade: 1 }),
          op("ja-disputada", "2026-11-26T08:00:00.000Z", { dataDisputa: "2026-11-26T09:00:00Z" }),
        ],
      },
    });
    const { buscar, enviados } = resendFalso();
    const [r] = await enviarEmailsDiarios(banco, CONFIG, { agora: SETE_E_MEIA, site: SITE, buscar });

    expect(r).toMatchObject({ situacao: "enviado", oportunidades: 2, destinatarios: 2, erro: null });
    expect(consultas).toEqual([{ orgId: "org1", desde: "2026-11-25T10:10:00.000Z", ate: SETE_E_MEIA.toISOString() }]);
    expect(enviados.map((e) => e.para)).toEqual(["ana@exemplo.com.br", "joao@exemplo.com.br"]);
    expect(enviados[0].assunto).toBe("2 oportunidades novas em licitações (26/11)");
    expect(enviados[0].chave).toBe("diario/org1/2026-11-26/u1");
    expect(envios.at(-1)).toMatchObject({ dia: "2026-11-26", status: "enviado", destinatarios: 2, oportunidades: 2, erro: null });
  });

  it("antes da hora escolhida, não faz nada", async () => {
    const { banco, envios } = bancoFalso({ agora: () => SETE_E_MEIA, empresas: [{ id: "org1", razaoSocial: "Boa Saúde", hora: 8 }], oportunidades: { org1: [op("a", "2026-11-26T08:00:00.000Z")] } });
    const { buscar, enviados } = resendFalso();
    const [r] = await enviarEmailsDiarios(banco, CONFIG, { agora: SETE_E_MEIA, site: SITE, buscar });
    expect(r.situacao).toBe("cedo");
    expect(enviados).toHaveLength(0);
    expect(envios).toHaveLength(0);

    const [forcado] = await enviarEmailsDiarios(banco, CONFIG, { agora: SETE_E_MEIA, site: SITE, buscar, ignorarHora: true });
    expect(forcado.situacao).toBe("enviado");
  });

  it("uma vez por dia: a segunda passada não reenvia", async () => {
    const { banco } = bancoFalso({ agora: () => SETE_E_MEIA, oportunidades: { org1: [op("a", "2026-11-26T08:00:00.000Z")] } });
    const { buscar, enviados } = resendFalso();
    await enviarEmailsDiarios(banco, CONFIG, { agora: SETE_E_MEIA, site: SITE, buscar });
    const [r] = await enviarEmailsDiarios(banco, CONFIG, { agora: new Date("2026-11-26T11:30:00Z"), site: SITE, buscar });
    expect(r.situacao).toBe("ja_feito");
    expect(enviados).toHaveLength(1);
  });

  it("dia sem novidade: não envia e registra como vazio", async () => {
    const { banco, envios } = bancoFalso({ agora: () => SETE_E_MEIA });
    const { buscar, enviados } = resendFalso();
    const [r] = await enviarEmailsDiarios(banco, CONFIG, { agora: SETE_E_MEIA, site: SITE, buscar });
    expect(r.situacao).toBe("vazio");
    expect(enviados).toHaveLength(0);
    expect(envios[0]).toMatchObject({ status: "vazio", destinatarios: 0, oportunidades: 0, erro: null });
  });

  it("ninguém quer receber: não registra nada", async () => {
    const { banco, envios } = bancoFalso({ agora: () => SETE_E_MEIA, destinatarios: { org1: [] }, oportunidades: { org1: [op("a", "2026-11-26T08:00:00.000Z")] } });
    const [r] = await enviarEmailsDiarios(banco, CONFIG, { agora: SETE_E_MEIA, site: SITE, buscar: resendFalso().buscar });
    expect(r.situacao).toBe("sem_destinatarios");
    expect(envios).toHaveLength(0);
  });

  it("falha para todos: fica como erro e a hora seguinte tenta de novo, com a mesma janela", async () => {
    let relogio = SETE_E_MEIA;
    const { banco, envios, consultas } = bancoFalso({ agora: () => relogio, oportunidades: { org1: [op("a", "2026-11-26T08:00:00.000Z"), op("depois", "2026-11-26T11:00:00.000Z")] } });
    const [r1] = await enviarEmailsDiarios(banco, CONFIG, { agora: relogio, site: SITE, buscar: resendFalso(["ana@exemplo.com.br"]).buscar });
    expect(r1.situacao).toBe("erro");
    expect(r1.erro).toContain("domínio verificado");
    expect(envios[0]).toMatchObject({ status: "erro", destinatarios: 0, oportunidades: 1 });

    relogio = new Date("2026-11-26T11:30:00Z");
    const { buscar, enviados } = resendFalso();
    const [r2] = await enviarEmailsDiarios(banco, CONFIG, { agora: relogio, site: SITE, buscar });
    expect(r2).toMatchObject({ situacao: "enviado", oportunidades: 1, destinatarios: 1 });
    expect(enviados[0].chave).toBe("diario/org1/2026-11-26/u1");
    expect(envios).toHaveLength(1);
    // A que chegou depois da primeira tentativa fica para o e-mail de amanhã.
    expect(consultas[1]).toEqual(consultas[0]);
  });

  it("falha para um só: conta como enviado e guarda o motivo", async () => {
    const { banco, envios } = bancoFalso({
      agora: () => SETE_E_MEIA,
      destinatarios: { org1: [{ userId: "u1", email: "ana@exemplo.com.br" }, { userId: "u2", email: "joao@exemplo.com.br" }] },
      oportunidades: { org1: [op("a", "2026-11-26T08:00:00.000Z")] },
    });
    const [r] = await enviarEmailsDiarios(banco, CONFIG, { agora: SETE_E_MEIA, site: SITE, buscar: resendFalso(["joao@exemplo.com.br"]).buscar });
    expect(r).toMatchObject({ situacao: "enviado", destinatarios: 1 });
    expect(envios[0].erro).toContain("joao@exemplo.com.br");
  });

  it("depois de um dia com erro, o envio seguinte cobre os dois dias", async () => {
    const { banco, consultas } = bancoFalso({
      agora: () => SETE_E_MEIA,
      envios: [
        { id: "e0", orgId: "org1", dia: "2026-11-24", status: "vazio", criadoEm: "2026-11-24T10:10:00.000Z" },
        { id: "e1", orgId: "org1", dia: "2026-11-25", status: "erro", criadoEm: "2026-11-25T10:10:00.000Z" },
      ],
      oportunidades: { org1: [op("de-anteontem", "2026-11-24T18:00:00.000Z")] },
    });
    const [r] = await enviarEmailsDiarios(banco, CONFIG, { agora: SETE_E_MEIA, site: SITE, buscar: resendFalso().buscar });
    expect(consultas[0].desde).toBe("2026-11-24T10:10:00.000Z");
    expect(r).toMatchObject({ situacao: "enviado", oportunidades: 1 });
  });

  it("simular não envia nem grava", async () => {
    const { banco, envios } = bancoFalso({ agora: () => SETE_E_MEIA, oportunidades: { org1: [op("a", "2026-11-26T08:00:00.000Z")] } });
    const { buscar, enviados } = resendFalso();
    const [r] = await enviarEmailsDiarios(banco, CONFIG, { agora: SETE_E_MEIA, site: SITE, buscar, simular: true });
    expect(r).toMatchObject({ situacao: "simulado", oportunidades: 1, destinatarios: 1 });
    expect(enviados).toHaveLength(0);
    expect(envios).toHaveLength(0);
  });

  it("erro numa empresa não impede as outras", async () => {
    const { banco } = bancoFalso({
      agora: () => SETE_E_MEIA,
      empresas: [{ id: "org1", razaoSocial: "Primeira", hora: 7 }, { id: "org2", razaoSocial: "Segunda", hora: 7 }],
      destinatarios: { org1: [{ userId: "u1", email: "a@e.com" }], org2: [{ userId: "u2", email: "b@e.com" }] },
      oportunidades: { org2: [op("b", "2026-11-26T08:00:00.000Z")] },
    });
    const original = banco.oportunidadesNovas;
    banco.oportunidadesNovas = async (orgId, ...resto) => {
      if (orgId === "org1") throw new Error("banco fora do ar");
      return original(orgId, ...resto);
    };
    const { buscar, enviados } = resendFalso();
    const r = await enviarEmailsDiarios(banco, CONFIG, { agora: SETE_E_MEIA, site: SITE, buscar });
    expect(r.map((x) => x.situacao)).toEqual(["erro", "enviado"]);
    expect(r[0].erro).toBe("banco fora do ar");
    expect(enviados.map((e) => e.para)).toEqual(["b@e.com"]);
  });
});
