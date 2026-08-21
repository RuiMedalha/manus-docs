import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { canPerform } from "../security";
import { resolvePaymentSettlement } from "../operational-rules";
import { paymentApprovalReady } from "../financial-workflow";
import { documentLifecycleAfterSettlement, paymentClosureAudit } from "../payment-closure";
import { resolveApprovalPolicy, roleMayApprove } from "../payment-approval-policy";
import { createOrUpdatePaymentFromDocument, createPaymentApprovalPolicy, createPaymentSchedule, deletePaymentApprovalPolicyForTenant, getOrCreateTenantContext, listDocumentsForTenant, listFinancialAccountsForTenant, listFinancialCategoriesForTenant, listPaymentApprovalPoliciesForTenant, listPaymentSchedulesForTenant, recordAudit, setDocumentPaymentLifecycleForTenant, updatePaymentApprovalPolicyForTenant, updatePaymentScheduleForTenant } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const paymentStatus = z.enum(["pendente", "pago", "cancelado"]);
function requirePaymentWrite(role: Parameters<typeof canPerform>[0]) { if (!canPerform(role, "documents:write")) throw new TRPCError({ code: "FORBIDDEN", message: "O seu papel não permite gerir pagamentos." }); }

export const paymentsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => { const tenant = await getOrCreateTenantContext(ctx.user); return listPaymentSchedulesForTenant(tenant.tenant.id); }),
  listPolicies: protectedProcedure.query(async ({ ctx }) => { const tenant = await getOrCreateTenantContext(ctx.user); return listPaymentApprovalPoliciesForTenant(tenant.tenant.id); }),
  createPolicy: protectedProcedure.input(z.object({ name: z.string().min(2).max(120), minAmountCents: z.number().int().min(0), categoryId: z.number().int().positive().nullable().optional(), requiredRole: z.enum(["admin", "contabilidade", "operador", "aprovador"]) })).mutation(async ({ ctx, input }) => {
    const tenant = await getOrCreateTenantContext(ctx.user);
    if (tenant.membership.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem criar políticas de aprovação." });
    const policy = await createPaymentApprovalPolicy({ tenantId: tenant.tenant.id, createdByUserId: ctx.user.id, name: input.name, minAmountCents: input.minAmountCents, categoryId: input.categoryId ?? null, requiredRole: input.requiredRole });
    await recordAudit({ tenantId: tenant.tenant.id, actorUserId: ctx.user.id, action: "payment.policy_created", resourceType: "paymentApprovalPolicy", resourceId: String(policy.id) });
    return policy;
  }),
  updatePolicy: protectedProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().min(2).max(120).optional(), minAmountCents: z.number().int().min(0).optional(), categoryId: z.number().int().positive().nullable().optional(), requiredRole: z.enum(["admin", "contabilidade", "operador", "aprovador"]).optional(), enabled: z.boolean().optional() })).mutation(async ({ ctx, input }) => {
    const tenant = await getOrCreateTenantContext(ctx.user);
    if (tenant.membership.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem alterar políticas de aprovação." });
    const { id, ...changes } = input;
    const policy = await updatePaymentApprovalPolicyForTenant(tenant.tenant.id, id, changes);
    if (!policy) throw new TRPCError({ code: "NOT_FOUND", message: "Política não encontrada." });
    await recordAudit({ tenantId: tenant.tenant.id, actorUserId: ctx.user.id, action: "payment.policy_updated", resourceType: "paymentApprovalPolicy", resourceId: String(policy.id), metadata: changes });
    return policy;
  }),
  deletePolicy: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const tenant = await getOrCreateTenantContext(ctx.user);
    if (tenant.membership.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem remover políticas de aprovação." });
    const exists = (await listPaymentApprovalPoliciesForTenant(tenant.tenant.id)).some(policy => policy.id === input.id);
    if (!exists) throw new TRPCError({ code: "NOT_FOUND", message: "Política não encontrada." });
    await deletePaymentApprovalPolicyForTenant(tenant.tenant.id, input.id);
    await recordAudit({ tenantId: tenant.tenant.id, actorUserId: ctx.user.id, action: "payment.policy_deleted", resourceType: "paymentApprovalPolicy", resourceId: String(input.id) });
    return { success: true };
  }),
  create: protectedProcedure.input(z.object({ counterparty: z.string().min(1).max(255), entityId: z.number().int().positive().optional(), dueDate: z.string().date(), amountCents: z.number().int().positive(), currency: z.string().length(3).default("EUR"), paymentMethod: z.enum(["manual", "transferencia", "cartao", "debito_direto"]).default("manual"), notes: z.string().max(1000).optional() })).mutation(async ({ ctx, input }) => {
    const tenant = await getOrCreateTenantContext(ctx.user); requirePaymentWrite(tenant.membership.role);
    const payment = await createPaymentSchedule({ tenantId: tenant.tenant.id, createdByUserId: ctx.user.id, counterparty: input.counterparty, entityId: input.entityId ?? null, dueDate: input.dueDate, amountCents: input.amountCents, currency: input.currency.toUpperCase(), paymentMethod: input.paymentMethod, notes: input.notes ?? null, approvalStatus: "proposta", source: "manual" });
    await recordAudit({ tenantId: tenant.tenant.id, actorUserId: ctx.user.id, action: "payment.created", resourceType: "paymentSchedule", resourceId: String(payment.id), metadata: { dueDate: payment.dueDate, amountCents: payment.amountCents } });
    return payment;
  }),
  updateStatus: protectedProcedure.input(z.object({ id: z.number().int().positive(), status: paymentStatus, paidAt: z.string().date().nullable().optional() })).mutation(async ({ ctx, input }) => {
    const tenant = await getOrCreateTenantContext(ctx.user); requirePaymentWrite(tenant.membership.role);
    const existing = (await listPaymentSchedulesForTenant(tenant.tenant.id)).find(payment => payment.id === input.id);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Pagamento não encontrado." });
    if (input.status === "pago" && !paymentApprovalReady(existing)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A proposta deve ser aprovada e ter conta de débito antes da liquidação." });
    const paidAt = resolvePaymentSettlement(input.status, input.paidAt);
    const payment = await updatePaymentScheduleForTenant(tenant.tenant.id, input.id, { status: input.status, paidAt, settlementSource: input.status === "pago" ? "manual" : null, bankTransactionId: input.status === "pago" ? existing.bankTransactionId : null });
    if (!payment) throw new TRPCError({ code: "NOT_FOUND", message: "Pagamento não encontrado." });
    if (payment.documentId && input.status === "pago") await setDocumentPaymentLifecycleForTenant(tenant.tenant.id, payment.documentId, documentLifecycleAfterSettlement("manual"));
    const closureAudit = input.status === "pago" ? paymentClosureAudit(existing.paymentMethod, "manual", payment.documentId ?? null, paidAt) : { action: `payment.${input.status}`, metadata: { paidAt } };
    await recordAudit({ tenantId: tenant.tenant.id, actorUserId: ctx.user.id, action: closureAudit.action, resourceType: "paymentSchedule", resourceId: String(payment.id), metadata: closureAudit.metadata });
    return payment;
  }),
  approve: protectedProcedure.input(z.object({ id: z.number().int().positive(), debitAccountId: z.number().int().positive(), categoryId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const tenant = await getOrCreateTenantContext(ctx.user);
    const [accounts, categories] = await Promise.all([listFinancialAccountsForTenant(tenant.tenant.id), listFinancialCategoriesForTenant(tenant.tenant.id)]);
    const account = accounts.find(item => item.id === input.debitAccountId && item.accountType === "banco" && item.isActive);
    const category = categories.find(item => item.id === input.categoryId && item.direction === "despesa" && item.isActive);
    if (!account || !category) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione uma conta bancária e uma categoria de despesa ativas." });
    const existing = (await listPaymentSchedulesForTenant(tenant.tenant.id)).find(item => item.id === input.id);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Pagamento não encontrado." });
    const policy = resolveApprovalPolicy(await listPaymentApprovalPoliciesForTenant(tenant.tenant.id), { amountCents: existing.amountCents, categoryId: category.id });
    if (policy && !roleMayApprove(tenant.membership.role, policy.requiredRole)) throw new TRPCError({ code: "FORBIDDEN", message: `Esta aprovação exige o papel ${policy.requiredRole}.` });
    const payment = await updatePaymentScheduleForTenant(tenant.tenant.id, input.id, { debitAccountId: account.id, categoryId: category.id, approvalStatus: "aprovada", approvedByUserId: ctx.user.id, approvedAt: new Date() });
    if (!payment) throw new TRPCError({ code: "NOT_FOUND", message: "Pagamento não encontrado." });
    await recordAudit({ tenantId: tenant.tenant.id, actorUserId: ctx.user.id, action: "payment.approved", resourceType: "paymentSchedule", resourceId: String(payment.id), metadata: { debitAccountId: account.id, categoryId: category.id, policyId: policy?.id ?? null } });
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
