import { describe, expect, it } from "vitest";
import { parseOcrSuggestion } from "./ocr-classification";

describe("validação das sugestões OCR", () => {
  const valid = { documentType: "fatura_recebida", entityName: "ACME", nif: "PT123456789", documentNumber: "FT 2026/1", documentDate: "2026-08-15", dueDate: null, totalCents: 12345, vatCents: 2307, currency: "EUR", tags: ["fornecedor"], confidence: 91, ocrText: "Fatura FT 2026/1" };
  it("aceita uma sugestão estruturalmente segura", () => {
    expect(parseOcrSuggestion(valid).totalCents).toBe(12345);
  });
  it("rejeita datas e valores fora do contrato", () => {
    expect(() => parseOcrSuggestion({ ...valid, documentDate: "15/08/2026" })).toThrow();
    expect(() => parseOcrSuggestion({ ...valid, confidence: 101 })).toThrow();
  });
});
