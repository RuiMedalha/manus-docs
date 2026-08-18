import { and, asc, desc, eq, getTableColumns, isNull, like, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createHash, randomUUID } from "node:crypto";
import {
  auditLogs,
  bankImportTemplates,
  bankImports,
  bankTransactions,
  businessEntities,
  crmConnections,
  crmSyncRuns,
  documentProcessingJobs,
  documents,
  financialAccounts,
  financialCategories,
  financialRecords,
  folderRules,
  integrationConnections,
  InsertUser,
  localAuthCredentials,
  localAuthSessions,
  ocrProcessingConfigs,
  paymentApprovalPolicies,
  paymentSchedules,
  reconciliationSuggestions,
  reconciliations,
  tenantInvitations,
  tenantMembers,
  tenants,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { normaliseSlug, type TenantRole } from "./security";
import { canClaimOcrJob, statusAfterOcrFailure } from "./ocr-queue";
import { resolveDocumentCrmStatus } from "./document-crm-status";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const previous = await getUserByOpenId(user.openId);

  const values: InsertUser = { openId: user.openId, lastSignedIn: new Date() };
  const updateSet: Record<string, unknown> = { lastSignedIn: new Date() };
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  values.role = user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user");
  updateSet.role = values.role;
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  const shouldLogLogin = previous?.tenantId && previous.tenantId > 0 && Date.now() - previous.lastSignedIn.getTime() > 30 * 60 * 1000;
  if (shouldLogLogin) {
    await recordAudit({ tenantId: previous.tenantId, actorUserId: previous.id, action: "auth.login", resourceType: "user", resourceId: String(previous.id) });
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function createLocalUser(input: { openId: string; email: string; name: string; loginMethod: string }) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  await db.insert(users).values({ openId: input.openId, email: input.email, name: input.name, loginMethod: input.loginMethod, tenantId: 0, role: "user", lastSignedIn: new Date() });
  const rows = await db.select().from(users).where(eq(users.openId, input.openId)).limit(1);
  if (!rows[0]) throw new Error("Não foi possível criar a conta local.");
  return rows[0];
}

export async function getLocalCredentialByEmail(email: string) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  const rows = await db.select({ credential: localAuthCredentials, user: users }).from(localAuthCredentials).innerJoin(users, eq(localAuthCredentials.userId, users.id)).where(eq(localAuthCredentials.email, email)).limit(1);
  return rows[0] ? { ...rows[0].credential, user: rows[0].user } : null;
}

export async function getLocalCredentialByResetHash(resetTokenHash: string) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  const rows = await db.select({ credential: localAuthCredentials, user: users }).from(localAuthCredentials).innerJoin(users, eq(localAuthCredentials.userId, users.id)).where(eq(localAuthCredentials.resetTokenHash, resetTokenHash)).limit(1);
  return rows[0] ? { ...rows[0].credential, user: rows[0].user } : null;
}

export async function createLocalCredential(input: { tenantId: number; userId: number; email: string; passwordHash: string }) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  await db.insert(localAuthCredentials).values(input);
}

export async function updateLocalCredentialSecurity(id: number, input: { failedAttempts: number; lockedUntil: Date | null }) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  await db.update(localAuthCredentials).set(input).where(eq(localAuthCredentials.id, id));
}

export async function updateLocalCredentialReset(id: number, input: { resetTokenHash: string; resetExpiresAt: Date }) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  await db.update(localAuthCredentials).set(input).where(eq(localAuthCredentials.id, id));
}

export async function updateLocalCredentialPassword(id: number, passwordHash: string) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  await db.update(localAuthCredentials).set({ passwordHash, resetTokenHash: null, resetExpiresAt: null, failedAttempts: 0, lockedUntil: null, lastPasswordChangedAt: new Date() }).where(eq(localAuthCredentials.id, id));
}

export async function createLocalAuthSession(input: { tenantId: number; userId: number; refreshTokenHash: string; expiresAt: Date }) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  await db.insert(localAuthSessions).values(input);
  const rows = await db.select().from(localAuthSessions).where(eq(localAuthSessions.refreshTokenHash, input.refreshTokenHash)).limit(1);
  if (!rows[0]) throw new Error("Não foi possível criar a sessão local.");
  return rows[0];
}

export async function getLocalAuthSessionByHash(refreshTokenHash: string) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  const rows = await db.select({ session: localAuthSessions, user: users }).from(localAuthSessions).innerJoin(users, eq(localAuthSessions.userId, users.id)).where(eq(localAuthSessions.refreshTokenHash, refreshTokenHash)).limit(1);
  return rows[0] ? { ...rows[0].session, user: rows[0].user } : null;
}

export async function revokeAllLocalAuthSessions(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  await db.update(localAuthSessions).set({ revokedAt: new Date() }).where(and(eq(localAuthSessions.userId, userId), isNull(localAuthSessions.revokedAt)));
}

export async function revokeLocalAuthSession(id: number) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  await db.update(localAuthSessions).set({ revokedAt: new Date() }).where(eq(localAuthSessions.id, id));
}

export type TenantContext = {
  tenant: typeof tenants.$inferSelect;
  membership: typeof tenantMembers.$inferSelect;
};

export async function getOrCreateTenantContext(user: { id: number; tenantId?: number; name?: string | null; email?: string | null }): Promise<TenantContext> {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");

  if (user.tenantId && user.tenantId > 0) {
    const active = await db
      .select({ tenant: tenants, membership: tenantMembers })
      .from(tenantMembers)
      .innerJoin(tenants, eq(tenantMembers.tenantId, tenants.id))
      .where(and(eq(tenantMembers.userId, user.id), eq(tenantMembers.tenantId, user.tenantId), eq(tenantMembers.status, "ativo")))
      .limit(1);
    if (active[0]) return active[0];
  }

  const existing = await db
    .select({ tenant: tenants, membership: tenantMembers })
    .from(tenantMembers)
    .innerJoin(tenants, eq(tenantMembers.tenantId, tenants.id))
    .where(and(eq(tenantMembers.userId, user.id), eq(tenantMembers.status, "ativo")))
    .orderBy(asc(tenantMembers.id))
    .limit(1);

  if (existing[0]) {
    await db.update(users).set({ tenantId: existing[0].tenant.id }).where(eq(users.id, user.id));
    return existing[0];
  }

  const baseName = user.name?.trim() || user.email?.split("@")[0] || "A minha organização";
  const slug = `${normaliseSlug(baseName)}-${user.id}-${randomUUID().slice(0, 6)}`;
  await db.insert(tenants).values({ name: baseName, slug });
  const createdTenantRows = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
  const tenantId = createdTenantRows[0]?.id;
  if (!tenantId) throw new Error("Não foi possível obter a organização criada.");
  await db.insert(tenantMembers).values({ tenantId, userId: user.id, role: "admin", status: "ativo" });
  await db.update(users).set({ tenantId }).where(eq(users.id, user.id));
  await recordAudit({
    tenantId,
    actorUserId: user.id,
    action: "tenant.created",
    resourceType: "tenant",
    resourceId: String(tenantId),
  });

  const created = await db
    .select({ tenant: tenants, membership: tenantMembers })
    .from(tenantMembers)
    .innerJoin(tenants, eq(tenantMembers.tenantId, tenants.id))
    .where(and(eq(tenantMembers.userId, user.id), eq(tenantMembers.tenantId, tenantId)))
    .limit(1);
  if (!created[0]) throw new Error("Não foi possível criar a organização inicial.");
  return created[0];
}

export async function listTenantContextsForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ tenant: tenants, membership: tenantMembers })
    .from(tenantMembers)
    .innerJoin(tenants, eq(tenantMembers.tenantId, tenants.id))
    .where(and(eq(tenantMembers.userId, userId), eq(tenantMembers.status, "ativo")))
    .orderBy(asc(tenantMembers.id));
}

export async function createTenantForUser(input: { userId: number; name: string }) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  const slug = `${normaliseSlug(input.name)}-${input.userId}-${randomUUID().slice(0, 6)}`;
  await db.insert(tenants).values({ name: input.name.trim(), slug });
  const tenantRows = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
  const tenantId = tenantRows[0]?.id;
  if (!tenantId) throw new Error("Não foi possível obter a organização criada.");
  await db.insert(tenantMembers).values({ tenantId, userId: input.userId, role: "admin", status: "ativo" });
  await db.update(users).set({ tenantId }).where(eq(users.id, input.userId));
  await recordAudit({ tenantId, actorUserId: input.userId, action: "tenant.created", resourceType: "tenant", resourceId: String(tenantId) });
  return getOrCreateTenantContext({ id: input.userId, tenantId });
}

export async function selectActiveTenant(userId: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  const membership = await db
    .select()
    .from(tenantMembers)
    .where(and(eq(tenantMembers.userId, userId), eq(tenantMembers.tenantId, tenantId), eq(tenantMembers.status, "ativo")))
    .limit(1);
  if (!membership[0]) return false;
  await db.update(users).set({ tenantId }).where(eq(users.id, userId));
  return true;
}

export async function updateTenantFolderPattern(tenantId: number, folderPattern: string) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  await db.update(tenants).set({ folderPattern }).where(eq(tenants.id, tenantId));
  const rows = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  return rows[0];
}

export async function listIntegrationConnectionsForTenant(tenantId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(integrationConnections).where(eq(integrationConnections.tenantId, tenantId));
}

export async function updateIntegrationConnection(input: typeof integrationConnections.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  await db.insert(integrationConnections).values(input).onDuplicateKeyUpdate({
    set: { displayName: input.displayName, status: input.status, configuration: input.configuration, lastSyncAt: input.lastSyncAt },
  });
  const rows = await db.select().from(integrationConnections).where(and(eq(integrationConnections.tenantId, input.tenantId), eq(integrationConnections.provider, input.provider))).limit(1);
  return rows[0];
}

function normalizeBusinessName(name: string) {
  return name.trim().toLocaleLowerCase("pt-PT").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

export async function listBusinessEntitiesForTenant(tenantId: number, entityType?: "fornecedor" | "cliente") {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(businessEntities).where(eq(businessEntities.tenantId, tenantId)).orderBy(asc(businessEntities.name));
  return entityType ? rows.filter(item => item.entityType === entityType || item.entityType === "ambos") : rows;
}

export async function findOrCreateBusinessEntity(input: { tenantId: number; createdByUserId: number; entityType: "fornecedor" | "cliente"; name: string; nif?: string | null; email?: string | null; status?: "proposto" | "ativo" }) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  const normalizedName = normalizeBusinessName(input.name);
  const normalizedNif = input.nif?.replace(/\s+/g, "") || null;
  const byNif = normalizedNif ? await db.select().from(businessEntities).where(and(eq(businessEntities.tenantId, input.tenantId), eq(businessEntities.nif, normalizedNif))).limit(1) : [];
  const byName = byNif[0] ? [] : await db.select().from(businessEntities).where(and(eq(businessEntities.tenantId, input.tenantId), eq(businessEntities.normalizedName, normalizedName))).limit(1);
  const existing = byNif[0] ?? byName[0];
  if (existing) return existing;
  const result = await db.insert(businessEntities).values({ tenantId: input.tenantId, createdByUserId: input.createdByUserId, entityType: input.entityType, status: input.status ?? "proposto", name: input.name.trim(), normalizedName, nif: normalizedNif, email: input.email ?? null });
  const id = Number((result as unknown as { insertId: number }).insertId);
  const rows = await db.select().from(businessEntities).where(and(eq(businessEntities.tenantId, input.tenantId), eq(businessEntities.id, id))).limit(1);
  if (!rows[0]) throw new Error("Não foi possível criar a entidade.");
  return rows[0];
}

export async function updateBusinessEntityForTenant(tenantId: number, id: number, input: { name?: string; entityType?: "fornecedor" | "cliente" | "ambos"; status?: "proposto" | "ativo" | "arquivado"; nif?: string | null; email?: string | null; phone?: string | null; address?: string | null; externalCrmId?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  const values = { ...input, ...(input.name ? { name: input.name.trim(), normalizedName: normalizeBusinessName(input.name) } : {}), ...(input.nif !== undefined ? { nif: input.nif?.replace(/\s+/g, "") || null } : {}) };
  await db.update(businessEntities).set(values).where(and(eq(businessEntities.tenantId, tenantId), eq(businessEntities.id, id)));
  const rows = await db.select().from(businessEntities).where(and(eq(businessEntities.tenantId, tenantId), eq(businessEntities.id, id))).limit(1);
  return rows[0];
}

export async function listFinancialAccountsForTenant(tenantId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(financialAccounts).where(eq(financialAccounts.tenantId, tenantId)).orderBy(asc(financialAccounts.code));
}

export async function createFinancialAccount(input: typeof financialAccounts.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  const result = await db.insert(financialAccounts).values(input);
  const id = Number((result as unknown as { insertId: number }).insertId);
  const rows = await db.select().from(financialAccounts).where(and(eq(financialAccounts.tenantId, input.tenantId), eq(financialAccounts.id, id))).limit(1);
  if (!rows[0]) throw new Error("Não foi possível criar a conta.");
  return rows[0];
}

export async function listFinancialCategoriesForTenant(tenantId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(financialCategories).where(eq(financialCategories.tenantId, tenantId)).orderBy(asc(financialCategories.code));
}

export async function createFinancialCategory(input: typeof financialCategories.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  const result = await db.insert(financialCategories).values(input);
  const id = Number((result as unknown as { insertId: number }).insertId);
  const rows = await db.select().from(financialCategories).where(and(eq(financialCategories.tenantId, input.tenantId), eq(financialCategories.id, id))).limit(1);
  if (!rows[0]) throw new Error("Não foi possível criar a categoria.");
  return rows[0];
}

export async function listCrmConnectionsForTenant(tenantId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(crmConnections).where(eq(crmConnections.tenantId, tenantId));
}

export async function updateCrmConnection(input: typeof crmConnections.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  await db.insert(crmConnections).values(input).onDuplicateKeyUpdate({ set: { displayName: input.displayName, baseUrl: input.baseUrl, contactPath: input.contactPath, syncMethod: input.syncMethod, authType: input.authType, secretEnvKey: input.secretEnvKey, externalIdPath: input.externalIdPath, status: input.status, fieldMapping: input.fieldMapping, lastSyncAt: input.lastSyncAt } });
  const rows = await db.select().from(crmConnections).where(and(eq(crmConnections.tenantId, input.tenantId), eq(crmConnections.provider, input.provider))).limit(1);
  return rows[0];
}

export async function getCrmConnectionForTenant(tenantId: number, id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(crmConnections).where(and(eq(crmConnections.tenantId, tenantId), eq(crmConnections.id, id))).limit(1);
  return rows[0];
}

export async function createCrmSyncRun(input: { tenantId: number; crmConnectionId: number; triggeredByUserId: number; status: "em_curso" | "simulada"; totalCount: number; summary?: Record<string, unknown> }) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  const result = await db.insert(crmSyncRuns).values({ ...input, summary: input.summary ?? null });
  const id = Number((result as unknown as { insertId: number }).insertId);
  const rows = await db.select().from(crmSyncRuns).where(and(eq(crmSyncRuns.tenantId, input.tenantId), eq(crmSyncRuns.id, id))).limit(1);
  if (!rows[0]) throw new Error("Não foi possível registar a sincronização CRM.");
  return rows[0];
}

export async function finishCrmSyncRun(tenantId: number, id: number, input: { status: "concluida" | "parcial" | "falhou" | "simulada"; succeededCount: number; failedCount: number; summary: Record<string, unknown> }) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  await db.update(crmSyncRuns).set({ ...input, completedAt: new Date() }).where(and(eq(crmSyncRuns.tenantId, tenantId), eq(crmSyncRuns.id, id)));
  const rows = await db.select().from(crmSyncRuns).where(and(eq(crmSyncRuns.tenantId, tenantId), eq(crmSyncRuns.id, id))).limit(1);
  return rows[0];
}

export async function listCrmSyncRunsForTenant(tenantId: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(crmSyncRuns).where(eq(crmSyncRuns.tenantId, tenantId)).orderBy(desc(crmSyncRuns.startedAt)).limit(limit);
}

export async function listTenantMembers(tenantId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: tenantMembers.id,
      role: tenantMembers.role,
      status: tenantMembers.status,
      createdAt: tenantMembers.createdAt,
      name: users.name,
      email: users.email,
    })
    .from(tenantMembers)
    .innerJoin(users, eq(tenantMembers.userId, users.id))
    .where(eq(tenantMembers.tenantId, tenantId))
    .orderBy(asc(tenantMembers.id));
}

export async function createTenantInvitation(input: {
  tenantId: number;
  email: string;
  role: TenantRole;
  invitedByUserId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  const token = randomUUID();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const result = await db.insert(tenantInvitations).values({ ...input, tokenHash, expiresAt });
  await recordAudit({
    tenantId: input.tenantId,
    actorUserId: input.invitedByUserId,
    action: "member.invited",
    resourceType: "tenantInvitation",
    metadata: { email: input.email, role: input.role },
  });
  return { id: Number((result as unknown as { insertId: number }).insertId), token, expiresAt };
}

export async function listTenantInvitations(tenantId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tenantInvitations).where(eq(tenantInvitations.tenantId, tenantId)).orderBy(desc(tenantInvitations.createdAt));
}

export async function revokeTenantInvitation(tenantId: number, invitationId: number, actorUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  await db
    .update(tenantInvitations)
    .set({ status: "revogado" })
    .where(and(eq(tenantInvitations.tenantId, tenantId), eq(tenantInvitations.id, invitationId), eq(tenantInvitations.status, "pendente")));
  await recordAudit({ tenantId, actorUserId, action: "member.invitation_revoked", resourceType: "tenantInvitation", resourceId: String(invitationId) });
}

export async function acceptTenantInvitation(input: { token: string; userId: number; userEmail?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  const tokenHash = createHash("sha256").update(input.token).digest("hex");
  const invitations = await db.select().from(tenantInvitations).where(eq(tenantInvitations.tokenHash, tokenHash)).limit(1);
  const invitation = invitations[0];
  if (!invitation || invitation.status !== "pendente" || invitation.expiresAt.getTime() < Date.now()) return undefined;
  if (!input.userEmail || invitation.email.toLowerCase() !== input.userEmail.toLowerCase()) return undefined;
  await db
    .insert(tenantMembers)
    .values({ tenantId: invitation.tenantId, userId: input.userId, role: invitation.role, status: "ativo" })
    .onDuplicateKeyUpdate({ set: { role: invitation.role, status: "ativo" } });
  await db.update(tenantInvitations).set({ status: "aceite" }).where(eq(tenantInvitations.id, invitation.id));
  await recordAudit({ tenantId: invitation.tenantId, actorUserId: input.userId, action: "member.invitation_accepted", resourceType: "tenantInvitation", resourceId: String(invitation.id) });
  return { tenantId: invitation.tenantId };
}

export async function updateTenantMember(tenantId: number, memberId: number, input: { role?: TenantRole; status?: "ativo" | "suspenso" }) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  await db.update(tenantMembers).set(input).where(and(eq(tenantMembers.tenantId, tenantId), eq(tenantMembers.id, memberId)));
  const members = await db.select().from(tenantMembers).where(and(eq(tenantMembers.tenantId, tenantId), eq(tenantMembers.id, memberId))).limit(1);
  return members[0];
}

export async function recordAudit(input: {
  tenantId: number;
  actorUserId?: number | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditLogs).values({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId ?? null,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    metadata: input.metadata ?? null,
  });
}

export async function listAuditLog(tenantId: number, limit = 30) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.tenantId, tenantId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

export async function listDocumentsForTenant(tenantId: number, filters?: { status?: "novo" | "processado" | "em_revisao" | "arquivado"; query?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(documents.tenantId, tenantId)];
  if (filters?.status) conditions.push(eq(documents.status, filters.status));
  if (filters?.query?.trim()) {
    const value = `%${filters.query.trim()}%`;
    conditions.push(or(like(documents.originalFilename, value), like(documents.entityName, value), like(documents.documentNumber, value))!);
  }
  const rows = await db
    .select({ ...getTableColumns(documents), crmExternalId: businessEntities.externalCrmId, crmLastSyncAt: businessEntities.lastCrmSyncAt })
    .from(documents)
    .leftJoin(businessEntities, and(eq(documents.entityId, businessEntities.id), eq(businessEntities.tenantId, tenantId)))
    .where(and(...conditions))
    .orderBy(desc(documents.createdAt));
  return rows.map(row => ({
    ...row,
    crmStatus: resolveDocumentCrmStatus(row.entityId, row.crmExternalId),
  }));
}

export async function getOcrProcessingConfigForTenant(tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  const rows = await db.select().from(ocrProcessingConfigs).where(eq(ocrProcessingConfigs.tenantId, tenantId)).limit(1);
  if (rows[0]) return rows[0];
  await db.insert(ocrProcessingConfigs).values({ tenantId });
  const created = await db.select().from(ocrProcessingConfigs).where(eq(ocrProcessingConfigs.tenantId, tenantId)).limit(1);
  if (!created[0]) throw new Error("Não foi possível criar a configuração de OCR.");
  return created[0];
}

export async function updateOcrProcessingConfig(tenantId: number, input: { automaticEnabled?: boolean; scheduleCronTaskUid?: string | null; batchSize?: number; model?: string }) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  await getOcrProcessingConfigForTenant(tenantId);
  await db.update(ocrProcessingConfigs).set(input).where(eq(ocrProcessingConfigs.tenantId, tenantId));
  return getOcrProcessingConfigForTenant(tenantId);
}

export async function getOcrProcessingConfigByTaskUid(taskUid: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(ocrProcessingConfigs).where(eq(ocrProcessingConfigs.scheduleCronTaskUid, taskUid)).limit(1);
  return rows[0];
}

export async function enqueueDocumentProcessingJob(input: { tenantId: number; documentId: number; requestedByUserId?: number | null; trigger: "upload" | "manual" | "automatic" }) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  const document = await getDocumentForTenant(input.tenantId, input.documentId);
  if (!document) return undefined;
  const active = await db.select().from(documentProcessingJobs).where(and(eq(documentProcessingJobs.tenantId, input.tenantId), eq(documentProcessingJobs.documentId, input.documentId), or(eq(documentProcessingJobs.status, "pendente"), eq(documentProcessingJobs.status, "em_processamento")))).limit(1);
  if (active[0]) return active[0];
  await db.insert(documentProcessingJobs).values({ tenantId: input.tenantId, documentId: input.documentId, requestedByUserId: input.requestedByUserId ?? null, trigger: input.trigger });
  const queued = await db.select().from(documentProcessingJobs).where(and(eq(documentProcessingJobs.tenantId, input.tenantId), eq(documentProcessingJobs.documentId, input.documentId), eq(documentProcessingJobs.status, "pendente"))).orderBy(desc(documentProcessingJobs.id)).limit(1);
  return queued[0];
}

export async function listDocumentProcessingJobsForTenant(tenantId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(documentProcessingJobs).where(eq(documentProcessingJobs.tenantId, tenantId)).orderBy(desc(documentProcessingJobs.createdAt)).limit(200);
}

export async function getDocumentProcessingJobForTenant(tenantId: number, id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(documentProcessingJobs).where(and(eq(documentProcessingJobs.tenantId, tenantId), eq(documentProcessingJobs.id, id))).limit(1);
  return rows[0];
}

export async function claimNextDocumentProcessingJob(tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  const candidates = await db.select().from(documentProcessingJobs).where(and(eq(documentProcessingJobs.tenantId, tenantId), eq(documentProcessingJobs.status, "pendente"))).orderBy(asc(documentProcessingJobs.createdAt)).limit(20);
  const candidate = candidates.find(job => canClaimOcrJob(job));
  if (!candidate) return undefined;
  await db.update(documentProcessingJobs).set({ status: "em_processamento", attemptCount: candidate.attemptCount + 1, startedAt: new Date(), lastError: null }).where(and(eq(documentProcessingJobs.tenantId, tenantId), eq(documentProcessingJobs.id, candidate.id), eq(documentProcessingJobs.status, "pendente")));
  const claimed = await getDocumentProcessingJobForTenant(tenantId, candidate.id);
  return claimed?.status === "em_processamento" ? claimed : undefined;
}

export async function completeDocumentProcessingJob(tenantId: number, id: number, input: { extractedText: string; suggestion: Record<string, unknown>; confidence: number }) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  await db.update(documentProcessingJobs).set({ status: "concluido", extractedText: input.extractedText, suggestion: input.suggestion, confidence: input.confidence, completedAt: new Date(), lastError: null }).where(and(eq(documentProcessingJobs.tenantId, tenantId), eq(documentProcessingJobs.id, id), eq(documentProcessingJobs.status, "em_processamento")));
  return getDocumentProcessingJobForTenant(tenantId, id);
}

export async function failDocumentProcessingJob(tenantId: number, id: number, message: string) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  const job = await getDocumentProcessingJobForTenant(tenantId, id);
  if (!job) return undefined;
  const status = statusAfterOcrFailure(job.attemptCount, job.maxAttempts);
  await db.update(documentProcessingJobs).set({ status, lastError: message.slice(0, 2000), completedAt: status === "falhou" ? new Date() : null }).where(and(eq(documentProcessingJobs.tenantId, tenantId), eq(documentProcessingJobs.id, id), eq(documentProcessingJobs.status, "em_processamento")));
  return getDocumentProcessingJobForTenant(tenantId, id);
}

export async function getDocumentForTenant(tenantId: number, id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(documents).where(and(eq(documents.tenantId, tenantId), eq(documents.id, id))).limit(1);
  return result[0];
}

export async function moveDocumentToFolder(tenantId: number, id: number, finalFolder: string) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  await db.update(documents).set({ finalFolder }).where(and(eq(documents.tenantId, tenantId), eq(documents.id, id)));
  return getDocumentForTenant(tenantId, id);
}

export async function findDocumentDuplicates(
  tenantId: number,
  candidate: { sha256: string; documentNumber?: string; totalCents?: number; documentDate?: string },
) {
  const db = await getDb();
  if (!db) return [] as Array<{ id: number; originalFilename: string; duplicateType: "hash" | "heuristic" }>;
  const hashMatches = await db.select({ id: documents.id, originalFilename: documents.originalFilename }).from(documents).where(and(eq(documents.tenantId, tenantId), eq(documents.sha256, candidate.sha256)));
  const duplicates: Array<{ id: number; originalFilename: string; duplicateType: "hash" | "heuristic" }> = hashMatches.map(item => ({ ...item, duplicateType: "hash" }));
  if (candidate.documentNumber && candidate.totalCents !== undefined && candidate.documentDate) {
    const heuristicMatches = await db
      .select({ id: documents.id, originalFilename: documents.originalFilename })
      .from(documents)
      .where(and(
        eq(documents.tenantId, tenantId),
        eq(documents.documentNumber, candidate.documentNumber),
        eq(documents.totalCents, candidate.totalCents),
        eq(documents.documentDate, candidate.documentDate),
      ));
    for (const match of heuristicMatches) {
      if (!duplicates.some(existing => existing.id === match.id)) duplicates.push({ ...match, duplicateType: "heuristic" });
    }
  }
  return duplicates;
}

export async function listFolderRulesForTenant(tenantId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(folderRules).where(and(eq(folderRules.tenantId, tenantId), eq(folderRules.enabled, true))).orderBy(asc(folderRules.priority));
}

export async function createFolderRule(input: typeof folderRules.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  const result = await db.insert(folderRules).values(input);
  const id = Number((result as unknown as { insertId: number }).insertId);
  const rows = await db.select().from(folderRules).where(and(eq(folderRules.tenantId, input.tenantId), eq(folderRules.id, id))).limit(1);
  if (!rows[0]) throw new Error("Não foi possível guardar a regra.");
  return rows[0];
}

export async function removeFolderRuleForTenant(tenantId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  await db.delete(folderRules).where(and(eq(folderRules.tenantId, tenantId), eq(folderRules.id, id)));
}

export async function listBankImportTemplatesForTenant(tenantId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(bankImportTemplates).where(eq(bankImportTemplates.tenantId, tenantId)).orderBy(desc(bankImportTemplates.updatedAt));
}

export async function saveBankImportTemplate(input: typeof bankImportTemplates.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  await db.insert(bankImportTemplates).values(input).onDuplicateKeyUpdate({
    set: { mapping: input.mapping, dateFormat: input.dateFormat, decimalSeparator: input.decimalSeparator, createdByUserId: input.createdByUserId },
  });
  const rows = await db.select().from(bankImportTemplates).where(and(eq(bankImportTemplates.tenantId, input.tenantId), eq(bankImportTemplates.name, input.name))).limit(1);
  if (!rows[0]) throw new Error("Não foi possível guardar o modelo de importação.");
  return rows[0];
}

export async function findDuplicateBankImport(tenantId: number, input: { fileHash: string; periodStart: string | null; periodEnd: string | null; rowCount: number }) {
  const db = await getDb();
  if (!db) return undefined;
  const hashMatches = await db.select().from(bankImports).where(and(eq(bankImports.tenantId, tenantId), eq(bankImports.fileHash, input.fileHash))).limit(1);
  if (hashMatches[0]) return hashMatches[0];
  if (input.periodStart && input.periodEnd) {
    const periodMatches = await db.select().from(bankImports).where(and(eq(bankImports.tenantId, tenantId), eq(bankImports.periodStart, input.periodStart), eq(bankImports.periodEnd, input.periodEnd), eq(bankImports.rowCount, input.rowCount))).limit(1);
    return periodMatches[0];
  }
  return undefined;
}

export async function createBankImportWithTransactions(input: {
  tenantId: number;
  uploadedByUserId: number;
  templateId?: number | null;
  filename: string;
  fileHash: string;
  periodStart: string | null;
  periodEnd: string | null;
  rowCount: number;
  transactions: Array<{ transactionDate: string; description: string; amountCents: number; balanceCents: number | null; reference: string | null; rawRow: Record<string, string> }>;
}) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  const result = await db.insert(bankImports).values({ tenantId: input.tenantId, uploadedByUserId: input.uploadedByUserId, templateId: input.templateId ?? null, filename: input.filename, fileHash: input.fileHash, periodStart: input.periodStart, periodEnd: input.periodEnd, rowCount: input.rowCount });
  const bankImportId = Number((result as unknown as { insertId: number }).insertId);
  if (input.transactions.length) {
    await db.insert(bankTransactions).values(input.transactions.map(transaction => ({ tenantId: input.tenantId, bankImportId, transactionDate: transaction.transactionDate, description: transaction.description, amountCents: transaction.amountCents, balanceCents: transaction.balanceCents, reference: transaction.reference, rawRow: transaction.rawRow })));
  }
  return { id: bankImportId };
}

export async function listBankTransactionsForTenant(tenantId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(bankTransactions).where(eq(bankTransactions.tenantId, tenantId)).orderBy(desc(bankTransactions.transactionDate), desc(bankTransactions.id)).limit(200);
}

export async function createFinancialRecordFromDocument(input: { tenantId: number; documentId: number; documentType: "fatura_recebida" | "fatura_emitida" | "recibo" | "comprovativo" | "encomenda" | "outro"; documentNumber?: string | null; entityName?: string | null; documentDate?: string | null; totalCents?: number | null; currency: string }) {
  if (input.totalCents === null || input.totalCents === undefined) return;
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  const existing = await db.select().from(financialRecords).where(and(eq(financialRecords.tenantId, input.tenantId), eq(financialRecords.documentId, input.documentId))).limit(1);
  if (existing[0]) return existing[0];
  const result = await db.insert(financialRecords).values({ tenantId: input.tenantId, documentId: input.documentId, recordType: input.documentType === "fatura_emitida" ? "invoice" : "expense", externalReference: input.documentNumber ?? null, counterparty: input.entityName ?? null, recordDate: input.documentDate ?? null, amountCents: input.totalCents, currency: input.currency });
  const id = Number((result as unknown as { insertId: number }).insertId);
  const rows = await db.select().from(financialRecords).where(and(eq(financialRecords.tenantId, input.tenantId), eq(financialRecords.id, id))).limit(1);
  return rows[0];
}

export async function listPaymentSchedulesForTenant(tenantId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(paymentSchedules).where(eq(paymentSchedules.tenantId, tenantId)).orderBy(asc(paymentSchedules.dueDate), desc(paymentSchedules.id)).limit(500);
}

export async function listPaymentApprovalPoliciesForTenant(tenantId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(paymentApprovalPolicies).where(eq(paymentApprovalPolicies.tenantId, tenantId)).orderBy(desc(paymentApprovalPolicies.minAmountCents));
}

export async function createPaymentApprovalPolicy(input: typeof paymentApprovalPolicies.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  const result = await db.insert(paymentApprovalPolicies).values(input);
  const id = Number((result as unknown as { insertId: number }).insertId);
  const rows = await db.select().from(paymentApprovalPolicies).where(and(eq(paymentApprovalPolicies.tenantId, input.tenantId), eq(paymentApprovalPolicies.id, id))).limit(1);
  if (!rows[0]) throw new Error("Não foi possível criar a política de aprovação.");
  return rows[0];
}

export async function updatePaymentApprovalPolicyForTenant(tenantId: number, id: number, input: { name?: string; minAmountCents?: number; categoryId?: number | null; requiredRole?: "admin" | "contabilidade" | "operador" | "aprovador"; enabled?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  await db.update(paymentApprovalPolicies).set(input).where(and(eq(paymentApprovalPolicies.tenantId, tenantId), eq(paymentApprovalPolicies.id, id)));
  const rows = await db.select().from(paymentApprovalPolicies).where(and(eq(paymentApprovalPolicies.tenantId, tenantId), eq(paymentApprovalPolicies.id, id))).limit(1);
  return rows[0];
}

export async function deletePaymentApprovalPolicyForTenant(tenantId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  await db.delete(paymentApprovalPolicies).where(and(eq(paymentApprovalPolicies.tenantId, tenantId), eq(paymentApprovalPolicies.id, id)));
}

export async function createPaymentSchedule(input: typeof paymentSchedules.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  const result = await db.insert(paymentSchedules).values(input);
  const id = Number((result as unknown as { insertId: number }).insertId);
  const rows = await db.select().from(paymentSchedules).where(and(eq(paymentSchedules.tenantId, input.tenantId), eq(paymentSchedules.id, id))).limit(1);
  if (!rows[0]) throw new Error("Não foi possível criar o pagamento.");
  return rows[0];
}

export async function updatePaymentScheduleForTenant(tenantId: number, id: number, input: { counterparty?: string; entityId?: number | null; debitAccountId?: number | null; categoryId?: number | null; dueDate?: string; amountCents?: number; currency?: string; status?: "pendente" | "pago" | "cancelado"; approvalStatus?: "proposta" | "aprovada" | "rejeitada"; approvedByUserId?: number | null; approvedAt?: Date | null; paidAt?: string | null; notes?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  await db.update(paymentSchedules).set(input).where(and(eq(paymentSchedules.tenantId, tenantId), eq(paymentSchedules.id, id)));
  const rows = await db.select().from(paymentSchedules).where(and(eq(paymentSchedules.tenantId, tenantId), eq(paymentSchedules.id, id))).limit(1);
  return rows[0];
}

export async function createOrUpdatePaymentFromDocument(input: { tenantId: number; documentId: number; createdByUserId: number; documentType: "fatura_recebida" | "fatura_emitida" | "recibo" | "comprovativo" | "encomenda" | "outro"; entityId?: number | null; entityName: string | null; dueDate: string | null; totalCents: number | null; currency: string; source?: "manual" | "ocr" | "crm" }) {
  if (input.documentType !== "fatura_recebida" || !input.dueDate || input.totalCents === null) return undefined;
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  await db.insert(paymentSchedules).values({ tenantId: input.tenantId, documentId: input.documentId, entityId: input.entityId ?? null, createdByUserId: input.createdByUserId, counterparty: input.entityName || "Entidade não identificada", dueDate: input.dueDate, amountCents: input.totalCents, currency: input.currency, approvalStatus: "proposta", source: input.source ?? "manual" }).onDuplicateKeyUpdate({ set: { entityId: input.entityId ?? null, counterparty: input.entityName || "Entidade não identificada", dueDate: input.dueDate, amountCents: input.totalCents, currency: input.currency, source: input.source ?? "manual" } });
  const rows = await db.select().from(paymentSchedules).where(and(eq(paymentSchedules.tenantId, input.tenantId), eq(paymentSchedules.documentId, input.documentId))).limit(1);
  return rows[0];
}

export async function generateReconciliationSuggestions(tenantId: number, matcher: (transaction: { id: number; transactionDate: string; description: string; amountCents: number; reference: string | null }, candidate: { id: number; amountCents: number; recordDate: string | null; externalReference: string | null; orderNumber: string | null; counterparty: string | null; documentNumber: string | null }) => { financialRecordId: number; strength: "forte" | "media" | "fraca"; score: number; rationale: Record<string, unknown> } | null) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  const transactions = await db.select().from(bankTransactions).where(and(eq(bankTransactions.tenantId, tenantId), or(eq(bankTransactions.reconciliationStatus, "por_conciliar"), eq(bankTransactions.reconciliationStatus, "sugerida"))));
  const candidates = await db.select({ record: financialRecords, documentNumber: documents.documentNumber }).from(financialRecords).leftJoin(documents, and(eq(financialRecords.documentId, documents.id), eq(documents.tenantId, tenantId))).where(eq(financialRecords.tenantId, tenantId));
  let created = 0;
  for (const transaction of transactions) {
    let best: ReturnType<typeof matcher> = null;
    for (const item of candidates) {
      const result = matcher(transaction, { ...item.record, documentNumber: item.documentNumber });
      if (result && (!best || result.score > best.score)) best = result;
    }
    if (best) {
      await db.insert(reconciliationSuggestions).values({ tenantId, bankTransactionId: transaction.id, financialRecordId: best.financialRecordId, strength: best.strength, score: best.score, rationale: best.rationale }).onDuplicateKeyUpdate({ set: { strength: best.strength, score: best.score, rationale: best.rationale } });
      await db.update(bankTransactions).set({ reconciliationStatus: "sugerida" }).where(and(eq(bankTransactions.tenantId, tenantId), eq(bankTransactions.id, transaction.id)));
      created += 1;
    }
  }
  return created;
}

export async function listReconciliationSuggestionsForTenant(tenantId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ suggestion: reconciliationSuggestions, transaction: bankTransactions, record: financialRecords, document: documents }).from(reconciliationSuggestions).innerJoin(bankTransactions, and(eq(reconciliationSuggestions.bankTransactionId, bankTransactions.id), eq(bankTransactions.tenantId, tenantId))).innerJoin(financialRecords, and(eq(reconciliationSuggestions.financialRecordId, financialRecords.id), eq(financialRecords.tenantId, tenantId))).leftJoin(documents, and(eq(financialRecords.documentId, documents.id), eq(documents.tenantId, tenantId))).where(and(eq(reconciliationSuggestions.tenantId, tenantId), eq(reconciliationSuggestions.status, "pendente"))).orderBy(desc(reconciliationSuggestions.score));
}

export async function reviewReconciliationSuggestion(tenantId: number, id: number, reviewerId: number, decision: "aceite" | "rejeitada") {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  const suggestions = await db.select().from(reconciliationSuggestions).where(and(eq(reconciliationSuggestions.tenantId, tenantId), eq(reconciliationSuggestions.id, id), eq(reconciliationSuggestions.status, "pendente"))).limit(1);
  const suggestion = suggestions[0];
  if (!suggestion) return undefined;
  const reviewedAt = new Date();
  if (decision === "aceite") {
    const records = await db.select().from(financialRecords).where(and(eq(financialRecords.tenantId, tenantId), eq(financialRecords.id, suggestion.financialRecordId))).limit(1);
    const record = records[0];
    if (!record) return undefined;
    await db.insert(reconciliations).values({ tenantId, bankTransactionId: suggestion.bankTransactionId, financialRecordId: suggestion.financialRecordId, documentId: record.documentId ?? null, suggestionId: suggestion.id, acceptedByUserId: reviewerId });
    await db.update(reconciliationSuggestions).set({ status: "rejeitada", reviewedByUserId: reviewerId, reviewedAt }).where(and(eq(reconciliationSuggestions.tenantId, tenantId), eq(reconciliationSuggestions.bankTransactionId, suggestion.bankTransactionId), eq(reconciliationSuggestions.status, "pendente")));
    await db.update(reconciliationSuggestions).set({ status: "aceite", reviewedByUserId: reviewerId, reviewedAt }).where(and(eq(reconciliationSuggestions.tenantId, tenantId), eq(reconciliationSuggestions.id, id)));
    await db.update(bankTransactions).set({ reconciliationStatus: "conciliada" }).where(and(eq(bankTransactions.tenantId, tenantId), eq(bankTransactions.id, suggestion.bankTransactionId)));
  } else {
    await db.update(reconciliationSuggestions).set({ status: "rejeitada", reviewedByUserId: reviewerId, reviewedAt }).where(and(eq(reconciliationSuggestions.tenantId, tenantId), eq(reconciliationSuggestions.id, id)));
    await db.update(bankTransactions).set({ reconciliationStatus: "por_conciliar" }).where(and(eq(bankTransactions.tenantId, tenantId), eq(bankTransactions.id, suggestion.bankTransactionId)));
  }
  return suggestion;
}

export async function createDocument(input: typeof documents.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  const result = await db.insert(documents).values(input);
  const id = Number((result as unknown as { insertId: number }).insertId);
  const document = await getDocumentForTenant(input.tenantId, id);
  if (!document) throw new Error("Não foi possível guardar o documento.");
  return document;
}

export async function updateDocumentForTenant(
  tenantId: number,
  id: number,
  input: {
    documentType: "fatura_recebida" | "fatura_emitida" | "recibo" | "comprovativo" | "encomenda" | "outro";
    status: "novo" | "processado" | "em_revisao" | "arquivado";
    entityName: string | null;
    entityId?: number | null;
    nif: string | null;
    documentNumber: string | null;
    documentDate: string | null;
    dueDate: string | null;
    totalCents: number | null;
    vatCents: number | null;
    tags: string[];
    finalFolder: string | null;
  },
) {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível.");
  await db.update(documents).set(input).where(and(eq(documents.tenantId, tenantId), eq(documents.id, id)));
  return getDocumentForTenant(tenantId, id);
}
