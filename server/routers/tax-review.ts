import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { confirmTaxReviewProposal, getDocumentForTenant, getOrCreateTenantContext, getTaxReviewProposalForTenant, listTaxReviewProposalsForTenant, recordAudit, saveTaxReviewProposal } from "../db";
import { canPerform } from "../security";
import { buildTaxProposal } from "../tax-proposal-rules";
import { protectedProcedure, router } from "../_core/trpc";

function assertDocumentWrite(role: Parameters<typeof canPerform>[0]) {
  if (!canPerform(role, "documents:write")) throw new TRPCError({ code: "FORBIDDEN", message: "O seu papel não permite preparar propostas fiscais." });
}

function assertTaxReviewer(role: Parameters<typeof canPerform>[0]) {
  if (role !== "admin" && role !== "contabilidade") throw new TRPCError({ code: "FORBIDDEN", message: "A confirmação de IVA exige um administrador ou utilizador de contabilidade." });
}

export const taxReviewRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const tenant = await getOrCreateTenantContext(ctx.user);
    assertDocumentWrite(tenant.membership.role);
    return listTaxReviewProposalsForTenant(tenant.tenant.id);
  }),
  propose: protectedProcedure.input(z.object({ documentId: z.number().int().positive(), taxCategory: z.enum(["alimentacao", "combustivel", "utilidades", "outro"]) })).mutation(async ({ ctx, input }) => {
    const tenant = await getOrCreateTenantContext(ctx.user);
    assertDocumentWrite(tenant.membership.role);
    const document = await getDocumentForTenant(tenant.tenant.id, input.documentId);
    if (!document) throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado." });
    if (document.documentType !== "fatura_recebida" || document.status === "novo" || document.vatCents === null) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A fatura deve estar revista e ter IVA identificado antes de receber uma proposta fiscal." });
    const rule = buildTaxProposal(input.taxCategory, document.vatCents);
    const proposal = await saveTaxReviewProposal({ tenantId: tenant.tenant.id, documentId: document.id, taxCategory: input.taxCategory, vatOriginalCents: document.vatCents, preparedByUserId: ctx.user.id, ...rule });
    await recordAudit({ tenantId: tenant.tenant.id, actorUserId: ctx.user.id, action: "tax_review.proposed", resourceType: "taxReviewProposal", resourceId: String(proposal.id), metadata: { documentId: document.id, taxCategory: input.taxCategory, ruleCode: rule.ruleCode, ruleVersion: rule.ruleVersion } });
    return proposal;
  }),
  confirm: protectedProcedure.input(z.object({ documentId: z.number().int().positive(), reviewStatus: z.enum(["confirmado_contabilista", "excecao", "rejeitado"]), vatDeductibleCents: z.number().int().min(0), vatNonDeductibleCents: z.number().int().min(0) })).mutation(async ({ ctx, input }) => {
    const tenant = await getOrCreateTenantContext(ctx.user);
    assertTaxReviewer(tenant.membership.role);
    const existing = await getTaxReviewProposalForTenant(tenant.tenant.id, input.documentId);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Não existe uma proposta fiscal para esta fatura." });
    if (existing.reviewStatus !== "pendente") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A proposta já foi revista e requer nova preparação para ser alterada." });
    if (input.vatDeductibleCents + input.vatNonDeductibleCents !== existing.vatOriginalCents) throw new TRPCError({ code: "BAD_REQUEST", message: "O IVA dedutível e não dedutível deve totalizar o IVA original da fatura." });
    const proposal = await confirmTaxReviewProposal({ tenantId: tenant.tenant.id, documentId: input.documentId, reviewedByUserId: ctx.user.id, reviewStatus: input.reviewStatus, vatDeductibleCents: input.vatDeductibleCents, vatNonDeductibleCents: input.vatNonDeductibleCents });
    if (!proposal || proposal.reviewStatus !== input.reviewStatus) throw new TRPCError({ code: "CONFLICT", message: "Não foi possível confirmar a revisão fiscal." });
    await recordAudit({ tenantId: tenant.tenant.id, actorUserId: ctx.user.id, action: "tax_review.confirmed", resourceType: "taxReviewProposal", resourceId: String(proposal.id), metadata: { documentId: input.documentId, reviewStatus: input.reviewStatus, vatDeductibleCents: input.vatDeductibleCents, vatNonDeductibleCents: input.vatNonDeductibleCents } });
    return proposal;
  }),
});
