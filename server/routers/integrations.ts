import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getOrCreateTenantContext, listIntegrationConnectionsForTenant, recordAudit, updateIntegrationConnection } from "../db";
import { integrationAdapters, runIntegrationStub } from "../integrations";
import { canPerform } from "../security";
import { protectedProcedure, router } from "../_core/trpc";

const providerSchema = z.enum(["woocommerce", "ifthenpay", "moloni"]);

export const integrationsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const tenantContext = await getOrCreateTenantContext(ctx.user);
    const saved = await listIntegrationConnectionsForTenant(tenantContext.tenant.id);
    return integrationAdapters.map(adapter => ({ ...adapter, connection: saved.find(item => item.provider === adapter.provider) ?? null }));
  }),
  prepare: protectedProcedure.input(z.object({ provider: providerSchema })).mutation(async ({ ctx, input }) => {
    const tenantContext = await getOrCreateTenantContext(ctx.user);
    if (!canPerform(tenantContext.membership.role, "settings:manage")) throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem preparar integrações." });
    const adapter = integrationAdapters.find(item => item.provider === input.provider);
    if (!adapter) throw new TRPCError({ code: "NOT_FOUND" });
    const connection = await updateIntegrationConnection({ tenantId: tenantContext.tenant.id, provider: adapter.provider, displayName: adapter.label, status: "nao_configurada", configuration: { adapterVersion: 1, capabilities: adapter.capabilities } });
    await recordAudit({ tenantId: tenantContext.tenant.id, actorUserId: ctx.user.id, action: "integration.prepared", resourceType: "integrationConnection", resourceId: String(connection?.id ?? input.provider), metadata: { provider: input.provider } });
    return connection;
  }),
  runStub: protectedProcedure.input(z.object({ provider: providerSchema })).mutation(async ({ ctx, input }) => {
    const tenantContext = await getOrCreateTenantContext(ctx.user);
    if (!canPerform(tenantContext.membership.role, "settings:manage")) throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem executar conectores." });
    const result = runIntegrationStub(input.provider);
    await recordAudit({ tenantId: tenantContext.tenant.id, actorUserId: ctx.user.id, action: "integration.stub_run", resourceType: "integrationConnection", metadata: result });
    return result;
  }),
});
