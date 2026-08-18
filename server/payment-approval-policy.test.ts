import { describe, expect, it } from "vitest";
import { resolveApprovalPolicy, roleMayApprove } from "./payment-approval-policy";

describe("políticas de aprovação", () => {
  const policies = [
    { id: 1, minAmountCents: 0, categoryId: null, requiredRole: "contabilidade" as const, enabled: true },
    { id: 2, minAmountCents: 100000, categoryId: null, requiredRole: "aprovador" as const, enabled: true },
    { id: 3, minAmountCents: 50000, categoryId: 8, requiredRole: "admin" as const, enabled: true },
  ];
  it("seleciona a regra mais específica compatível com o montante e categoria", () => {
    expect(resolveApprovalPolicy(policies, { amountCents: 125000, categoryId: 2 })?.id).toBe(2);
    expect(resolveApprovalPolicy(policies, { amountCents: 75000, categoryId: 8 })?.id).toBe(3);
  });
  it("permite sempre ao administrador aprovar e restringe os restantes ao papel exigido", () => {
    expect(roleMayApprove("admin", "aprovador")).toBe(true);
    expect(roleMayApprove("contabilidade", "aprovador")).toBe(false);
    expect(roleMayApprove("aprovador", "aprovador")).toBe(true);
  });
});
