import { describe, expect, it } from "vitest";
import { matchTransaction } from "./reconciliation";

describe("motor de conciliação", () => {
  const transaction = { id: 1, transactionDate: "2026-08-15", description: "Pagamento ACME LDA", amountCents: -12500, reference: "FT-2026-9" };
  it("prioriza referências idênticas como matching forte", () => {
    expect(matchTransaction(transaction, { id: 2, amountCents: 12500, externalReference: "FT-2026-9" })?.strength).toBe("forte");
  });
  it("sugere matching fraco para valor, data e contraparte semelhantes", () => {
    const result = matchTransaction({ ...transaction, reference: null }, { id: 2, amountCents: 12500, recordDate: "2026-08-12", counterparty: "ACME LDA" });
    expect(result).toMatchObject({ strength: "fraca", financialRecordId: 2 });
  });
});
