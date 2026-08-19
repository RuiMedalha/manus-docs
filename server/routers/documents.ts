import { TRPCError } from "@trpc/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  createDocument,
  createFinancialRecordFromDocument,
  createOrUpdatePaymentFromDocument,
  enqueueDocumentProcessingJob,
  findDocumentDuplicates,
  getDocumentForTenant,
  getOrCreateTenantContext,
  listDocumentsForTenant,
  listFolderRulesForTenant,
  moveDocumentToFolder,
  recordAudit,
  updateDocumentForTenant,
} from "../db";
import { applyFolderTemplate, ruleMatchesDocument } from "../document-rules";
import { isValidLogicalFolderPath } from "../operational-rules";
import { canPerform } from "../security";
import { validateDocumentUpload } from "../upload-policy";
import { protectedProcedure, router } from "../_core/trpc";
import { storageGetSignedUrl, storagePut } from "../storage";
import { getAuthorizedDocumentUrl } from "../document-file-access";

const documentType = z.enum(["fatura_recebida", "fatura_emitida", "recibo", "comprovativo", "encomenda", "outro"]);
const documentStatus = z.enum(["novo", "processado", "em_revisao", "arquivado"]);
function requireDocumentWrite(role: Parameters<typeof canPerform>[0]) {
  if (!canPerform(role, "documents:write")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "O seu papel não permite gerir documentos." });
  }
}

export const documentsRouter = router({
  list: protectedProcedure
    .input(z.object({ status: documentStatus.optional(), query: z.string().max(120).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const tenantContext = await getOrCreateTenantContext(ctx.user);
      return listDocumentsForTenant(tenantContext.tenant.id, input);
    }),
  get: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const tenantContext = await getOrCreateTenantContext(ctx.user);
    const document = await getDocumentForTenant(tenantContext.tenant.id, input.id);
    if (!document) throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado." });
    const fileUrl = await getAuthorizedDocumentUrl(document.fileKey, storageGetSignedUrl);
    return { ...document, fileUrl };
  }),
  upload: protectedProcedure
    .input(
      z.object({
        filename: z.string().min(1).max(255),
        contentType: z.string().max(120),
        base64: z.string().min(1),
        documentType: documentType.default("outro"),
        entityName: z.string().max(255).optional(),
        nif: z.string().max(32).optional(),
        documentNumber: z.string().max(100).optional(),
        documentDate: z.string().date().optional(),
        dueDate: z.string().date().optional(),
        totalCents: z.number().int().min(0).optional(),
        vatCents: z.number().int().min(0).optional(),
        currency: z.string().length(3).default("EUR"),
        tags: z.array(z.string().min(1).max(32)).max(12).default([]),
        sourceAddress: z.string().email().max(320).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantContext = await getOrCreateTenantContext(ctx.user);
      requireDocumentWrite(tenantContext.membership.role);
      const bytes = Buffer.from(input.base64, "base64");
      const uploadError = validateDocumentUpload(input.contentType, bytes.length);
      if (uploadError) throw new TRPCError({ code: bytes.length > 10 * 1024 * 1024 ? "PAYLOAD_TOO_LARGE" : "BAD_REQUEST", message: uploadError });
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const duplicates = await findDocumentDuplicates(tenantContext.tenant.id, {
        sha256,
        documentNumber: input.documentNumber,
        totalCents: input.totalCents,
        documentDate: input.documentDate,
      });
      if (duplicates.length) {
        const hasExactDuplicate = duplicates.some(item => item.duplicateType === "hash");
        throw new TRPCError({ code: "CONFLICT", message: hasExactDuplicate ? "Já existe um documento com o mesmo ficheiro nesta organização." : "Já existe um documento com o mesmo número, valor e data nesta organização." });
      }
      const rules = await listFolderRulesForTenant(tenantContext.tenant.id);
      const ruleDocument = { ...input, filename: input.filename };
      const matchingRule = rules.find(rule => ruleMatchesDocument(rule, ruleDocument));
      const suggestedFolder = applyFolderTemplate(
        matchingRule?.folderTemplate ?? tenantContext.tenant.folderPattern,
        ruleDocument,
      );
      const safeName = input.filename.replace(/[^a-zA-Z0-9._-]+/g, "-");
      const stored = await storagePut(`tenant-${tenantContext.tenant.id}/documents/${safeName}`, bytes, input.contentType);
      const document = await createDocument({
        tenantId: tenantContext.tenant.id,
        uploadedByUserId: ctx.user.id,
        fileKey: stored.key,
        originalFilename: input.filename,
        contentType: input.contentType,
        sizeBytes: bytes.length,
        sha256,
        origin: "upload",
        sourceAddress: input.sourceAddress ?? null,
        documentType: input.documentType,
        entityName: input.entityName ?? null,
        nif: input.nif ?? null,
        documentNumber: input.documentNumber ?? null,
        documentDate: input.documentDate ?? null,
        dueDate: input.dueDate ?? null,
        totalCents: input.totalCents ?? null,
        vatCents: input.vatCents ?? null,
        currency: input.currency.toUpperCase(),
        tags: input.tags,
        suggestedFolder,
        finalFolder: suggestedFolder,
      });
      await createFinancialRecordFromDocument({ tenantId: tenantContext.tenant.id, documentId: document.id, documentType: document.documentType, documentNumber: document.documentNumber, entityName: document.entityName, documentDate: document.documentDate, totalCents: document.totalCents, currency: document.currency });
      await createOrUpdatePaymentFromDocument({ tenantId: tenantContext.tenant.id, documentId: document.id, createdByUserId: ctx.user.id, documentType: document.documentType, entityName: document.entityName, dueDate: document.dueDate, totalCents: document.totalCents, currency: document.currency });
      const ocrJob = await enqueueDocumentProcessingJob({ tenantId: tenantContext.tenant.id, documentId: document.id, requestedByUserId: ctx.user.id, trigger: "upload" });
      await recordAudit({
        tenantId: tenantContext.tenant.id,
        actorUserId: ctx.user.id,
        action: "document.uploaded",
        resourceType: "document",
        resourceId: String(document.id),
        metadata: { filename: input.filename, suggestedFolder, ocrJobId: ocrJob?.id ?? null },
      });
      if (ocrJob) await recordAudit({ tenantId: tenantContext.tenant.id, actorUserId: ctx.user.id, action: "ocr.queued", resourceType: "documentProcessingJob", resourceId: String(ocrJob.id), metadata: { documentId: document.id, trigger: "upload" } });
      return { document, fileUrl: stored.url };
    }),
  updateMetadata: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        documentType: documentType,
        status: documentStatus,
        entityName: z.string().max(255).nullable(),
        nif: z.string().max(32).nullable(),
        documentNumber: z.string().max(100).nullable(),
        documentDate: z.string().date().nullable(),
        dueDate: z.string().date().nullable(),
        totalCents: z.number().int().min(0).nullable(),
        vatCents: z.number().int().min(0).nullable(),
        tags: z.array(z.string().min(1).max(32)).max(12),
        finalFolder: z.string().max(512).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantContext = await getOrCreateTenantContext(ctx.user);
      requireDocumentWrite(tenantContext.membership.role);
      const updated = await updateDocumentForTenant(tenantContext.tenant.id, input.id, input);
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado." });
      await createOrUpdatePaymentFromDocument({ tenantId: tenantContext.tenant.id, documentId: updated.id, createdByUserId: ctx.user.id, documentType: updated.documentType, entityName: updated.entityName, dueDate: updated.dueDate, totalCents: updated.totalCents, currency: updated.currency });
      await recordAudit({
        tenantId: tenantContext.tenant.id,
        actorUserId: ctx.user.id,
        action: input.status === "processado" ? "document.approved" : "document.metadata_updated",
        resourceType: "document",
        resourceId: String(input.id),
      });
      return updated;
    }),
  moveFolder: protectedProcedure.input(z.object({ id: z.number().int().positive(), finalFolder: z.string().min(2).max(512).refine(isValidLogicalFolderPath, "Indique uma pasta absoluta e segura, sem segmentos vazios ou relativos.") })).mutation(async ({ ctx, input }) => {
    const tenantContext = await getOrCreateTenantContext(ctx.user);
    requireDocumentWrite(tenantContext.membership.role);
    const moved = await moveDocumentToFolder(tenantContext.tenant.id, input.id, input.finalFolder);
    if (!moved) throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado." });
    await recordAudit({ tenantId: tenantContext.tenant.id, actorUserId: ctx.user.id, action: "document.folder_moved", resourceType: "document", resourceId: String(input.id), metadata: { finalFolder: input.finalFolder } });
    return moved;
  }),
});
