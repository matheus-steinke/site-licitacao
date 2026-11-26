import { describe, expect, it } from "vitest";

import { montarConvite } from "./convite";
import { MAXIMO_NO_EMAIL, montarEmailDiario, ordenar, resumoDosItens, type OportunidadeDoEmail } from "./diario";

function op(parcial: Partial<OportunidadeDoEmail> = {}): OportunidadeDoEmail {
  return {
    id: "o1", orgao: "Hospital Municipal", modalidade: "Pregão - Eletrônico", numeroCompra: "90012/2026",
    uf: "SP", municipio: "Campinas", dataDisputa: "2026-12-02T12:00:00+00:00", objeto: "Aquisição de luvas e seringas",
    prioridade: 3, itensCompativeis: 2, itensAVerificar: 1, itensDoSegmento: 5, ...parcial,
  };
}
const AGORA = new Date("2026-11-26T10:05:00Z");
const SITE = "https://app.exemplo.com.br";

describe("resumoDosItens", () => {
  it("fala do catálogo quando há itens casados", () => {
    expect(resumoDosItens(op())).toBe("2 itens compatíveis com o seu catálogo, 1 item a verificar");
    expect(resumoDosItens(op({ itensCompativeis: 1, itensAVerificar: 0 }))).toBe("1 item compatível com o seu catálogo");
  });
  it("sem catálogo, fala dos segmentos", () => {
    expect(resumoDosItens(op({ prioridade: 1, itensCompativeis: 0, itensAVerificar: 0, itensDoSegmento: 1 }))).toBe("1 item dos seus segmentos");
  });
});

describe("ordenar", () => {
  it("catálogo primeiro; depois a disputa mais próxima", () => {
    const lista = ordenar([
      op({ id: "seg", prioridade: 1, dataDisputa: "2026-11-27T12:00:00Z" }),
      op({ id: "longe", prioridade: 3, dataDisputa: "2026-12-20T12:00:00Z" }),
      op({ id: "perto", prioridade: 3, dataDisputa: "2026-11-30T12:00:00Z" }),
      op({ id: "verificar", prioridade: 2, dataDisputa: "2026-11-28T12:00:00Z" }),
    ]);
    expect(lista.map((o) => o.id)).toEqual(["perto", "longe", "verificar", "seg"]);
  });
});

describe("montarEmailDiario", () => {
  it("assunto, links e horário de Brasília", () => {
    const email = montarEmailDiario({ empresa: "Distribuidora Boa Saúde", oportunidades: [op(), op({ id: "o2", prioridade: 1, itensCompativeis: 0, itensAVerificar: 0 })], site: SITE, agora: AGORA });
    expect(email.assunto).toBe("2 oportunidades novas em licitações (26/11)");
    expect(email.texto).toContain("2 licitações novas entraram nas oportunidades de Distribuidora Boa Saúde, 1 delas com itens do seu catálogo.");
    // 12:00 UTC = 09:00 em Brasília.
    expect(email.texto).toContain("qua 02/12 às 09:00 · Campinas/SP");
    expect(email.texto).toContain(`${SITE}/oportunidades/o1`);
    expect(email.html).toContain(`href="${SITE}/oportunidades/o2"`);
    expect(email.html).toContain(`href="${SITE}/configuracoes"`);
    expect(email.texto).toContain("Configurações > Notificações");
  });

  it("uma só oportunidade: tudo no singular", () => {
    const email = montarEmailDiario({ empresa: "Boa Saúde", oportunidades: [op()], site: SITE, agora: AGORA });
    expect(email.assunto).toBe("1 oportunidade nova em licitações (26/11)");
    expect(email.texto).toContain("1 licitação nova entrou nas oportunidades de Boa Saúde, todas com itens do seu catálogo.");
  });

  it("só pelos segmentos", () => {
    const email = montarEmailDiario({ empresa: "Boa Saúde", oportunidades: [op({ prioridade: 1, itensCompativeis: 0, itensAVerificar: 0 })], site: SITE, agora: AGORA });
    expect(email.texto).toContain("pelos seus segmentos de interesse.");
  });

  it("lista no máximo 15 e conta o resto", () => {
    const muitas = Array.from({ length: MAXIMO_NO_EMAIL + 7 }, (_, i) => op({ id: `o${i}` }));
    const email = montarEmailDiario({ empresa: "Boa Saúde", oportunidades: muitas, site: SITE, agora: AGORA });
    expect(email.assunto).toContain("22 oportunidades novas");
    expect(email.texto).toContain("E mais 7 na lista completa.");
    expect(email.html.match(/Abrir a oportunidade/g)).toHaveLength(MAXIMO_NO_EMAIL);
  });

  it("escapa o que vem do PNCP e encurta objetos longos", () => {
    const email = montarEmailDiario({
      empresa: "Boa <b>Saúde</b>",
      oportunidades: [op({ orgao: 'Fundo <script>alert("x")</script>', objeto: `Aquisição de ${"material ".repeat(60)}` })],
      site: SITE, agora: AGORA,
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).not.toContain("Boa <b>");
    expect(email.html).toContain("…");
  });

  it("sem data de disputa nem número", () => {
    const email = montarEmailDiario({ empresa: "Boa Saúde", oportunidades: [op({ dataDisputa: null, numeroCompra: null, municipio: null })], site: SITE, agora: AGORA });
    expect(email.texto).toContain("data não informada · SP");
    expect(email.texto).toContain("nº s/nº");
  });
});

describe("montarConvite", () => {
  it("leva o link, a empresa e quem convidou", () => {
    const email = montarConvite({ empresa: "Boa Saúde", convidadoPor: "Ana Souza", emailConvidado: "joao@exemplo.com.br", link: `${SITE}/cadastrar?email=joao%40exemplo.com.br` });
    expect(email.assunto).toBe("Convite para entrar em Boa Saúde no Licita Saúde");
    expect(email.texto).toContain("Ana Souza convidou você para acompanhar as licitações de Boa Saúde");
    expect(email.texto).toContain(`Aceitar o convite: ${SITE}/cadastrar?email=joao%40exemplo.com.br`);
    expect(email.html).toContain(`href="${SITE}/cadastrar?email=joao%40exemplo.com.br"`);
    expect(email.html).toContain("14 dias");
  });

  it("sem o nome de quem convidou", () => {
    const email = montarConvite({ empresa: "A & B", convidadoPor: null, emailConvidado: "j@e.com", link: SITE });
    expect(email.texto).toContain("Você recebeu um convite para acompanhar");
    expect(email.html).toContain("A &amp; B");
  });
});
