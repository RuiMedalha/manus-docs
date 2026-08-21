export type SupplierPaymentMethod = "manual" | "transferencia" | "cartao" | "debito_direto";

export type SupplierPaymentProfile = {
  paymentMethod: SupplierPaymentMethod;
  paymentTermsDays: number | null;
  finalFolder: string | null;
  defaultDebitAccountId: number | null;
  defaultCategoryId: number | null;
};

function validIsoDate(value: string | null | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export function addDaysToIsoDate(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day));
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function resolveSupplierPaymentPlan(input: {
  documentDate: string | null | undefined;
  invoiceDueDate: string | null | undefined;
  suggestedFolder: string | null | undefined;
  profile?: SupplierPaymentProfile | null;
}) {
  const profile = input.profile;
  const terms = profile?.paymentTermsDays ?? null;
  const dueDate = validIsoDate(input.invoiceDueDate)
    ? input.invoiceDueDate!
    : validIsoDate(input.documentDate) && typeof terms === "number" && terms >= 0
      ? addDaysToIsoDate(input.documentDate!, terms)
      : null;

  return {
    dueDate,
    paymentMethod: profile?.paymentMethod ?? "manual",
    finalFolder: profile?.finalFolder?.trim() || input.suggestedFolder || null,
    defaultDebitAccountId: profile?.defaultDebitAccountId ?? null,
    defaultCategoryId: profile?.defaultCategoryId ?? null,
    calendarState: profile?.paymentMethod === "debito_direto" ? "aguarda_debito_direto" : "a_pagar",
  } as const;
}
