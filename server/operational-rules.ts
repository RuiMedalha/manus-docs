export function isValidLogicalFolderPath(value: string) {
  const normalized = value.trim();
  return normalized.length >= 2 && normalized.length <= 512 && normalized.startsWith("/") && !normalized.includes("//") && !normalized.includes("..");
}

export function resolvePaymentSettlement(status: "pendente" | "pago" | "cancelado", paidAt?: string | null, fallbackDate = new Date().toISOString().slice(0, 10)) {
  return status === "pago" ? (paidAt ?? fallbackDate) : null;
}
