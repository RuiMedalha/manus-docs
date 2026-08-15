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
