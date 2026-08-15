import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createFolderRule, getOrCreateTenantContext, listFolderRulesForTenant, recordAudit, removeFolderRuleForTenant } from "../db";
import { canPerform } from "../security";
import { protectedProcedure, router } from "../_core/trpc";

function assertSettingsAccess(role: Parameters<typeof canPerform>[0]) {
  if (!canPerform(role, "settings:manage")) throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem alterar regras de pastas." });
}

export const folderRulesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const tenantContext = await getOrCreateTenantContext(ctx.user);
    return listFolderRulesForTenant(tenantContext.tenant.id);
  }),
  create: protectedProcedure
    .input(z.object({ name: z.string().trim().min(2).max(120), priority: z.number().int().min(1).max(999).default(100), documentType: z.string().max(40).nullable(), entityName: z.string().max(255).nullable(), emailDomain: z.string().max(255).nullable(), keyword: z.string().max(255).nullable(), folderTemplate: z.string().min(4).max(512) }))
    .mutation(async ({ ctx, input }) => {
      const tenantContext = await getOrCreateTenantContext(ctx.user);
      assertSettingsAccess(tenantContext.membership.role);
      const rule = await createFolderRule({ tenantId: tenantContext.tenant.id, ...input, enabled: true });
      await recordAudit({ tenantId: tenantContext.tenant.id, actorUserId: ctx.user.id, action: "folder_rule.created", resourceType: "folderRule", resourceId: String(rule.id), metadata: { name: rule.name } });
      return rule;
    }),
  remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const tenantContext = await getOrCreateTenantContext(ctx.user);
    assertSettingsAccess(tenantContext.membership.role);
    await removeFolderRuleForTenant(tenantContext.tenant.id, input.id);
    await recordAudit({ tenantId: tenantContext.tenant.id, actorUserId: ctx.user.id, action: "folder_rule.deleted", resourceType: "folderRule", resourceId: String(input.id) });
    return { success: true } as const;
  }),
});
