import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createHeartbeatJob, deleteHeartbeatJob } from "../_core/heartbeat";
import { protectedProcedure, router } from "../_core/trpc";
import { canPerform } from "../security";
import { createFinancialRecordFromDocument, createOrUpdatePaymentFromDocument, enqueueDocumentProcessingJob, findOrCreateBusinessEntity, getDocumentForTenant, getDocumentProcessingJobForTenant, getOcrProcessingConfigForTenant, getOrCreateTenantContext, listDocumentProcessingJobsForTenant, listDocumentsForTenant, recordAudit, updateDocumentForTenant, updateOcrProcessingConfig } from "../db";
import { parseOcrSuggestion } from "../ocr-classification";
import { selectDocumentsWithoutOcrJob } from "../ocr-queue";
import { resolveEntityRole } from "../financial-workflow";
import { isValidLogicalFolderPath } from "../operational-rules";
import { processOcrBatch, processOcrDocument } from "../ocr-processor";

function requireDocumentWrite(role: Parameters<typeof canPerform>[0]) {
  if (!canPerform(role, "documents:write")) throw new TRPCError({ code: "FORBIDDEN", message: "O seu papel não permite processar documentos." });
}

function requireSettings(role: Parameters<typeof canPerform>[0]) {
  if (!canPerform(role, "settings:manage")) throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem configurar o processamento automático." });
}

export const ocrRouter = router({
  config: protectedProcedure.query(async ({ ctx }) => {
    const tenantContext = await getOrCreateTenantContext(ctx.user);
    return getOcrProcessingConfigForTenant(tenantContext.tenant.id);
  }),
  jobs: protectedProcedure.query(async ({ ctx }) => {
    const tenantContext = await getOrCreateTenantContext(ctx.user);
    return listDocumentProcessingJobsForTenant(tenantContext.tenant.id);
  }),
  queue: protectedProcedure.input(z.object({ documentIds: z.array(z.number().int().positive()).min(1).max(20) })).mutation(async ({ ctx, input }) => {
    const tenantContext = await getOrCreateTenantContext(ctx.user);
    requireDocumentWrite(tenantContext.membership.role);
    const jobs = [];
    for (const documentId of input.documentIds) {
      const job = await enqueueDocumentProcessingJob({ tenantId: tenantContext.tenant.id, documentId, requestedByUserId: ctx.user.id, trigger: "manual" });
      if (job) jobs.push(job);
    }
    await recordAudit({ tenantId: tenantContext.tenant.id, actorUserId: ctx.user.id, action: "ocr.queued", resourceType: "documentProcessingJob", metadata: { documentIds: input.documentIds, count: jobs.length, trigger: "manual" } });
    return { jobs };
  }),
  processNow: protectedProcedure.input(z.object({ batchSize: z.number().int().min(1).max(5).default(2) })).mutation(async ({ ctx, input }) => {
    const tenantContext = await getOrCreateTenantContext(ctx.user);
    requireDocumentWrite(tenantContext.membership.role);
    const [documents, jobs] = await Promise.all([
      listDocumentsForTenant(tenantContext.tenant.id, { status: "novo" }),
      listDocumentProcessingJobsForTenant(tenantContext.tenant.id),
    ]);
    const documentsToQueue = selectDocumentsWithoutOcrJob(documents, jobs, input.batchSize);
    for (const document of documentsToQueue) {
      await enqueueDocumentProcessingJob({ tenantId: tenantContext.tenant.id, documentId: document.id, requestedByUserId: ctx.user.id, trigger: "manual" });
    }
    const results = await processOcrBatch(tenantContext.tenant.id, input.batchSize);
    return { results, queuedDocumentCount: documentsToQueue.length };
  }),
  processDocument: protectedProcedure.input(z.object({ documentId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const tenantContext = await getOrCreateTenantContext(ctx.user);
    requireDocumentWrite(tenantContext.membership.role);
    const document = await getDocumentForTenant(tenantContext.tenant.id, input.documentId);
    if (!document) throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado." });
    await enqueueDocumentProcessingJob({ tenantId: tenantContext.tenant.id, documentId: document.id, requestedByUserId: ctx.user.id, trigger: "manual" });
    const result = await processOcrDocument(tenantContext.tenant.id, document.id);
    if (result.status === "empty") throw new TRPCError({ code: "CONFLICT", message: "O documento já está a ser analisado ou não existe uma análise pendente." });
    return result;
  }),
  applySuggestion: protectedProcedure.input(z.object({ jobId: z.number().int().positive(), finalFolder: z.string().min(2).max(512).refine(isValidLogicalFolderPath, "Indique uma pasta absoluta e segura, sem segmentos vazios ou relativos.").optional() })).mutation(async ({ ctx, input }) => {
    const tenantContext = await getOrCreateTenantContext(ctx.user);
    requireDocumentWrite(tenantContext.membership.role);
    const job = await getDocumentProcessingJobForTenant(tenantContext.tenant.id, input.jobId);
    if (!job || job.status !== "concluido" || !job.suggestion) throw new TRPCError({ code: "NOT_FOUND", message: "Não existe uma sugestão OCR concluída para aplicar." });
    const document = await getDocumentForTenant(tenantContext.tenant.id, job.documentId);
    if (!document) throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado." });
    const suggestion = parseOcrSuggestion(job.suggestion);
    const inferredRole = resolveEntityRole(suggestion.documentType, suggestion.entityRole);
    const entity = suggestion.entityName ? await findOrCreateBusinessEntity({ tenantId: tenantContext.tenant.id, createdByUserId: ctx.user.id, entityType: inferredRole, name: suggestion.entityName, nif: suggestion.nif, status: "proposto" }) : undefined;
    const finalFolder = input.finalFolder ?? suggestion.archiveFolder;
    const updated = await updateDocumentForTenant(tenantContext.tenant.id, document.id, { documentType: suggestion.documentType, status: "em_revisao", entityName: suggestion.entityName, entityId: entity?.id ?? null, nif: suggestion.nif, documentNumber: suggestion.documentNumber, documentDate: suggestion.documentDate, dueDate: suggestion.dueDate, totalCents: suggestion.totalCents, vatCents: suggestion.vatCents, tags: suggestion.tags, finalFolder });
    if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível aplicar a sugestão." });
    await createFinancialRecordFromDocument({ tenantId: tenantContext.tenant.id, documentId: updated.id, documentType: updated.documentType, documentNumber: updated.documentNumber, entityName: updated.entityName, documentDate: updated.documentDate, totalCents: updated.totalCents, currency: suggestion.currency });
    const payment = await createOrUpdatePaymentFromDocument({ tenantId: tenantContext.tenant.id, documentId: updated.id, createdByUserId: ctx.user.id, documentType: updated.documentType, entityId: entity?.id, entityName: updated.entityName, dueDate: updated.dueDate, totalCents: updated.totalCents, currency: suggestion.currency, source: "ocr" });
    await recordAudit({ tenantId: tenantContext.tenant.id, actorUserId: ctx.user.id, action: "ocr.suggestion_applied", resourceType: "documentProcessingJob", resourceId: String(job.id), metadata: { documentId: document.id, entityId: entity?.id, paymentProposalId: payment?.id, confidence: job.confidence, accountingNature: suggestion.accountingNature, archiveArea: suggestion.archiveArea, finalFolder } });
    return { document: updated, entity, paymentProposal: payment };
  }),
  enableAutomatic: protectedProcedure.mutation(async ({ ctx }) => {
    if (process.env.NODE_ENV !== "production") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Publique esta versão antes de ativar o processamento automático." });
    const tenantContext = await getOrCreateTenantContext(ctx.user);
    requireSettings(tenantContext.membership.role);
    const config = await getOcrProcessingConfigForTenant(tenantContext.tenant.id);
    if (config.scheduleCronTaskUid) return updateOcrProcessingConfig(tenantContext.tenant.id, { automaticEnabled: true });
    const job = await createHeartbeatJob({ name: `ocr-${tenantContext.tenant.id}`, cron: "0 */1 * * * *", path: "/api/scheduled/process-ocr", description: `Processamento automático de OCR para ${tenantContext.tenant.name}` }, "");
    const updated = await updateOcrProcessingConfig(tenantContext.tenant.id, { automaticEnabled: true, scheduleCronTaskUid: job.taskUid });
    await recordAudit({ tenantId: tenantContext.tenant.id, actorUserId: ctx.user.id, action: "ocr.automatic_enabled", resourceType: "ocrProcessingConfig", resourceId: String(updated.id) });
    return updated;
  }),
  disableAutomatic: protectedProcedure.mutation(async ({ ctx }) => {
    const tenantContext = await getOrCreateTenantContext(ctx.user);
    requireSettings(tenantContext.membership.role);
    const config = await getOcrProcessingConfigForTenant(tenantContext.tenant.id);
    if (config.scheduleCronTaskUid && process.env.NODE_ENV === "production") {
      await deleteHeartbeatJob(config.scheduleCronTaskUid, "");
    }
    const updated = await updateOcrProcessingConfig(tenantContext.tenant.id, { automaticEnabled: false, scheduleCronTaskUid: null });
    await recordAudit({ tenantId: tenantContext.tenant.id, actorUserId: ctx.user.id, action: "ocr.automatic_disabled", resourceType: "ocrProcessingConfig", resourceId: String(updated.id) });
    return updated;
  }),
});
