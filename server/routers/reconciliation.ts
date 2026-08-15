import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { generateReconciliationSuggestions, getOrCreateTenantContext, listReconciliationSuggestionsForTenant, recordAudit, reviewReconciliationSuggestion } from "../db";
import { matchTransaction } from "../reconciliation";
import { canPerform } from "../security";
import { protectedProcedure, router } from "../_core/trpc";

function assertReviewAccess(role: Parameters<typeof canPerform>[0]) {
  if (!canPerform(role, "reconciliation:review")) throw new TRPCError({ code: "FORBIDDEN", message: "O seu papel não permite rever conciliações." });
}

export const reconciliationRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const tenantContext = await getOrCreateTenantContext(ctx.user);
    assertReviewAccess(tenantContext.membership.role);
    return listReconciliationSuggestionsForTenant(tenantContext.tenant.id);
  }),
  generate: protectedProcedure.mutation(async ({ ctx }) => {
    const tenantContext = await getOrCreateTenantContext(ctx.user);
    assertReviewAccess(tenantContext.membership.role);
    const count = await generateReconciliationSuggestions(tenantContext.tenant.id, matchTransaction);
    await recordAudit({ tenantId: tenantContext.tenant.id, actorUserId: ctx.user.id, action: "reconciliation.generated", resourceType: "reconciliationBatch", metadata: { suggestionCount: count } });
    return { count };
  }),
  review: protectedProcedure.input(z.object({ id: z.number().int().positive(), decision: z.enum(["aceite", "rejeitada"]) })).mutation(async ({ ctx, input }) => {
    const tenantContext = await getOrCreateTenantContext(ctx.user);
    assertReviewAccess(tenantContext.membership.role);
    const suggestion = await reviewReconciliationSuggestion(tenantContext.tenant.id, input.id, ctx.user.id, input.decision);
    if (!suggestion) throw new TRPCError({ code: "NOT_FOUND", message: "Sugestão não encontrada ou já revista." });
    await recordAudit({ tenantId: tenantContext.tenant.id, actorUserId: ctx.user.id, action: input.decision === "aceite" ? "reconciliation.accepted" : "reconciliation.rejected", resourceType: "reconciliationSuggestion", resourceId: String(input.id), metadata: { transactionId: suggestion.bankTransactionId, financialRecordId: suggestion.financialRecordId } });
    return { success: true } as const;
  }),
});
