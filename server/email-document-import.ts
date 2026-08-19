import { createHash } from "node:crypto";
import { createDocument, createFinancialRecordFromDocument, createOrUpdatePaymentFromDocument, enqueueDocumentProcessingJob, findDocumentDuplicates, listFolderRulesForTenant, recordAudit } from "./db";
import { applyFolderTemplate, ruleMatchesDocument } from "./document-rules";
import { validateDocumentUpload } from "./upload-policy";
import { storagePut } from "./storage";

export async function importEmailAttachmentToInbox(input: { tenant: { id: number; folderPattern: string }; userId: number; filename: string; contentType: string; bytes: Buffer; sourceAddress: string | null; sourceSubject: string; sourceKind?: "attachment" | "link"; sourceLinkHost?: string | null; }) {
  const error = validateDocumentUpload(input.contentType, input.bytes.length);
  if (error) throw new Error(error);
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const duplicates = await findDocumentDuplicates(input.tenant.id, { sha256 });
  if (duplicates.some(item => item.duplicateType === "hash")) return { status: "duplicate" as const, sha256 };
  const rules = await listFolderRulesForTenant(input.tenant.id);
  const ruleDocument = { filename: input.filename, contentType: input.contentType, documentType: "outro", entityName: null, nif: null, documentNumber: null, documentDate: null, dueDate: null, totalCents: null, vatCents: null, currency: "EUR", tags: [] as string[], sourceAddress: input.sourceAddress ?? undefined };
  const matchingRule = rules.find(rule => ruleMatchesDocument(rule, ruleDocument));
  const suggestedFolder = applyFolderTemplate(matchingRule?.folderTemplate ?? input.tenant.folderPattern, ruleDocument);
  const safeName = input.filename.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const stored = await storagePut(`tenant-${input.tenant.id}/documents/email/${sha256.slice(0, 12)}-${safeName}`, input.bytes, input.contentType);
  const sourceKind = input.sourceKind ?? "attachment";
  const document = await createDocument({ tenantId: input.tenant.id, uploadedByUserId: input.userId, fileKey: stored.key, originalFilename: input.filename, contentType: input.contentType, sizeBytes: input.bytes.length, sha256, origin: "email", sourceAddress: input.sourceAddress, documentType: "outro", entityName: null, nif: null, documentNumber: null, documentDate: null, dueDate: null, totalCents: null, vatCents: null, currency: "EUR", tags: sourceKind === "link" ? ["outlook", "email-link", input.sourceLinkHost ?? "fornecedor"] : ["outlook"], suggestedFolder, finalFolder: suggestedFolder });
  await createFinancialRecordFromDocument({ tenantId: input.tenant.id, documentId: document.id, documentType: document.documentType, documentNumber: document.documentNumber, entityName: document.entityName, documentDate: document.documentDate, totalCents: document.totalCents, currency: document.currency });
  await createOrUpdatePaymentFromDocument({ tenantId: input.tenant.id, documentId: document.id, createdByUserId: input.userId, documentType: document.documentType, entityName: document.entityName, dueDate: document.dueDate, totalCents: document.totalCents, currency: document.currency });
  const ocrJob = await enqueueDocumentProcessingJob({ tenantId: input.tenant.id, documentId: document.id, requestedByUserId: input.userId, trigger: "upload" });
  await recordAudit({ tenantId: input.tenant.id, actorUserId: input.userId, action: sourceKind === "link" ? "outlook.supplier_link_imported" : "outlook.attachment_imported", resourceType: "document", resourceId: String(document.id), metadata: { filename: input.filename, sourceAddress: input.sourceAddress, sourceSubject: input.sourceSubject, sourceLinkHost: input.sourceLinkHost ?? null, suggestedFolder, ocrJobId: ocrJob?.id ?? null } });
  return { status: "imported" as const, document, sha256 };
}
