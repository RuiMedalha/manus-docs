export type OcrQueueState = "pendente" | "em_processamento" | "concluido" | "falhou" | "ignorado";

export const OCR_BATCH_LIMIT = 20;

export function canClaimOcrJob(job: { status: OcrQueueState; attemptCount: number; maxAttempts: number }) {
  return job.status === "pendente" && job.attemptCount < job.maxAttempts;
}

export function statusAfterOcrFailure(attemptCount: number, maxAttempts: number): "pendente" | "falhou" {
  return attemptCount >= maxAttempts ? "falhou" : "pendente";
}

export function limitOcrBatch<T>(items: T[]) {
  return items.slice(0, OCR_BATCH_LIMIT);
}

export function selectDocumentsWithoutOcrJob<T extends { id: number }>(documents: T[], jobs: Array<{ documentId: number }>, limit: number) {
  const requestedDocumentIds = new Set(jobs.map(job => job.documentId));
  return documents.filter(document => !requestedDocumentIds.has(document.id)).slice(0, Math.max(1, limit));
}
