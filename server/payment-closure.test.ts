import { describe, expect, it } from "vitest";
import { documentLifecycleAfterSettlement, paymentClosureAudit } from "./payment-closure";

describe("fecho auditável de pagamentos", () => {
  it("mantém um débito direto como pago quando é confirmado manualmente", () => {
    const audit = paymentClosureAudit("debito_direto", "manual", 41, "2026-09-10");
    expect(documentLifecycleAfterSettlement("manual")).toBe("paga");
    expect(audit).toMatchObject({ action: "payment.direct_debit_manually_confirmed", metadata: { documentId: 41, closureType: "direct_debit_manual_confirmation" } });
  });

  it("marca um débito direto como conciliado quando o extrato o fecha", () => {
    const audit = paymentClosureAudit("debito_direto", "bank_reconciliation", 41, "2026-09-10");
    expect(documentLifecycleAfterSettlement("bank_reconciliation")).toBe("conciliada");
    expect(audit).toMatchObject({ action: "payment.direct_debit_reconciled", metadata: { documentId: 41, closureType: "direct_debit_bank_reconciliation" } });
  });
});
