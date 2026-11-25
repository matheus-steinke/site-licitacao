import { describe, expect, it } from "vitest";

import { cifrar, decifrar } from "./cifra";

const SEGREDO = "GOCSPX-segredo-de-teste-0123456789";

describe("cifra das credenciais", () => {
  it("decifra o que cifrou e nunca guarda o texto puro", () => {
    const token = "1//0gAbCdEf-token-de-atualizacao";
    const cifrado = cifrar(token, SEGREDO);
    expect(cifrado.startsWith("v1.")).toBe(true);
    expect(cifrado).not.toContain(token);
    expect(decifrar(cifrado, SEGREDO)).toBe(token);
  });

  it("cada cifragem sai diferente (IV novo)", () => {
    expect(cifrar("igual", SEGREDO)).not.toBe(cifrar("igual", SEGREDO));
  });

  it("não decifra com outro segredo nem texto adulterado", () => {
    const cifrado = cifrar("token", SEGREDO);
    expect(() => decifrar(cifrado, "GOCSPX-outro-segredo-0123456789")).toThrow();
    const partes = cifrado.split(".");
    partes[3] = Buffer.from("adulterado").toString("base64url");
    expect(() => decifrar(partes.join("."), SEGREDO)).toThrow();
    expect(() => decifrar("texto-qualquer", SEGREDO)).toThrow("formato desconhecido");
  });

  it("recusa segredo curto", () => {
    expect(() => cifrar("token", "curto")).toThrow("curto demais");
  });
});
