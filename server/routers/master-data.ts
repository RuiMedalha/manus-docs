import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { canPerform } from "../security";
import { createCrmSyncRun, createFinancialAccount, createFinancialCategory, findOrCreateBusinessEntity, finishCrmSyncRun, getCrmConnectionForTenant, getOrCreateTenantContext, listBusinessEntitiesForTenant, listCrmConnectionsForTenant, listCrmSyncRunsForTenant, listFinancialAccountsForTenant, listFinancialCategoriesForTenant, listSupplierPaymentProfilesForTenant, recordAudit, updateBusinessEntityForTenant, updateCrmConnection, upsertSupplierPaymentProfile } from "../db";
import { crmEndpoint, crmHeaders, crmPayload, validateCrmConnection, valueAtPath } from "../crm-adapter";
import { protectedProcedure, router } from "../_core/trpc";

const entityKind = z.enum(["fornecedor", "cliente", "ambos"]);
const accountKind = z.enum(["banco", "despesa", "receita", "iva", "outro"]);

function requireFinancialWrite(role: Parameters<typeof canPerform>[0]) {
  if (!canPerform(role, "documents:write")) throw new TRPCError({ code: "FORBIDDEN", message: "O seu papel não permite gerir dados financeiros." });
}

export const masterDataRouter = router({
  entities: protectedProcedure.input(z.object({ type: z.enum(["fornecedor", "cliente"]).optional() }).optional()).query(async ({ ctx, input }) => {
    const tenant = await getOrCreateTenantContext(ctx.user);
    return listBusinessEntitiesForTenant(tenant.tenant.id, input?.type);
  }),
  createEntity: protectedProcedure.input(z.object({ entityType: z.enum(["fornecedor", "cliente"]), name: z.string().min(2).max(255), nif: z.string().max(32).optional(), email: z.string().email().optional(), status: z.enum(["proposto", "ativo"]).default("ativo") })).mutation(async ({ ctx, input }) => {
    const tenant = await getOrCreateTenantContext(ctx.user); requireFinancialWrite(tenant.membership.role);
    const entity = await findOrCreateBusinessEntity({ tenantId: tenant.tenant.id, createdByUserId: ctx.user.id, ...input });
    await recordAudit({ tenantId: tenant.tenant.id, actorUserId: ctx.user.id, action: "entity.created", resourceType: "businessEntity", resourceId: String(entity.id), metadata: { entityType: entity.entityType, status: entity.status } });
    return entity;
  }),
  updateEntity: protectedProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().min(2).max(255).optional(), entityType: entityKind.optional(), status: z.enum(["proposto", "ativo", "arquivado"]).optional(), nif: z.string().max(32).nullable().optional(), email: z.string().email().nullable().optional(), phone: z.string().max(64).nullable().optional(), address: z.string().max(1000).nullable().optional(), externalCrmId: z.string().max(160).nullable().optional() })).mutation(async ({ ctx, input }) => {
    const tenant = await getOrCreateTenantContext(ctx.user); requireFinancialWrite(tenant.membership.role);
    const { id, ...values } = input; const entity = await updateBusinessEntityForTenant(tenant.tenant.id, id, values);
    if (!entity) throw new TRPCError({ code: "NOT_FOUND", message: "Entidade não encontrada." });
    await recordAudit({ tenantId: tenant.tenant.id, actorUserId: ctx.user.id, action: "entity.updated", resourceType: "businessEntity", resourceId: String(id) });
    return entity;
  }),
  supplierProfiles: protectedProcedure.query(async ({ ctx }) => {
    const tenant = await getOrCreateTenantContext(ctx.user);
    return listSupplierPaymentProfilesForTenant(tenant.tenant.id);
  }),
  saveSupplierProfile: protectedProcedure.input(z.object({ entityId: z.number().int().positive(), paymentMethod: z.enum(["manual", "transferencia", "cartao", "debito_direto"]), paymentTermsDays: z.number().int().min(0).max(365).nullable().optional(), paymentWindowMinDays: z.number().int().min(0).max(365).nullable().optional(), paymentWindowMaxDays: z.number().int().min(0).max(365).nullable().optional(), defaultDebitAccountId: z.number().int().positive().nullable().optional(), defaultCategoryId: z.number().int().positive().nullable().optional(), finalFolder: z.string().min(2).max(512).nullable().optional(), isActive: z.boolean().optional() })).mutation(async ({ ctx, input }) => {
    const tenant = await getOrCreateTenantContext(ctx.user); requireFinancialWrite(tenant.membership.role);
    const supplier = (await listBusinessEntitiesForTenant(tenant.tenant.id, "fornecedor")).find(entity => entity.id === input.entityId);
    if (!supplier) throw new TRPCError({ code: "NOT_FOUND", message: "Fornecedor não encontrado." });
    if (input.paymentWindowMinDays !== undefined && input.paymentWindowMaxDays !== undefined && input.paymentWindowMinDays !== null && input.paymentWindowMaxDays !== null && input.paymentWindowMinDays > input.paymentWindowMaxDays) throw new TRPCError({ code: "BAD_REQUEST", message: "O início da janela não pode ser posterior ao fim." });
    const { entityId, ...profileInput } = input;
    const profile = await upsertSupplierPaymentProfile({ tenantId: tenant.tenant.id, entityId, createdByUserId: ctx.user.id, ...profileInput });
    await recordAudit({ tenantId: tenant.tenant.id, actorUserId: ctx.user.id, action: "supplier_payment_profile.saved", resourceType: "supplierPaymentProfile", resourceId: String(profile.id), metadata: { entityId: supplier.id, paymentMethod: profile.paymentMethod, paymentTermsDays: profile.paymentTermsDays } });
    return profile;
  }),
  accounts: protectedProcedure.query(async ({ ctx }) => { const tenant = await getOrCreateTenantContext(ctx.user); return listFinancialAccountsForTenant(tenant.tenant.id); }),
  createAccount: protectedProcedure.input(z.object({ accountType: accountKind, code: z.string().min(1).max(32), name: z.string().min(2).max(160), iban: z.string().max(64).optional() })).mutation(async ({ ctx, input }) => {
    const tenant = await getOrCreateTenantContext(ctx.user); requireFinancialWrite(tenant.membership.role);
    const account = await createFinancialAccount({ tenantId: tenant.tenant.id, createdByUserId: ctx.user.id, ...input, iban: input.iban ?? null });
    await recordAudit({ tenantId: tenant.tenant.id, actorUserId: ctx.user.id, action: "financial_account.created", resourceType: "financialAccount", resourceId: String(account.id), metadata: { accountType: account.accountType, code: account.code } });
    return account;
  }),
  categories: protectedProcedure.query(async ({ ctx }) => { const tenant = await getOrCreateTenantContext(ctx.user); return listFinancialCategoriesForTenant(tenant.tenant.id); }),
  createCategory: protectedProcedure.input(z.object({ direction: z.enum(["despesa", "receita"]), code: z.string().min(1).max(32), name: z.string().min(2).max(160), accountId: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
    const tenant = await getOrCreateTenantContext(ctx.user); requireFinancialWrite(tenant.membership.role);
    const category = await createFinancialCategory({ tenantId: tenant.tenant.id, createdByUserId: ctx.user.id, ...input, accountId: input.accountId ?? null });
    await recordAudit({ tenantId: tenant.tenant.id, actorUserId: ctx.user.id, action: "financial_category.created", resourceType: "financialCategory", resourceId: String(category.id), metadata: { direction: category.direction, code: category.code } });
    return category;
  }),
  crm: protectedProcedure.query(async ({ ctx }) => { const tenant = await getOrCreateTenantContext(ctx.user); return listCrmConnectionsForTenant(tenant.tenant.id); }),
  configureCrm: protectedProcedure.input(z.object({ provider: z.string().min(2).max(80), displayName: z.string().min(2).max(120), baseUrl: z.string().url(), contactPath: z.string().min(1).max(255).default("/contacts"), syncMethod: z.enum(["POST", "PUT", "PATCH"]).default("POST"), authType: z.enum(["bearer", "api_key", "basic", "none"]).default("bearer"), secretEnvKey: z.string().min(3).max(120).optional(), externalIdPath: z.string().min(1).max(120).default("id"), fieldMapping: z.object({ name: z.string().min(1), nif: z.string().min(1), email: z.string().min(1), phone: z.string().min(1), address: z.string().min(1), type: z.string().min(1) }).default({ name: "name", nif: "tax_id", email: "email", phone: "phone", address: "address", type: "type" }) })).mutation(async ({ ctx, input }) => {
    const tenant = await getOrCreateTenantContext(ctx.user); requireFinancialWrite(tenant.membership.role);
    const connection = await updateCrmConnection({ tenantId: tenant.tenant.id, createdByUserId: ctx.user.id, provider: input.provider.toLowerCase(), displayName: input.displayName, baseUrl: input.baseUrl, contactPath: input.contactPath, syncMethod: input.syncMethod, authType: input.authType, secretEnvKey: input.secretEnvKey ?? null, externalIdPath: input.externalIdPath, status: "configurada", fieldMapping: input.fieldMapping });
    await recordAudit({ tenantId: tenant.tenant.id, actorUserId: ctx.user.id, action: "crm.configured", resourceType: "crmConnection", resourceId: String(connection?.id ?? "") });
    return connection;
  }),
  crmHistory: protectedProcedure.query(async ({ ctx }) => { const tenant = await getOrCreateTenantContext(ctx.user); return listCrmSyncRunsForTenant(tenant.tenant.id); }),
  validateCrm: protectedProcedure.input(z.object({ connectionId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const tenant = await getOrCreateTenantContext(ctx.user); requireFinancialWrite(tenant.membership.role);
    const connection = await getCrmConnectionForTenant(tenant.tenant.id, input.connectionId);
    if (!connection?.baseUrl) throw new TRPCError({ code: "NOT_FOUND", message: "Ligação CRM não encontrada ou sem URL base." });
    const secret = connection.secretEnvKey ? process.env[connection.secretEnvKey] : undefined;
    if (connection.authType !== "none" && !secret) return { valid: false, reason: "secret_missing" as const, message: `Defina o segredo de ambiente ${connection.secretEnvKey ?? "do CRM"} para validar a ligação.` };
    const outcome = await validateCrmConnection({ baseUrl: connection.baseUrl, contactPath: connection.contactPath, authType: connection.authType }, secret);
    await recordAudit({ tenantId: tenant.tenant.id, actorUserId: ctx.user.id, action: outcome.valid ? "crm.connection_validated" : "crm.connection_validation_failed", resourceType: "crmConnection", resourceId: String(connection.id), metadata: outcome });
    return outcome;
  }),
  previewCrm: protectedProcedure.input(z.object({ connectionId: z.number().int().positive(), limit: z.number().int().min(1).max(20).default(5) })).query(async ({ ctx, input }) => {
    const tenant = await getOrCreateTenantContext(ctx.user); const connection = await getCrmConnectionForTenant(tenant.tenant.id, input.connectionId);
    if (!connection?.baseUrl) throw new TRPCError({ code: "NOT_FOUND", message: "Ligação CRM não encontrada ou sem URL base." });
    const config = { baseUrl: connection.baseUrl, contactPath: connection.contactPath, syncMethod: connection.syncMethod, authType: connection.authType, externalIdPath: connection.externalIdPath, fieldMapping: (connection.fieldMapping ?? {}) as Record<string, string> };
    const entities = (await listBusinessEntitiesForTenant(tenant.tenant.id)).filter(entity => entity.status === "ativo").slice(0, input.limit);
    return entities.map(entity => ({ entityId: entity.id, name: entity.name, method: connection.syncMethod, endpoint: crmEndpoint(config, entity), payload: crmPayload(config, entity) }));
  }),
  syncCrm: protectedProcedure.input(z.object({ connectionId: z.number().int().positive(), execute: z.boolean().default(false), limit: z.number().int().min(1).max(100).default(25) })).mutation(async ({ ctx, input }) => {
    const tenant = await getOrCreateTenantContext(ctx.user); requireFinancialWrite(tenant.membership.role);
    const connection = await getCrmConnectionForTenant(tenant.tenant.id, input.connectionId);
    if (!connection?.baseUrl) throw new TRPCError({ code: "NOT_FOUND", message: "Ligação CRM não encontrada ou sem URL base." });
    const config = { baseUrl: connection.baseUrl, contactPath: connection.contactPath, syncMethod: connection.syncMethod, authType: connection.authType, externalIdPath: connection.externalIdPath, fieldMapping: (connection.fieldMapping ?? {}) as Record<string, string> };
    const entities = (await listBusinessEntitiesForTenant(tenant.tenant.id)).filter(entity => entity.status === "ativo").slice(0, input.limit);
    const secret = connection.secretEnvKey ? process.env[connection.secretEnvKey] : undefined;
    if (input.execute && connection.authType !== "none" && !secret) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Defina o segredo de ambiente ${connection.secretEnvKey ?? "do CRM"} antes de executar a sincronização.` });
    if (input.execute) {
      const outcome = await validateCrmConnection({ baseUrl: connection.baseUrl, contactPath: connection.contactPath, authType: connection.authType }, secret);
      if (!outcome.valid) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `A ligação CRM não foi validada (${outcome.reason}).` });
    }
    const run = await createCrmSyncRun({ tenantId: tenant.tenant.id, crmConnectionId: connection.id, triggeredByUserId: ctx.user.id, status: input.execute ? "em_curso" : "simulada", totalCount: entities.length, summary: { mode: input.execute ? "execute" : "simulate" } });
    if (!input.execute) return finishCrmSyncRun(tenant.tenant.id, run.id, { status: "simulada", succeededCount: entities.length, failedCount: 0, summary: { mode: "simulate", contacts: entities.map(entity => ({ id: entity.id, endpoint: crmEndpoint(config, entity), payload: crmPayload(config, entity) })) } });
    let succeededCount = 0; const failures: Array<{ entityId: number; message: string }> = [];
    for (const entity of entities) { try { const response = await fetch(crmEndpoint(config, entity), { method: connection.syncMethod, headers: crmHeaders(connection.authType, secret), body: JSON.stringify(crmPayload(config, entity)) }); if (!response.ok) throw new Error(`HTTP ${response.status}`); const body: unknown = await response.json().catch(() => ({})); const externalCrmId = valueAtPath(body, connection.externalIdPath) ?? entity.externalCrmId; await updateBusinessEntityForTenant(tenant.tenant.id, entity.id, { externalCrmId }); succeededCount += 1; } catch (error) { failures.push({ entityId: entity.id, message: error instanceof Error ? error.message : "Erro desconhecido" }); } }
    const completed = await finishCrmSyncRun(tenant.tenant.id, run.id, { status: failures.length ? (succeededCount ? "parcial" : "falhou") : "concluida", succeededCount, failedCount: failures.length, summary: { mode: "execute", failures } });
    await recordAudit({ tenantId: tenant.tenant.id, actorUserId: ctx.user.id, action: "crm.sync", resourceType: "crmSyncRun", resourceId: String(run.id), metadata: { succeededCount, failedCount: failures.length } });
    return completed;
  }),
});
