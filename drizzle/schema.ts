import {
  bigint,
  boolean,
  date,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  /** Escopo técnico da identidade da plataforma; os dados de negócio usam o tenant do membro ativo. */
  tenantId: int("tenantId").default(0).notNull(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const localAuthCredentials = mysqlTable(
  "localAuthCredentials",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    userId: int("userId").notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
    resetTokenHash: varchar("resetTokenHash", { length: 64 }),
    resetExpiresAt: timestamp("resetExpiresAt"),
    failedAttempts: int("failedAttempts").default(0).notNull(),
    lockedUntil: timestamp("lockedUntil"),
    lastPasswordChangedAt: timestamp("lastPasswordChangedAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("localAuthCredentials_email_uq").on(table.email),
    uniqueIndex("localAuthCredentials_user_uq").on(table.userId),
    index("localAuthCredentials_tenant_idx").on(table.tenantId),
  ],
);

export const localAuthSessions = mysqlTable(
  "localAuthSessions",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    userId: int("userId").notNull(),
    refreshTokenHash: varchar("refreshTokenHash", { length: 64 }).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    revokedAt: timestamp("revokedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("localAuthSessions_token_uq").on(table.refreshTokenHash),
    index("localAuthSessions_tenant_user_idx").on(table.tenantId, table.userId),
  ],
);

export const tenants = mysqlTable("tenants", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  slug: varchar("slug", { length: 96 }).notNull().unique(),
  folderPattern: varchar("folderPattern", { length: 255 })
    .default("/{Ano}/{Mes}/{Tipo}/{Entidade}")
    .notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const tenantMembers = mysqlTable(
  "tenantMembers",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    userId: int("userId").notNull(),
    role: mysqlEnum("role", ["admin", "contabilidade", "operador", "aprovador"])
      .default("operador")
      .notNull(),
    status: mysqlEnum("status", ["ativo", "convidado", "suspenso"])
      .default("ativo")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("tenantMembers_tenant_user_uq").on(table.tenantId, table.userId),
    index("tenantMembers_user_idx").on(table.userId),
  ],
);

export const tenantInvitations = mysqlTable(
  "tenantInvitations",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    role: mysqlEnum("role", ["admin", "contabilidade", "operador", "aprovador"])
      .default("operador")
      .notNull(),
    tokenHash: varchar("tokenHash", { length: 128 }).notNull().unique(),
    status: mysqlEnum("status", ["pendente", "aceite", "revogado", "expirado"])
      .default("pendente")
      .notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    invitedByUserId: int("invitedByUserId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("tenantInvitations_tenant_idx").on(table.tenantId)],
);

export const auditLogs = mysqlTable(
  "auditLogs",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    actorUserId: int("actorUserId"),
    action: varchar("action", { length: 80 }).notNull(),
    resourceType: varchar("resourceType", { length: 80 }).notNull(),
    resourceId: varchar("resourceId", { length: 80 }),
    metadata: json("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("auditLogs_tenant_created_idx").on(table.tenantId, table.createdAt),
    index("auditLogs_resource_idx").on(table.tenantId, table.resourceType, table.resourceId),
  ],
);

export const documents = mysqlTable(
  "documents",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    uploadedByUserId: int("uploadedByUserId").notNull(),
    fileKey: varchar("fileKey", { length: 512 }).notNull(),
    originalFilename: varchar("originalFilename", { length: 255 }).notNull(),
    contentType: varchar("contentType", { length: 120 }).notNull(),
    sizeBytes: bigint("sizeBytes", { mode: "number" }).notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    origin: mysqlEnum("origin", ["upload", "email", "scanner", "mobile", "whatsapp"])
      .default("upload")
      .notNull(),
    sourceAddress: varchar("sourceAddress", { length: 320 }),
    documentType: mysqlEnum("documentType", [
      "fatura_recebida",
      "fatura_emitida",
      "recibo",
      "comprovativo",
      "encomenda",
      "outro",
    ])
      .default("outro")
      .notNull(),
    status: mysqlEnum("status", ["novo", "processado", "em_revisao", "arquivado"])
      .default("novo")
      .notNull(),
    entityName: varchar("entityName", { length: 255 }),
    entityId: int("entityId"),
    nif: varchar("nif", { length: 32 }),
    documentNumber: varchar("documentNumber", { length: 100 }),
    documentDate: date("documentDate", { mode: "string" }),
    dueDate: date("dueDate", { mode: "string" }),
    totalCents: bigint("totalCents", { mode: "number" }),
    vatCents: bigint("vatCents", { mode: "number" }),
    currency: varchar("currency", { length: 3 }).default("EUR").notNull(),
    tags: json("tags"),
    suggestedFolder: varchar("suggestedFolder", { length: 512 }),
    finalFolder: varchar("finalFolder", { length: 512 }),
    paymentLifecycle: mysqlEnum("paymentLifecycle", ["nao_aplicavel", "a_pagar", "aguarda_debito_direto", "paga", "conciliada"])
      .default("nao_aplicavel")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("documents_tenant_status_idx").on(table.tenantId, table.status),
    index("documents_tenant_sha_idx").on(table.tenantId, table.sha256),
    index("documents_tenant_number_idx").on(table.tenantId, table.documentNumber),
  ],
);

export const businessEntities = mysqlTable(
  "businessEntities",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    entityType: mysqlEnum("entityType", ["fornecedor", "cliente", "ambos"]).notNull(),
    status: mysqlEnum("status", ["proposto", "ativo", "arquivado"]).default("proposto").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    normalizedName: varchar("normalizedName", { length: 255 }).notNull(),
    nif: varchar("nif", { length: 32 }),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 64 }),
    address: text("address"),
    externalCrmId: varchar("externalCrmId", { length: 160 }),
    lastCrmSyncAt: timestamp("lastCrmSyncAt"),
    createdByUserId: int("createdByUserId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("businessEntities_tenant_nif_uq").on(table.tenantId, table.nif),
    index("businessEntities_tenant_name_idx").on(table.tenantId, table.normalizedName),
    index("businessEntities_tenant_type_idx").on(table.tenantId, table.entityType, table.status),
  ],
);

export const supplierPaymentProfiles = mysqlTable(
  "supplierPaymentProfiles",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    entityId: int("entityId").notNull(),
    paymentMethod: mysqlEnum("paymentMethod", ["manual", "transferencia", "cartao", "debito_direto"])
      .default("manual")
      .notNull(),
    paymentTermsDays: int("paymentTermsDays"),
    paymentWindowMinDays: int("paymentWindowMinDays"),
    paymentWindowMaxDays: int("paymentWindowMaxDays"),
    defaultDebitAccountId: int("defaultDebitAccountId"),
    defaultCategoryId: int("defaultCategoryId"),
    finalFolder: varchar("finalFolder", { length: 512 }),
    isActive: boolean("isActive").default(true).notNull(),
    createdByUserId: int("createdByUserId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("supplierPaymentProfiles_tenant_entity_uq").on(table.tenantId, table.entityId),
    index("supplierPaymentProfiles_tenant_method_idx").on(table.tenantId, table.paymentMethod, table.isActive),
  ],
);

export const tocOnlineExports = mysqlTable(
  "tocOnlineExports",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    documentId: int("documentId").notNull(),
    status: mysqlEnum("status", ["nao_preparado", "pronto_para_revisao", "aprovado_para_envio", "enviado", "falhou"])
      .default("nao_preparado")
      .notNull(),
    exportReference: varchar("exportReference", { length: 96 }).notNull(),
    payloadSnapshot: json("payloadSnapshot").notNull(),
    preparedByUserId: int("preparedByUserId").notNull(),
    preparedAt: timestamp("preparedAt").defaultNow().notNull(),
    approvedByUserId: int("approvedByUserId"),
    approvedAt: timestamp("approvedAt"),
    sentByUserId: int("sentByUserId"),
    sentAt: timestamp("sentAt"),
    externalDocumentId: varchar("externalDocumentId", { length: 160 }),
    responseSummary: json("responseSummary"),
    lastError: text("lastError"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("tocOnlineExports_tenant_document_uq").on(table.tenantId, table.documentId),
    uniqueIndex("tocOnlineExports_tenant_reference_uq").on(table.tenantId, table.exportReference),
    index("tocOnlineExports_tenant_status_idx").on(table.tenantId, table.status, table.updatedAt),
  ],
);

export const taxReviewProposals = mysqlTable(
  "taxReviewProposals",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    documentId: int("documentId").notNull(),
    taxCategory: mysqlEnum("taxCategory", ["alimentacao", "combustivel", "utilidades", "outro"]).notNull(),
    ruleCode: varchar("ruleCode", { length: 96 }).notNull(),
    ruleVersion: varchar("ruleVersion", { length: 40 }).notNull(),
    reviewStatus: mysqlEnum("reviewStatus", ["pendente", "confirmado_contabilista", "excecao", "rejeitado"])
      .default("pendente")
      .notNull(),
    vatOriginalCents: bigint("vatOriginalCents", { mode: "number" }).notNull(),
    vatDeductibleCents: bigint("vatDeductibleCents", { mode: "number" }),
    vatNonDeductibleCents: bigint("vatNonDeductibleCents", { mode: "number" }),
    rationale: text("rationale").notNull(),
    preparedByUserId: int("preparedByUserId").notNull(),
    reviewedByUserId: int("reviewedByUserId"),
    reviewedAt: timestamp("reviewedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("taxReviewProposals_tenant_document_uq").on(table.tenantId, table.documentId),
    index("taxReviewProposals_tenant_status_idx").on(table.tenantId, table.reviewStatus, table.updatedAt),
  ],
);

export const financialAccounts = mysqlTable(
  "financialAccounts",
  {
    id: int("id").autoincrement().primaryKey(), tenantId: int("tenantId").notNull(),
    accountType: mysqlEnum("accountType", ["banco", "despesa", "receita", "iva", "outro"]).notNull(),
    code: varchar("code", { length: 32 }).notNull(), name: varchar("name", { length: 160 }).notNull(), iban: varchar("iban", { length: 64 }),
    isActive: boolean("isActive").default(true).notNull(), createdByUserId: int("createdByUserId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("financialAccounts_tenant_code_uq").on(table.tenantId, table.code), index("financialAccounts_tenant_type_idx").on(table.tenantId, table.accountType, table.isActive)],
);

export const financialCategories = mysqlTable(
  "financialCategories",
  {
    id: int("id").autoincrement().primaryKey(), tenantId: int("tenantId").notNull(),
    direction: mysqlEnum("direction", ["despesa", "receita"]).notNull(), code: varchar("code", { length: 32 }).notNull(), name: varchar("name", { length: 160 }).notNull(),
    accountId: int("accountId"), isActive: boolean("isActive").default(true).notNull(), createdByUserId: int("createdByUserId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("financialCategories_tenant_code_uq").on(table.tenantId, table.code), index("financialCategories_tenant_direction_idx").on(table.tenantId, table.direction, table.isActive)],
);

export const crmConnections = mysqlTable(
  "crmConnections",
  {
    id: int("id").autoincrement().primaryKey(), tenantId: int("tenantId").notNull(), provider: varchar("provider", { length: 80 }).notNull(), displayName: varchar("displayName", { length: 120 }).notNull(),
    baseUrl: varchar("baseUrl", { length: 512 }), contactPath: varchar("contactPath", { length: 255 }).default("/contacts").notNull(),
    syncMethod: mysqlEnum("syncMethod", ["POST", "PUT", "PATCH"]).default("POST").notNull(), authType: mysqlEnum("authType", ["bearer", "api_key", "basic", "none"]).default("bearer").notNull(),
    secretEnvKey: varchar("secretEnvKey", { length: 120 }), externalIdPath: varchar("externalIdPath", { length: 120 }).default("id").notNull(),
    status: mysqlEnum("status", ["nao_configurada", "configurada", "erro", "desligada"]).default("nao_configurada").notNull(),
    fieldMapping: json("fieldMapping"), lastSyncAt: timestamp("lastSyncAt"), createdByUserId: int("createdByUserId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("crmConnections_tenant_provider_uq").on(table.tenantId, table.provider)],
);

export const crmSyncRuns = mysqlTable(
  "crmSyncRuns",
  {
    id: int("id").autoincrement().primaryKey(), tenantId: int("tenantId").notNull(), crmConnectionId: int("crmConnectionId").notNull(), triggeredByUserId: int("triggeredByUserId").notNull(),
    status: mysqlEnum("status", ["em_curso", "concluida", "parcial", "falhou", "simulada"]).notNull(), totalCount: int("totalCount").default(0).notNull(), succeededCount: int("succeededCount").default(0).notNull(), failedCount: int("failedCount").default(0).notNull(),
    summary: json("summary"), startedAt: timestamp("startedAt").defaultNow().notNull(), completedAt: timestamp("completedAt"),
  },
  table => [index("crmSyncRuns_tenant_connection_idx").on(table.tenantId, table.crmConnectionId, table.startedAt)],
);

export const outlookConnections = mysqlTable(
  "outlookConnections",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    connectedByUserId: int("connectedByUserId").notNull(),
    microsoftTenantId: varchar("microsoftTenantId", { length: 96 }),
    mailboxAddress: varchar("mailboxAddress", { length: 320 }).notNull(),
    graphUserId: varchar("graphUserId", { length: 160 }),
    refreshTokenCiphertext: text("refreshTokenCiphertext"),
    tokenExpiresAt: timestamp("tokenExpiresAt"),
    status: mysqlEnum("status", ["nao_configurada", "autorizada", "expirada", "erro", "desligada"])
      .default("nao_configurada")
      .notNull(),
    lastImportedAt: timestamp("lastImportedAt"),
    lastError: text("lastError"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("outlookConnections_tenant_mailbox_uq").on(table.tenantId, table.mailboxAddress),
    index("outlookConnections_tenant_status_idx").on(table.tenantId, table.status),
  ],
);

export const outlookImportRuns = mysqlTable(
  "outlookImportRuns",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    outlookConnectionId: int("outlookConnectionId").notNull(),
    triggeredByUserId: int("triggeredByUserId").notNull(),
    status: mysqlEnum("status", ["simulada", "concluida", "parcial", "falhou"])
      .notNull(),
    messageCount: int("messageCount").default(0).notNull(),
    attachmentCount: int("attachmentCount").default(0).notNull(),
    importedDocumentCount: int("importedDocumentCount").default(0).notNull(),
    summary: json("summary"),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
  },
  table => [index("outlookImportRuns_tenant_connection_idx").on(table.tenantId, table.outlookConnectionId, table.startedAt)],
);

export const ocrProcessingConfigs = mysqlTable(
  "ocrProcessingConfigs",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    automaticEnabled: boolean("automaticEnabled").default(false).notNull(),
    scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
    model: varchar("model", { length: 80 }).default("gemini-3-flash-preview").notNull(),
    batchSize: int("batchSize").default(2).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("ocrProcessingConfigs_tenant_uq").on(table.tenantId),
    index("ocrProcessingConfigs_schedule_idx").on(table.scheduleCronTaskUid),
  ],
);

export const documentProcessingJobs = mysqlTable(
  "documentProcessingJobs",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    documentId: int("documentId").notNull(),
    requestedByUserId: int("requestedByUserId"),
    trigger: mysqlEnum("trigger", ["upload", "manual", "automatic"]).notNull(),
    status: mysqlEnum("status", ["pendente", "em_processamento", "concluido", "falhou", "ignorado"])
      .default("pendente")
      .notNull(),
    attemptCount: int("attemptCount").default(0).notNull(),
    maxAttempts: int("maxAttempts").default(3).notNull(),
    extractedText: text("extractedText"),
    suggestion: json("suggestion"),
    confidence: int("confidence"),
    lastError: text("lastError"),
    startedAt: timestamp("startedAt"),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("documentProcessingJobs_tenant_status_idx").on(table.tenantId, table.status, table.createdAt),
    index("documentProcessingJobs_tenant_document_idx").on(table.tenantId, table.documentId, table.createdAt),
  ],
);

export const folderRules = mysqlTable(
  "folderRules",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    priority: int("priority").default(100).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    documentType: varchar("documentType", { length: 40 }),
    entityName: varchar("entityName", { length: 255 }),
    emailDomain: varchar("emailDomain", { length: 255 }),
    keyword: varchar("keyword", { length: 255 }),
    folderTemplate: varchar("folderTemplate", { length: 512 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("folderRules_tenant_priority_idx").on(table.tenantId, table.priority)],
);

export const bankImportTemplates = mysqlTable(
  "bankImportTemplates",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    mapping: json("mapping").notNull(),
    dateFormat: varchar("dateFormat", { length: 32 }).default("DD/MM/YYYY").notNull(),
    decimalSeparator: mysqlEnum("decimalSeparator", ["virgula", "ponto"])
      .default("virgula")
      .notNull(),
    createdByUserId: int("createdByUserId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("bankImportTemplates_tenant_name_uq").on(table.tenantId, table.name)],
);

export const bankImports = mysqlTable(
  "bankImports",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    uploadedByUserId: int("uploadedByUserId").notNull(),
    templateId: int("templateId"),
    filename: varchar("filename", { length: 255 }).notNull(),
    fileHash: varchar("fileHash", { length: 64 }).notNull(),
    periodStart: date("periodStart", { mode: "string" }),
    periodEnd: date("periodEnd", { mode: "string" }),
    rowCount: int("rowCount").notNull(),
    importedAt: timestamp("importedAt").defaultNow().notNull(),
  },
  table => [
    index("bankImports_tenant_hash_idx").on(table.tenantId, table.fileHash),
    index("bankImports_tenant_period_idx").on(table.tenantId, table.periodStart, table.periodEnd),
  ],
);

export const bankTransactions = mysqlTable(
  "bankTransactions",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    bankImportId: int("bankImportId").notNull(),
    transactionDate: date("transactionDate", { mode: "string" }).notNull(),
    description: text("description").notNull(),
    amountCents: bigint("amountCents", { mode: "number" }).notNull(),
    balanceCents: bigint("balanceCents", { mode: "number" }),
    reference: varchar("reference", { length: 160 }),
    rawRow: json("rawRow").notNull(),
    reconciliationStatus: mysqlEnum("reconciliationStatus", ["por_conciliar", "sugerida", "conciliada", "ignorada"])
      .default("por_conciliar")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("bankTransactions_tenant_date_idx").on(table.tenantId, table.transactionDate),
    index("bankTransactions_tenant_reference_idx").on(table.tenantId, table.reference),
  ],
);

export const paymentSchedules = mysqlTable(
  "paymentSchedules",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    documentId: int("documentId"),
    entityId: int("entityId"),
    debitAccountId: int("debitAccountId"),
    categoryId: int("categoryId"),
    createdByUserId: int("createdByUserId").notNull(),
    counterparty: varchar("counterparty", { length: 255 }).notNull(),
    dueDate: date("dueDate", { mode: "string" }).notNull(),
    amountCents: bigint("amountCents", { mode: "number" }).notNull(),
    currency: varchar("currency", { length: 3 }).default("EUR").notNull(),
    paymentMethod: mysqlEnum("paymentMethod", ["manual", "transferencia", "cartao", "debito_direto"])
      .default("manual")
      .notNull(),
    status: mysqlEnum("status", ["pendente", "pago", "cancelado"]).default("pendente").notNull(),
    approvalStatus: mysqlEnum("approvalStatus", ["proposta", "aprovada", "rejeitada"]).default("proposta").notNull(),
    source: mysqlEnum("source", ["manual", "ocr", "crm"]).default("manual").notNull(),
    approvedByUserId: int("approvedByUserId"),
    approvedAt: timestamp("approvedAt"),
    paidAt: date("paidAt", { mode: "string" }),
    settlementSource: mysqlEnum("settlementSource", ["manual", "bank_reconciliation"]),
    bankTransactionId: int("bankTransactionId"),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("paymentSchedules_tenant_due_idx").on(table.tenantId, table.dueDate, table.status),
    index("paymentSchedules_tenant_method_idx").on(table.tenantId, table.paymentMethod, table.status),
    uniqueIndex("paymentSchedules_tenant_document_uq").on(table.tenantId, table.documentId),
  ],
);

export const paymentApprovalPolicies = mysqlTable(
  "paymentApprovalPolicies",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    minAmountCents: bigint("minAmountCents", { mode: "number" }).default(0).notNull(),
    categoryId: int("categoryId"),
    requiredRole: mysqlEnum("requiredRole", ["admin", "contabilidade", "operador", "aprovador"]).default("aprovador").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    createdByUserId: int("createdByUserId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("paymentApprovalPolicies_tenant_amount_idx").on(table.tenantId, table.minAmountCents, table.enabled)],
);

export const financialRecords = mysqlTable(
  "financialRecords",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    documentId: int("documentId"),
    recordType: mysqlEnum("recordType", ["expense", "invoice", "payment"])
      .notNull(),
    externalReference: varchar("externalReference", { length: 160 }),
    orderNumber: varchar("orderNumber", { length: 160 }),
    counterparty: varchar("counterparty", { length: 255 }),
    recordDate: date("recordDate", { mode: "string" }),
    amountCents: bigint("amountCents", { mode: "number" }).notNull(),
    currency: varchar("currency", { length: 3 }).default("EUR").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("financialRecords_tenant_reference_idx").on(table.tenantId, table.externalReference),
    index("financialRecords_tenant_amount_idx").on(table.tenantId, table.amountCents),
  ],
);

export const reconciliationSuggestions = mysqlTable(
  "reconciliationSuggestions",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    bankTransactionId: int("bankTransactionId").notNull(),
    financialRecordId: int("financialRecordId").notNull(),
    documentId: int("documentId"),
    strength: mysqlEnum("strength", ["forte", "media", "fraca"]).notNull(),
    score: int("score").notNull(),
    rationale: json("rationale").notNull(),
    status: mysqlEnum("status", ["pendente", "aceite", "rejeitada"])
      .default("pendente")
      .notNull(),
    reviewedByUserId: int("reviewedByUserId"),
    reviewedAt: timestamp("reviewedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("reconciliationSuggestions_tenant_status_idx").on(table.tenantId, table.status),
    uniqueIndex("reconciliationSuggestions_transaction_record_uq").on(
      table.tenantId,
      table.bankTransactionId,
      table.financialRecordId,
    ),
  ],
);

export const reconciliations = mysqlTable(
  "reconciliations",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    bankTransactionId: int("bankTransactionId").notNull(),
    financialRecordId: int("financialRecordId").notNull(),
    documentId: int("documentId"),
    suggestionId: int("suggestionId"),
    acceptedByUserId: int("acceptedByUserId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("reconciliations_tenant_transaction_uq").on(table.tenantId, table.bankTransactionId),
    index("reconciliations_tenant_record_idx").on(table.tenantId, table.financialRecordId),
  ],
);

export const integrationConnections = mysqlTable(
  "integrationConnections",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    provider: mysqlEnum("provider", ["woocommerce", "ifthenpay", "moloni"]).notNull(),
    displayName: varchar("displayName", { length: 120 }).notNull(),
    status: mysqlEnum("status", ["nao_configurada", "configurada", "erro", "desligada"])
      .default("nao_configurada")
      .notNull(),
    configuration: json("configuration"),
    lastSyncAt: timestamp("lastSyncAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("integrationConnections_tenant_provider_uq").on(table.tenantId, table.provider)],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type TenantMember = typeof tenantMembers.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type BankTransaction = typeof bankTransactions.$inferSelect;
