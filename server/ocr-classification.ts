import { z } from "zod";

export const documentTypeValues = ["fatura_recebida", "fatura_emitida", "recibo", "comprovativo", "encomenda", "outro"] as const;

export const ocrSuggestionSchema = z.object({
  documentType: z.enum(documentTypeValues),
  entityRole: z.enum(["fornecedor", "cliente", "desconhecido"]),
  entityName: z.string().max(255).nullable(),
  nif: z.string().max(32).nullable(),
  documentNumber: z.string().max(100).nullable(),
  documentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  totalCents: z.number().int().min(0).nullable(),
  vatCents: z.number().int().min(0).nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  tags: z.array(z.string().min(1).max(32)).max(12),
  confidence: z.number().int().min(0).max(100),
  ocrText: z.string().max(12_000),
});

export type OcrSuggestion = z.infer<typeof ocrSuggestionSchema>;

export function parseOcrSuggestion(payload: unknown): OcrSuggestion {
  return ocrSuggestionSchema.parse(payload);
}

export const ocrOutputSchema = {
  name: "document_metadata",
  strict: true,
  schema: {
    type: "object",
    properties: {
      documentType: { type: "string", enum: documentTypeValues },
      entityRole: { type: "string", enum: ["fornecedor", "cliente", "desconhecido"] },
      entityName: { type: ["string", "null"] },
      nif: { type: ["string", "null"] },
      documentNumber: { type: ["string", "null"] },
      documentDate: { type: ["string", "null"] },
      dueDate: { type: ["string", "null"] },
      totalCents: { type: ["integer", "null"] },
      vatCents: { type: ["integer", "null"] },
      currency: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
      confidence: { type: "integer" },
      ocrText: { type: "string" },
    },
    required: ["documentType", "entityRole", "entityName", "nif", "documentNumber", "documentDate", "dueDate", "totalCents", "vatCents", "currency", "tags", "confidence", "ocrText"],
    additionalProperties: false,
  },
};
