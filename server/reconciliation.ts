export type MatchTransaction = { id: number; transactionDate: string; description: string; amountCents: number; reference?: string | null };
export type MatchCandidate = { id: number; amountCents: number; recordDate?: string | null; externalReference?: string | null; orderNumber?: string | null; counterparty?: string | null; documentNumber?: string | null };
export type MatchResult = { financialRecordId: number; strength: "forte" | "media" | "fraca"; score: number; rationale: Record<string, unknown> } | null;

function normalise(value?: string | null) { return (value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(); }
function dateDistance(left?: string | null, right?: string | null) { if (!left || !right) return Number.POSITIVE_INFINITY; return Math.abs(new Date(`${left}T12:00:00Z`).getTime() - new Date(`${right}T12:00:00Z`).getTime()) / 86_400_000; }
function similarity(left: string, right: string) { const a = new Set(normalise(left).split(" ").filter(Boolean)); const b = new Set(normalise(right).split(" ").filter(Boolean)); const common = Array.from(a).filter(token => b.has(token)).length; return a.size + b.size ? (2 * common) / (a.size + b.size) : 0; }

export function matchTransaction(transaction: MatchTransaction, candidate: MatchCandidate): MatchResult {
  const description = normalise(transaction.description);
  const reference = normalise(transaction.reference);
  const candidateReference = normalise(candidate.externalReference || candidate.documentNumber);
  if (reference && candidateReference && reference === candidateReference) return { financialRecordId: candidate.id, strength: "forte", score: 100, rationale: { method: "reference", reference: transaction.reference } };
  const order = normalise(candidate.orderNumber);
  if (order && description.includes(order)) return { financialRecordId: candidate.id, strength: "media", score: 80, rationale: { method: "order_number", orderNumber: candidate.orderNumber } };
  const days = dateDistance(transaction.transactionDate, candidate.recordDate);
  const textScore = similarity(transaction.description, candidate.counterparty ?? "");
  if (Math.abs(transaction.amountCents) === Math.abs(candidate.amountCents) && days <= 7 && textScore >= 0.2) {
    return { financialRecordId: candidate.id, strength: "fraca", score: Math.min(74, Math.round(52 + textScore * 20 + Math.max(0, 7 - days))), rationale: { method: "amount_date_description", dateDistanceDays: days, descriptionSimilarity: Number(textScore.toFixed(2)) } };
  }
  return null;
}
