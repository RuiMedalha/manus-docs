import { describe, expect, it } from "vitest";
import { isValidLogicalFolderPath, resolvePaymentSettlement } from "./operational-rules";

describe("regras de pastas e pagamentos", () => {
  it("aceita apenas caminhos lógicos absolutos e seguros", () => {
    expect(isValidLogicalFolderPath("/2026/08/Fatura recebida/ACME")).toBe(true);
    expect(isValidLogicalFolderPath("2026/08")).toBe(false);
    expect(isValidLogicalFolderPath("/2026//08")).toBe(false);
    expect(isValidLogicalFolderPath("/2026/../segredo")).toBe(false);
  });

  it("atribui data de liquidação apenas a pagamentos confirmados", () => {
    expect(resolvePaymentSettlement("pago", undefined, "2026-08-15")).toBe("2026-08-15");
    expect(resolvePaymentSettlement("pago", "2026-08-10", "2026-08-15")).toBe("2026-08-10");
    expect(resolvePaymentSettlement("pendente", "2026-08-10", "2026-08-15")).toBeNull();
    expect(resolvePaymentSettlement("cancelado", undefined, "2026-08-15")).toBeNull();
  });
});
