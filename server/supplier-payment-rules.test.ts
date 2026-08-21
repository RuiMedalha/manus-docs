import { describe, expect, it } from "vitest";
import { addDaysToIsoDate, resolveSupplierPaymentPlan } from "./supplier-payment-rules";

describe("supplier payment rules", () => {
  it("calculates a 30-day supplier deadline when the invoice has no explicit due date", () => {
    expect(
      resolveSupplierPaymentPlan({
        documentDate: "2026-08-01",
        invoiceDueDate: null,
        suggestedFolder: "/Contabilidade/Faturas a pagar/2026/08/Mirandeseira",
        profile: { paymentMethod: "transferencia", paymentTermsDays: 30, finalFolder: null, defaultDebitAccountId: null, defaultCategoryId: null },
      }),
    ).toMatchObject({ dueDate: "2026-08-31", paymentMethod: "transferencia", calendarState: "a_pagar" });
  });

  it("uses the invoice due date in preference to the supplier default", () => {
    expect(
      resolveSupplierPaymentPlan({
        documentDate: "2026-08-01",
        invoiceDueDate: "2026-08-11",
        suggestedFolder: null,
        profile: { paymentMethod: "debito_direto", paymentTermsDays: 30, finalFolder: "/Contabilidade/Fornecedores/Tefcold", defaultDebitAccountId: 3, defaultCategoryId: 9 },
      }),
    ).toMatchObject({ dueDate: "2026-08-11", paymentMethod: "debito_direto", calendarState: "aguarda_debito_direto", finalFolder: "/Contabilidade/Fornecedores/Tefcold" });
  });

  it("handles month boundaries in payment terms", () => {
    expect(addDaysToIsoDate("2026-01-31", 30)).toBe("2026-03-02");
  });
});
