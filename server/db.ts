import { and, asc, desc, eq, like, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createHash, randomUUID } from "node:crypto";
import {
  auditLogs,
  bankImportTemplates,
  bankImports,
  bankTransactions,
  documents,
  financialRecords,
  folderRules,
  integrationConnections,
  InsertUser,
  reconciliationSuggestions,
  reconciliations,
  tenantInvitations,
  tenantMembers,
  tenants,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { normaliseSlug, type TenantRole } from "./security";

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
  return db.select().from(documents).where(and(...conditions)).orderBy(desc(documents.createdAt));
}

export async function getDocumentForTenant(tenantId: number, id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(documents).where(and(eq(documents.tenantId, tenantId), eq(documents.id, id))).limit(1);
  return result[0];
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
