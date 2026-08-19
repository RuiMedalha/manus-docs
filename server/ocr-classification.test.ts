import { describe, expect, it } from "vitest";
import { buildSuggestedArchiveFolder, parseOcrSuggestion } from "./ocr-classification";

describe("validação das sugestões OCR", () => {
  const valid = { documentType: "fatura_recebida", entityRole: "fornecedor", entityName: "ACME", nif: "PT123456789", documentNumber: "FT 2026/1", documentDate: "2026-08-15", dueDate: null, totalCents: 12345, vatCents: 2307, currency: "EUR", tags: ["fornecedor"], accountingNature: "despesa", accountingSummary: "Fatura de compra para contabilização como despesa.", archiveArea: "contabilidade_compras", archiveReason: "Documento de compra de fornecedor.", requiresAccountingReview: true, confidence: 91, ocrText: "Fatura FT 2026/1" };
  it("aceita uma sugestão estruturalmente segura", () => {
    expect(parseOcrSuggestion(valid).totalCents).toBe(12345);
    expect(parseOcrSuggestion(valid).archiveFolder).toBe("/Contabilidade/Compras/2026/08/ACME");
  });
  it("rejeita datas e valores fora do contrato", () => {
    expect(() => parseOcrSuggestion({ ...valid, documentDate: "15/08/2026" })).toThrow();
    expect(() => parseOcrSuggestion({ ...valid, confidence: 101 })).toThrow();
  });
  it("propõe arquivo operacional para uma nota de envio logística", () => {
    expect(buildSuggestedArchiveFolder({ archiveArea: "operacoes_logistica", documentDate: "2025-07-24", entityName: "Onnera Group S. Coop." })).toBe("/Operacoes/Logistica/2025/07/Onnera Group S. Coop.");
  });
});
