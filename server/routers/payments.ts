import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { canPerform } from "../security";
import { resolvePaymentSettlement } from "../operational-rules";
import { paymentApprovalReady } from "../financial-workflow";
import { createOrUpdatePaymentFromDocument, createPaymentSchedule, getOrCreateTenantContext, listDocumentsForTenant, listFinancialAccountsForTenant, listFinancialCategoriesForTenant, listPaymentSchedulesForTenant, recordAudit, updatePaymentScheduleForTenant } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const paymentStatus = z.enum(["pendente", "pago", "cancelado"]);
function requirePaymentWrite(role: Parameters<typeof canPerform>[0]) { if (!canPerform(role, "documents:write")) throw new TRPCError({ code: "FORBIDDEN", message: "O seu papel não permite gerir pagamentos." }); }

export const paymentsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => { const tenant = await getOrCreateTenantContext(ctx.user); return listPaymentSchedulesForTenant(tenant.tenant.id); }),
  create: protectedProcedure.input(z.object({ counterparty: z.string().min(1).max(255), entityId: z.number().int().positive().optional(), dueDate: z.string().date(), amountCents: z.number().int().positive(), currency: z.string().length(3).default("EUR"), notes: z.string().max(1000).optional() })).mutation(async ({ ctx, input }) => {
    const tenant = await getOrCreateTenantContext(ctx.user); requirePaymentWrite(tenant.membership.role);
    const payment = await createPaymentSchedule({ tenantId: tenant.tenant.id, createdByUserId: ctx.user.id, counterparty: input.counterparty, entityId: input.entityId ?? null, dueDate: input.dueDate, amountCents: input.amountCents, currency: input.currency.toUpperCase(), notes: input.notes ?? null, approvalStatus: "proposta", source: "manual" });
    await recordAudit({ tenantId: tenant.tenant.id, actorUserId: ctx.user.id, action: "payment.created", resourceType: "paymentSchedule", resourceId: String(payment.id), metadata: { dueDate: payment.dueDate, amountCents: payment.amountCents } });
    return payment;
  }),
  updateStatus: protectedProcedure.input(z.object({ id: z.number().int().positive(), status: paymentStatus, paidAt: z.string().date().nullable().optional() })).mutation(async ({ ctx, input }) => {
    const tenant = await getOrCreateTenantContext(ctx.user); requirePaymentWrite(tenant.membership.role);
    const existing = (await listPaymentSchedulesForTenant(tenant.tenant.id)).find(payment => payment.id === input.id);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Pagamento não encontrado." });
    if (input.status === "pago" && !paymentApprovalReady(existing)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A proposta deve ser aprovada e ter conta de débito antes da liquidação." });
    const paidAt = resolvePaymentSettlement(input.status, input.paidAt);
    const payment = await updatePaymentScheduleForTenant(tenant.tenant.id, input.id, { status: input.status, paidAt });
    if (!payment) throw new TRPCError({ code: "NOT_FOUND", message: "Pagamento não encontrado." });
    await recordAudit({ tenantId: tenant.tenant.id, actorUserId: ctx.user.id, action: `payment.${input.status}`, resourceType: "paymentSchedule", resourceId: String(payment.id), metadata: { paidAt } });
    return payment;
  }),
  approve: protectedProcedure.input(z.object({ id: z.number().int().positive(), debitAccountId: z.number().int().positive(), categoryId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const tenant = await getOrCreateTenantContext(ctx.user); requirePaymentWrite(tenant.membership.role);
    const [accounts, categories] = await Promise.all([listFinancialAccountsForTenant(tenant.tenant.id), listFinancialCategoriesForTenant(tenant.tenant.id)]);
    const account = accounts.find(item => item.id === input.debitAccountId && item.accountType === "banco" && item.isActive);
    const category = categories.find(item => item.id === input.categoryId && item.direction === "despesa" && item.isActive);
    if (!account || !category) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione uma conta bancária e uma categoria de despesa ativas." });
    const payment = await updatePaymentScheduleForTenant(tenant.tenant.id, input.id, { debitAccountId: account.id, categoryId: category.id, approvalStatus: "aprovada", approvedByUserId: ctx.user.id, approvedAt: new Date() });
    if (!payment) throw new TRPCError({ code: "NOT_FOUND", message: "Pagamento não encontrado." });
    await recordAudit({ tenantId: tenant.tenant.id, actorUserId: ctx.user.id, action: "payment.approved", resourceType: "paymentSchedule", resourceId: String(payment.id), metadata: { debitAccountId: account.id, categoryId: category.id } });
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
