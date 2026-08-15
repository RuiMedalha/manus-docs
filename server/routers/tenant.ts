import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  acceptTenantInvitation,
  createTenantForUser,
  createTenantInvitation,
  getOrCreateTenantContext,
  listAuditLog,
  listTenantContextsForUser,
  listTenantInvitations,
  listTenantMembers,
  recordAudit,
  revokeTenantInvitation,
  selectActiveTenant,
  updateTenantFolderPattern,
  updateTenantMember,
} from "../db";
import { canPerform, type TenantRole } from "../security";
import { protectedProcedure, router } from "../_core/trpc";

async function contextFor(user: { id: number; name?: string | null; email?: string | null }) {
  return getOrCreateTenantContext(user);
}

function requirePermission(role: TenantRole, permission: Parameters<typeof canPerform>[1]) {
  if (!canPerform(role, permission)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "O seu papel não permite esta ação nesta organização." });
  }
}

export const tenantRouter = router({
  context: protectedProcedure.query(async ({ ctx }) => contextFor(ctx.user)),
  list: protectedProcedure.query(async ({ ctx }) => listTenantContextsForUser(ctx.user.id)),
  create: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(160) })).mutation(async ({ ctx, input }) => {
    return createTenantForUser({ userId: ctx.user.id, name: input.name });
  }),
  select: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const selected = await selectActiveTenant(ctx.user.id, input.id);
    if (!selected) throw new TRPCError({ code: "FORBIDDEN", message: "Não pertence a esta organização." });
    return { success: true } as const;
  }),
  updateFolderPattern: protectedProcedure.input(z.object({ folderPattern: z.string().min(4).max(255) })).mutation(async ({ ctx, input }) => {
    const tenantContext = await contextFor(ctx.user);
    requirePermission(tenantContext.membership.role, "settings:manage");
    const tenant = await updateTenantFolderPattern(tenantContext.tenant.id, input.folderPattern);
    await recordAudit({ tenantId: tenantContext.tenant.id, actorUserId: ctx.user.id, action: "tenant.folder_pattern_updated", resourceType: "tenant", resourceId: String(tenantContext.tenant.id) });
    return tenant;
  }),
  members: protectedProcedure.query(async ({ ctx }) => {
    const tenantContext = await contextFor(ctx.user);
    return listTenantMembers(tenantContext.tenant.id);
  }),
  invite: protectedProcedure
    .input(z.object({ email: z.string().email(), role: z.enum(["admin", "contabilidade", "operador", "aprovador"]) }))
    .mutation(async ({ ctx, input }) => {
      const tenantContext = await contextFor(ctx.user);
      requirePermission(tenantContext.membership.role, "members:manage");
      const invitation = await createTenantInvitation({
        tenantId: tenantContext.tenant.id,
        email: input.email.toLowerCase(),
        role: input.role,
        invitedByUserId: ctx.user.id,
      });
      return { success: true, invitationCode: invitation.token, expiresAt: invitation.expiresAt } as const;
    }),
  invitations: protectedProcedure.query(async ({ ctx }) => {
    const tenantContext = await contextFor(ctx.user);
    requirePermission(tenantContext.membership.role, "members:manage");
    return listTenantInvitations(tenantContext.tenant.id);
  }),
  revokeInvitation: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const tenantContext = await contextFor(ctx.user);
    requirePermission(tenantContext.membership.role, "members:manage");
    await revokeTenantInvitation(tenantContext.tenant.id, input.id, ctx.user.id);
    return { success: true } as const;
  }),
  acceptInvitation: protectedProcedure.input(z.object({ code: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const accepted = await acceptTenantInvitation({ token: input.code, userId: ctx.user.id, userEmail: ctx.user.email });
    if (!accepted) throw new TRPCError({ code: "BAD_REQUEST", message: "O convite é inválido, expirou ou não pertence a este endereço de email." });
    return { success: true, tenantId: accepted.tenantId } as const;
  }),
  updateMember: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), role: z.enum(["admin", "contabilidade", "operador", "aprovador"]).optional(), status: z.enum(["ativo", "suspenso"]).optional() }))
    .mutation(async ({ ctx, input }) => {
      const tenantContext = await contextFor(ctx.user);
      requirePermission(tenantContext.membership.role, "members:manage");
      if (input.id === tenantContext.membership.id && input.status === "suspenso") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Não pode suspender o seu próprio acesso." });
      }
      const updated = await updateTenantMember(tenantContext.tenant.id, input.id, { role: input.role, status: input.status });
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Membro não encontrado." });
      await recordAudit({ tenantId: tenantContext.tenant.id, actorUserId: ctx.user.id, action: "member.updated", resourceType: "tenantMember", resourceId: String(input.id), metadata: input });
      return updated;
    }),
  audit: protectedProcedure.query(async ({ ctx }) => {
    const tenantContext = await contextFor(ctx.user);
    return listAuditLog(tenantContext.tenant.id);
  }),
});
