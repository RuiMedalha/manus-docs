CREATE TABLE `businessEntities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`entityType` enum('fornecedor','cliente','ambos') NOT NULL,
	`status` enum('proposto','ativo','arquivado') NOT NULL DEFAULT 'proposto',
	`name` varchar(255) NOT NULL,
	`normalizedName` varchar(255) NOT NULL,
	`nif` varchar(32),
	`email` varchar(320),
	`phone` varchar(64),
	`address` text,
	`externalCrmId` varchar(160),
	`lastCrmSyncAt` timestamp,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `businessEntities_id` PRIMARY KEY(`id`),
	CONSTRAINT `businessEntities_tenant_nif_uq` UNIQUE(`tenantId`,`nif`)
);
--> statement-breakpoint
CREATE TABLE `crmConnections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`provider` varchar(80) NOT NULL,
	`displayName` varchar(120) NOT NULL,
	`baseUrl` varchar(512),
	`status` enum('nao_configurada','configurada','erro','desligada') NOT NULL DEFAULT 'nao_configurada',
	`fieldMapping` json,
	`lastSyncAt` timestamp,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `crmConnections_id` PRIMARY KEY(`id`),
	CONSTRAINT `crmConnections_tenant_provider_uq` UNIQUE(`tenantId`,`provider`)
);
--> statement-breakpoint
CREATE TABLE `financialAccounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`accountType` enum('banco','despesa','receita','iva','outro') NOT NULL,
	`code` varchar(32) NOT NULL,
	`name` varchar(160) NOT NULL,
	`iban` varchar(64),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `financialAccounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `financialAccounts_tenant_code_uq` UNIQUE(`tenantId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `financialCategories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`direction` enum('despesa','receita') NOT NULL,
	`code` varchar(32) NOT NULL,
	`name` varchar(160) NOT NULL,
	`accountId` int,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `financialCategories_id` PRIMARY KEY(`id`),
	CONSTRAINT `financialCategories_tenant_code_uq` UNIQUE(`tenantId`,`code`)
);
--> statement-breakpoint
ALTER TABLE `documents` ADD `entityId` int;--> statement-breakpoint
ALTER TABLE `paymentSchedules` ADD `entityId` int;--> statement-breakpoint
ALTER TABLE `paymentSchedules` ADD `debitAccountId` int;--> statement-breakpoint
ALTER TABLE `paymentSchedules` ADD `categoryId` int;--> statement-breakpoint
ALTER TABLE `paymentSchedules` ADD `approvalStatus` enum('proposta','aprovada','rejeitada') DEFAULT 'proposta' NOT NULL;--> statement-breakpoint
ALTER TABLE `paymentSchedules` ADD `source` enum('manual','ocr','crm') DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `paymentSchedules` ADD `approvedByUserId` int;--> statement-breakpoint
ALTER TABLE `paymentSchedules` ADD `approvedAt` timestamp;--> statement-breakpoint
CREATE INDEX `businessEntities_tenant_name_idx` ON `businessEntities` (`tenantId`,`normalizedName`);--> statement-breakpoint
CREATE INDEX `businessEntities_tenant_type_idx` ON `businessEntities` (`tenantId`,`entityType`,`status`);--> statement-breakpoint
CREATE INDEX `financialAccounts_tenant_type_idx` ON `financialAccounts` (`tenantId`,`accountType`,`isActive`);--> statement-breakpoint
CREATE INDEX `financialCategories_tenant_direction_idx` ON `financialCategories` (`tenantId`,`direction`,`isActive`);