export type DocumentCrmStatus = "synced" | "pending" | "unlinked";

export function resolveDocumentCrmStatus(entityId: number | null, externalCrmId: string | null): DocumentCrmStatus {
  if (!entityId) return "unlinked";
  return externalCrmId ? "synced" : "pending";
}
