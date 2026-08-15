export type FinancialDocumentType = "fatura_recebida" | "fatura_emitida" | "recibo" | "comprovativo" | "encomenda" | "outro";
export type EntityRole = "fornecedor" | "cliente" | "desconhecido";

export function resolveEntityRole(documentType: FinancialDocumentType, extractedRole: EntityRole): "fornecedor" | "cliente" {
  if (extractedRole !== "desconhecido") return extractedRole;
  return documentType === "fatura_emitida" ? "cliente" : "fornecedor";
}

export function paymentApprovalReady(input: { approvalStatus: "proposta" | "aprovada" | "rejeitada"; debitAccountId: number | null; categoryId: number | null }) {
  return input.approvalStatus === "aprovada" && input.debitAccountId !== null && input.categoryId !== null;
}
