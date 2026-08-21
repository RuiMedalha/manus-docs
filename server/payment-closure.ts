export type PaymentSettlementSource = "manual" | "bank_reconciliation";
export type PaymentMethod = "manual" | "transferencia" | "cartao" | "debito_direto";

export function documentLifecycleAfterSettlement(source: PaymentSettlementSource) {
  return source === "bank_reconciliation" ? "conciliada" as const : "paga" as const;
}

export function paymentClosureAudit(
  paymentMethod: PaymentMethod,
  source: PaymentSettlementSource,
  documentId: number | null,
  paidAt: string | null,
) {
  const directDebit = paymentMethod === "debito_direto";
  const manualDirectDebit = directDebit && source === "manual";
  const reconciledDirectDebit = directDebit && source === "bank_reconciliation";
  return {
    action: manualDirectDebit
      ? "payment.direct_debit_manually_confirmed"
      : reconciledDirectDebit
        ? "payment.direct_debit_reconciled"
        : source === "bank_reconciliation"
          ? "payment.reconciled"
          : "payment.pago",
    metadata: {
      paidAt,
      settlementSource: source,
      paymentMethod,
      documentId,
      closureType: manualDirectDebit
        ? "direct_debit_manual_confirmation"
        : reconciledDirectDebit
          ? "direct_debit_bank_reconciliation"
          : source === "bank_reconciliation"
            ? "bank_reconciliation"
            : "manual_status_update",
    },
  };
}
