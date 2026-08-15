CREATE TABLE `auditLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`actorUserId` int,
	`action` varchar(80) NOT NULL,
	`resourceType` varchar(80) NOT NULL,
	`resourceId` varchar(80),
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bankImportTemplates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`mapping` json NOT NULL,
	`dateFormat` varchar(32) NOT NULL DEFAULT 'DD/MM/YYYY',
	`decimalSeparator` enum('virgula','ponto') NOT NULL DEFAULT 'virgula',
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bankImportTemplates_id` PRIMARY KEY(`id`),
	CONSTRAINT `bankImportTemplates_tenant_name_uq` UNIQUE(`tenantId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `bankImports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`uploadedByUserId` int NOT NULL,
	`templateId` int,
	`filename` varchar(255) NOT NULL,
	`fileHash` varchar(64) NOT NULL,
	`periodStart` date,
	`periodEnd` date,
	`rowCount` int NOT NULL,
	`importedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `bankImports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bankTransactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`bankImportId` int NOT NULL,
	`transactionDate` date NOT NULL,
	`description` text NOT NULL,
	`amountCents` bigint NOT NULL,
	`balanceCents` bigint,
	`reference` varchar(160),
	`rawRow` json NOT NULL,
	`reconciliationStatus` enum('por_conciliar','sugerida','conciliada','ignorada') NOT NULL DEFAULT 'por_conciliar',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `bankTransactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`uploadedByUserId` int NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`originalFilename` varchar(255) NOT NULL,
	`contentType` varchar(120) NOT NULL,
	`sizeBytes` bigint NOT NULL,
	`sha256` varchar(64) NOT NULL,
	`origin` enum('upload','email','scanner','mobile','whatsapp') NOT NULL DEFAULT 'upload',
	`documentType` enum('fatura_recebida','fatura_emitida','recibo','comprovativo','encomenda','outro') NOT NULL DEFAULT 'outro',
	`status` enum('novo','processado','em_revisao','arquivado') NOT NULL DEFAULT 'novo',
	`entityName` varchar(255),
	`nif` varchar(32),
	`documentNumber` varchar(100),
	`documentDate` date,
	`dueDate` date,
	`totalCents` bigint,
	`vatCents` bigint,
	`currency` varchar(3) NOT NULL DEFAULT 'EUR',
	`tags` json,
	`suggestedFolder` varchar(512),
	`finalFolder` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `financialRecords` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`documentId` int,
	`recordType` enum('expense','invoice','payment') NOT NULL,
	`externalReference` varchar(160),
	`orderNumber` varchar(160),
	`counterparty` varchar(255),
	`recordDate` date,
	`amountCents` bigint NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'EUR',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `financialRecords_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `folderRules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`priority` int NOT NULL DEFAULT 100,
	`enabled` boolean NOT NULL DEFAULT true,
	`documentType` varchar(40),
	`entityName` varchar(255),
	`emailDomain` varchar(255),
	`keyword` varchar(255),
	`folderTemplate` varchar(512) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `folderRules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `integrationConnections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`provider` enum('woocommerce','ifthenpay','moloni') NOT NULL,
	`displayName` varchar(120) NOT NULL,
	`status` enum('nao_configurada','configurada','erro','desligada') NOT NULL DEFAULT 'nao_configurada',
	`configuration` json,
	`lastSyncAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `integrationConnections_id` PRIMARY KEY(`id`),
	CONSTRAINT `integrationConnections_tenant_provider_uq` UNIQUE(`tenantId`,`provider`)
);
--> statement-breakpoint
CREATE TABLE `reconciliationSuggestions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`bankTransactionId` int NOT NULL,
	`financialRecordId` int NOT NULL,
	`documentId` int,
	`strength` enum('forte','media','fraca') NOT NULL,
	`score` int NOT NULL,
	`rationale` json NOT NULL,
	`status` enum('pendente','aceite','rejeitada') NOT NULL DEFAULT 'pendente',
	`reviewedByUserId` int,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reconciliationSuggestions_id` PRIMARY KEY(`id`),
	CONSTRAINT `reconciliationSuggestions_transaction_record_uq` UNIQUE(`tenantId`,`bankTransactionId`,`financialRecordId`)
);
--> statement-breakpoint
CREATE TABLE `tenantInvitations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`role` enum('admin','contabilidade','operador','aprovador') NOT NULL DEFAULT 'operador',
	`tokenHash` varchar(128) NOT NULL,
	`status` enum('pendente','aceite','revogado','expirado') NOT NULL DEFAULT 'pendente',
	`expiresAt` timestamp NOT NULL,
	`invitedByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tenantInvitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenantInvitations_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `tenantMembers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('admin','contabilidade','operador','aprovador') NOT NULL DEFAULT 'operador',
	`status` enum('ativo','convidado','suspenso') NOT NULL DEFAULT 'ativo',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tenantMembers_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenantMembers_tenant_user_uq` UNIQUE(`tenantId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`slug` varchar(96) NOT NULL,
	`folderPattern` varchar(255) NOT NULL DEFAULT '/{Ano}/{Mes}/{Tipo}/{Entidade}',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tenants_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenants_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE INDEX `auditLogs_tenant_created_idx` ON `auditLogs` (`tenantId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `auditLogs_resource_idx` ON `auditLogs` (`tenantId`,`resourceType`,`resourceId`);--> statement-breakpoint
CREATE INDEX `bankImports_tenant_hash_idx` ON `bankImports` (`tenantId`,`fileHash`);--> statement-breakpoint
CREATE INDEX `bankImports_tenant_period_idx` ON `bankImports` (`tenantId`,`periodStart`,`periodEnd`);--> statement-breakpoint
CREATE INDEX `bankTransactions_tenant_date_idx` ON `bankTransactions` (`tenantId`,`transactionDate`);--> statement-breakpoint
CREATE INDEX `bankTransactions_tenant_reference_idx` ON `bankTransactions` (`tenantId`,`reference`);--> statement-breakpoint
CREATE INDEX `documents_tenant_status_idx` ON `documents` (`tenantId`,`status`);--> statement-breakpoint
CREATE INDEX `documents_tenant_sha_idx` ON `documents` (`tenantId`,`sha256`);--> statement-breakpoint
CREATE INDEX `documents_tenant_number_idx` ON `documents` (`tenantId`,`documentNumber`);--> statement-breakpoint
CREATE INDEX `financialRecords_tenant_reference_idx` ON `financialRecords` (`tenantId`,`externalReference`);--> statement-breakpoint
CREATE INDEX `financialRecords_tenant_amount_idx` ON `financialRecords` (`tenantId`,`amountCents`);--> statement-breakpoint
CREATE INDEX `folderRules_tenant_priority_idx` ON `folderRules` (`tenantId`,`priority`);--> statement-breakpoint
CREATE INDEX `reconciliationSuggestions_tenant_status_idx` ON `reconciliationSuggestions` (`tenantId`,`status`);--> statement-breakpoint
CREATE INDEX `tenantInvitations_tenant_idx` ON `tenantInvitations` (`tenantId`);--> statement-breakpoint
CREATE INDEX `tenantMembers_user_idx` ON `tenantMembers` (`userId`);