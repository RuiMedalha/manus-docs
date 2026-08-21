import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { approveTocOnlineExport, getDocumentForTenant, getOrCreateTenantContext, getTocOnlineExportForTenant, listTocOnlineExportsForTenant, prepareTocOnlineExport, recordAudit } from "../db";
import { canPerform } from "../security";
import { protectedProcedure, router } from "../_core/trpc";

function assertDocumentWrite(role: Parameters<typeof canPerform>[0]) {
  if (!canPerform(role, "documents:write")) throw new TRPCError({ code: "FORBIDDEN", message: "O seu papel não permite preparar documentos para TOConline." });
}

function assertProfessionalApproval(role: Parameters<typeof canPerform>[0]) {
  if (role !== "admin" && role !== "contabilidade") throw new TRPCError({ code: "FORBIDDEN", message: "A aprovação TOConline exige um administrador ou utilizador de contabilidade." });
}

export const tocOnlineRouter = router({
  list: protectedProcedure.input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }).optional()).query(async ({ ctx, input }) => {
    const tenant = await getOrCreateTenantContext(ctx.user);
    assertDocumentWrite(tenant.membership.role);
    const exports = await listTocOnlineExportsForTenant(tenant.tenant.id);
    const month = input?.month;
    return month ? exports.filter(item => item.document.documentDate?.startsWith(month)) : exports;
  }),
  prepare: protectedProcedure.input(z.object({ documentId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const tenant = await getOrCreateTenantContext(ctx.user);
    assertDocumentWrite(tenant.membership.role);
    const document = await getDocumentForTenant(tenant.tenant.id, input.documentId);
    if (!document) throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado." });
    if (document.documentType !== "fatura_recebida" || document.status === "novo" || !document.entityName || !document.documentNumber || !document.documentDate || document.totalCents === null) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A fatura deve estar revista, com fornecedor, número, data e total antes de ser preparada para TOConline." });
    }
    const exportReference = `DOCU-${tenant.tenant.id}-${document.id}-${randomUUID().slice(0, 8)}`;
    const payloadSnapshot = { documentId: document.id, externalReference: exportReference, supplier: { name: document.entityName, nif: document.nif }, invoice: { number: document.documentNumber, date: document.documentDate, dueDate: document.dueDate, totalCents: document.totalCents, vatCents: document.vatCents, currency: document.currency }, paymentLifecycle: document.paymentLifecycle, finalFolder: document.finalFolder };
    const exportRecord = await prepareTocOnlineExport({ tenantId: tenant.tenant.id, documentId: document.id, preparedByUserId: ctx.user.id, exportReference, payloadSnapshot });
    await recordAudit({ tenantId: tenant.tenant.id, actorUserId: ctx.user.id, action: "toconline.prepared", resourceType: "tocOnlineExport", resourceId: String(exportRecord.id), metadata: { documentId: document.id, exportReference } });
    return exportRecord;
  }),
  approve: protectedProcedure.input(z.object({ documentId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const tenant = await getOrCreateTenantContext(ctx.user);
    assertProfessionalApproval(tenant.membership.role);
    const current = await getTocOnlineExportForTenant(tenant.tenant.id, input.documentId);
    if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "A fatura ainda não foi preparada para TOConline." });
    if (current.status !== "pronto_para_revisao") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A exportação já foi aprovada, enviada ou requer nova preparação." });
    const exportRecord = await approveTocOnlineExport(tenant.tenant.id, input.documentId, ctx.user.id);
    if (!exportRecord || exportRecord.status !== "aprovado_para_envio") throw new TRPCError({ code: "CONFLICT", message: "Não foi possível confirmar a aprovação TOConline." });
    await recordAudit({ tenantId: tenant.tenant.id, actorUserId: ctx.user.id, action: "toconline.approved_for_sending", resourceType: "tocOnlineExport", resourceId: String(exportRecord.id), metadata: { documentId: input.documentId, exportReference: exportRecord.exportReference } });
    return exportRecord;
  }),
});
