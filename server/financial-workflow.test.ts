import { describe, expect, it } from "vitest";
import { paymentApprovalReady, resolveEntityRole } from "./financial-workflow";

describe("fluxo financeiro de entidades e pagamentos", () => {
  it("determina fornecedor e cliente quando o OCR não consegue indicar o papel", () => {
    expect(resolveEntityRole("fatura_recebida", "desconhecido")).toBe("fornecedor");
    expect(resolveEntityRole("fatura_emitida", "desconhecido")).toBe("cliente");
    expect(resolveEntityRole("fatura_recebida", "cliente")).toBe("cliente");
  });
  it("só permite liquidar pagamentos aprovados com conta e categoria", () => {
    expect(paymentApprovalReady({ approvalStatus: "proposta", debitAccountId: 1, categoryId: 2 })).toBe(false);
    expect(paymentApprovalReady({ approvalStatus: "aprovada", debitAccountId: null, categoryId: 2 })).toBe(false);
    expect(paymentApprovalReady({ approvalStatus: "aprovada", debitAccountId: 1, categoryId: 2 })).toBe(true);
  });
});
