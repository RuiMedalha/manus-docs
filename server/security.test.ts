import { describe, expect, it } from "vitest";
import { canPerform, normaliseSlug } from "./security";

describe("regras de autorização por papel", () => {
  it("reserva a gestão de membros ao administrador", () => {
    expect(canPerform("admin", "members:manage")).toBe(true);
    expect(canPerform("contabilidade", "members:manage")).toBe(false);
    expect(canPerform("operador", "members:manage")).toBe(false);
  });

  it("permite revisão de conciliação à contabilidade e ao aprovador", () => {
    expect(canPerform("contabilidade", "reconciliation:review")).toBe(true);
    expect(canPerform("aprovador", "reconciliation:review")).toBe(true);
  });

  it("normaliza nomes de organizações para um slug seguro", () => {
    expect(normaliseSlug("Gestão & Filhos, Lda.")).toBe("gestao-filhos-lda");
  });
});
