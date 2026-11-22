import { describe, expect, it } from "vitest";

import { limparUfs, TODAS_UFS } from "./ufs";

describe("ufs", () => {
  it("tem as 27 unidades da federação, sem repetição", () => {
    expect(TODAS_UFS).toHaveLength(27);
    expect(new Set(TODAS_UFS).size).toBe(27);
  });

  it("descarta valores inválidos e repetidos", () => {
    expect(limparUfs(["SC", "XX", "PR", "SC", 5, null])).toEqual(["PR", "SC"]);
    expect(limparUfs([])).toEqual([]);
  });
});
