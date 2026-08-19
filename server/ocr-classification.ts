import { z } from "zod";

export const documentTypeValues = ["fatura_recebida", "fatura_emitida", "recibo", "comprovativo", "encomenda", "outro"] as const;
export const accountingNatureValues = ["despesa", "receita", "imposto", "tesouraria", "suporte_operacional", "sem_relevancia_contabilistica", "requer_revisao"] as const;
export const archiveAreaValues = ["contabilidade_compras", "contabilidade_vendas", "contabilidade_tesouraria", "contabilidade_fiscal", "operacoes_logistica", "operacoes_comercial", "operacoes_administracao", "a_rever"] as const;

function cleanSegment(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() || "Sem entidade";
}

export function buildSuggestedArchiveFolder(input: { archiveArea: typeof archiveAreaValues[number]; documentDate: string | null; entityName: string | null }) {
  const date = input.documentDate ? new Date(`${input.documentDate}T12:00:00`) : new Date();
  const roots: Record<typeof archiveAreaValues[number], string> = {
    contabilidade_compras: "Contabilidade/Compras",
    contabilidade_vendas: "Contabilidade/Vendas",
    contabilidade_tesouraria: "Contabilidade/Tesouraria",
    contabilidade_fiscal: "Contabilidade/Fiscal",
    operacoes_logistica: "Operacoes/Logistica",
    operacoes_comercial: "Operacoes/Comercial",
    operacoes_administracao: "Operacoes/Administracao",
    a_rever: "A rever",
  };
  return `/${roots[input.archiveArea]}/${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${cleanSegment(input.entityName ?? "Sem entidade")}`;
}

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
  accountingNature: z.enum(accountingNatureValues).default("requer_revisao"),
  accountingSummary: z.string().min(1).max(600).default("Classificação contabilística pendente de revisão."),
  archiveArea: z.enum(archiveAreaValues).default("a_rever"),
  archiveReason: z.string().min(1).max(300).default("Rever a classificação e confirmar a pasta antes de arquivar."),
  requiresAccountingReview: z.boolean().default(true),
  confidence: z.number().int().min(0).max(100),
  ocrText: z.string().max(12_000),
});

export type OcrSuggestion = z.infer<typeof ocrSuggestionSchema> & { archiveFolder: string };

export function parseOcrSuggestion(payload: unknown): OcrSuggestion {
  const suggestion = ocrSuggestionSchema.parse(payload);
  return { ...suggestion, archiveFolder: buildSuggestedArchiveFolder(suggestion) };
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
      accountingNature: { type: "string", enum: accountingNatureValues },
      accountingSummary: { type: "string" },
      archiveArea: { type: "string", enum: archiveAreaValues },
      archiveReason: { type: "string" },
      requiresAccountingReview: { type: "boolean" },
      confidence: { type: "integer" },
      ocrText: { type: "string" },
    },
    required: ["documentType", "entityRole", "entityName", "nif", "documentNumber", "documentDate", "dueDate", "totalCents", "vatCents", "currency", "tags", "accountingNature", "accountingSummary", "archiveArea", "archiveReason", "requiresAccountingReview", "confidence", "ocrText"],
    additionalProperties: false,
  },
};
