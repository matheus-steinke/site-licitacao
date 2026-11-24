import { describe, expect, it } from "vitest";

import { diasDeRetencao, problemaNaChave } from "./index";

const jwt = (papel: string) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: papel })).toString("base64url")}.assinatura`;

describe("conferência da chave do Supabase", () => {
  it("aceita chave de serviço nos dois formatos", () => {
    expect(problemaNaChave(jwt("service_role"))).toBeNull();
    expect(problemaNaChave("sb_secret_abcdefghijklmnopqrstuvwxyz0123456789")).toBeNull();
  });

  it("aponta chave pública, mascarada, cortada ou com texto a mais", () => {
    expect(problemaNaChave(jwt("anon"))).toContain("chave pública (anon)");
    expect(problemaNaChave("sb_publishable_abcdefghijklmnopqrstuvwxyz")).toContain("chave pública");
    expect(problemaNaChave("sb_secret_abc••••••••")).toContain("mascarado");
    expect(problemaNaChave("sb_secret_abc...")).toContain("mascarado");
    expect(problemaNaChave("sb_secret_abc")).toContain("cortado");
    expect(problemaNaChave("eyJhbGciOiJIUzI1NiJ9.eyJyb2xl")).toContain("cortado");
    expect(problemaNaChave("service_role:eyJhbGciOiJIUzI1NiJ9")).toContain("não começa com");
    expect(problemaNaChave("minha-senha-do-banco")).toContain("não começa com");
  });
});

describe("dias de retenção dos itens", () => {
  it("usa 30 dias quando a variável está vazia ou inválida, e aceita 0 para desligar", () => {
    expect(diasDeRetencao(undefined)).toBe(30);
    expect(diasDeRetencao("")).toBe(30);
    expect(diasDeRetencao("abc")).toBe(30);
    expect(diasDeRetencao("-5")).toBe(30);
    expect(diasDeRetencao("45")).toBe(45);
    expect(diasDeRetencao("0")).toBe(0);
  });
});
