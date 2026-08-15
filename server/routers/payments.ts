import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { canPerform } from "../security";
import { createOrUpdatePaymentFromDocument, createPaymentSchedule, getOrCreateTenantContext, listDocumentsForTenant, listPaymentSchedulesForTenant, recordAudit, updatePaymentScheduleForTenant } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const paymentStatus = z.enum(["pendente", "pago", "cancelado"]);
function requirePaymentWrite(role: Parameters<typeof canPerform>[0]) { if (!canPerform(role, "documents:write")) throw new TRPCError({ code: "FORBIDDEN", message: "O seu papel não permite gerir pagamentos." }); }

export const paymentsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => { const tenant = await getOrCreateTenantContext(ctx.user); return listPaymentSchedulesForTenant(tenant.tenant.id); }),
  create: protectedProcedure.input(z.object({ counterparty: z.string().min(1).max(255), dueDate: z.string().date(), amountCents: z.number().int().positive(), currency: z.string().length(3).default("EUR"), notes: z.string().max(1000).optional() })).mutation(async ({ ctx, input }) => {
    const tenant = await getOrCreateTenantContext(ctx.user); requirePaymentWrite(tenant.membership.role);
    const payment = await createPaymentSchedule({ tenantId: tenant.tenant.id, createdByUserId: ctx.user.id, counterparty: input.counterparty, dueDate: input.dueDate, amountCents: input.amountCents, currency: input.currency.toUpperCase(), notes: input.notes ?? null });
    await recordAudit({ tenantId: tenant.tenant.id, actorUserId: ctx.user.id, action: "payment.created", resourceType: "paymentSchedule", resourceId: String(payment.id), metadata: { dueDate: payment.dueDate, amountCents: payment.amountCents } });
    return payment;
  }),
  updateStatus: protectedProcedure.input(z.object({ id: z.number().int().positive(), status: paymentStatus, paidAt: z.string().date().nullable().optional() })).mutation(async ({ ctx, input }) => {
    const tenant = await getOrCreateTenantContext(ctx.user); requirePaymentWrite(tenant.membership.role);
    const paidAt = input.status === "pago" ? (input.paidAt ?? new Date().toISOString().slice(0, 10)) : null;
    const payment = await updatePaymentScheduleForTenant(tenant.tenant.id, input.id, { status: input.status, paidAt });
    if (!payment) throw new TRPCError({ code: "NOT_FOUND", message: "Pagamento não encontrado." });
    await recordAudit({ tenantId: tenant.tenant.id, actorUserId: ctx.user.id, action: `payment.${input.status}`, resourceType: "paymentSchedule", resourceId: String(payment.id), metadata: { paidAt } });
    return payment;
  }),
  syncDocuments: protectedProcedure.mutation(async ({ ctx }) => {
    const tenant = await getOrCreateTenantContext(ctx.user); requirePaymentWrite(tenant.membership.role);
    const documents = await listDocumentsForTenant(tenant.tenant.id);
    let synced = 0;
    for (const document of documents) { const payment = await createOrUpdatePaymentFromDocument({ tenantId: tenant.tenant.id, documentId: document.id, createdByUserId: ctx.user.id, documentType: document.documentType, entityName: document.entityName, dueDate: document.dueDate, totalCents: document.totalCents, currency: document.currency }); if (payment) synced += 1; }
    await recordAudit({ tenantId: tenant.tenant.id, actorUserId: ctx.user.id, action: "payment.documents_synced", resourceType: "paymentSchedule", metadata: { synced } });
    return { synced };
  }),
});
