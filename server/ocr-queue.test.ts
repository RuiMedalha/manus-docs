import { describe, expect, it } from "vitest";
import { canClaimOcrJob, limitOcrBatch, OCR_BATCH_LIMIT, statusAfterOcrFailure } from "./ocr-queue";

describe("regras da fila OCR", () => {
  it("reclama apenas trabalhos pendentes com tentativas disponíveis", () => {
    expect(canClaimOcrJob({ status: "pendente", attemptCount: 1, maxAttempts: 3 })).toBe(true);
    expect(canClaimOcrJob({ status: "em_processamento", attemptCount: 1, maxAttempts: 3 })).toBe(false);
    expect(canClaimOcrJob({ status: "pendente", attemptCount: 3, maxAttempts: 3 })).toBe(false);
  });
  it("recoloca falhas transitórias e encerra quando as tentativas se esgotam", () => {
    expect(statusAfterOcrFailure(1, 3)).toBe("pendente");
    expect(statusAfterOcrFailure(3, 3)).toBe("falhou");
  });
  it("limita cada processamento manual a 20 documentos", () => {
    const ids = Array.from({ length: 23 }, (_, index) => index + 1);
    expect(limitOcrBatch(ids)).toHaveLength(OCR_BATCH_LIMIT);
    expect(limitOcrBatch(ids)).toEqual(ids.slice(0, 20));
  });
});
