CREATE TABLE `outlookConnections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`connectedByUserId` int NOT NULL,
	`microsoftTenantId` varchar(96),
	`mailboxAddress` varchar(320) NOT NULL,
	`graphUserId` varchar(160),
	`refreshTokenCiphertext` text,
	`tokenExpiresAt` timestamp,
	`status` enum('nao_configurada','autorizada','expirada','erro','desligada') NOT NULL DEFAULT 'nao_configurada',
	`lastImportedAt` timestamp,
	`lastError` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `outlookConnections_id` PRIMARY KEY(`id`),
	CONSTRAINT `outlookConnections_tenant_mailbox_uq` UNIQUE(`tenantId`,`mailboxAddress`)
);
--> statement-breakpoint
CREATE TABLE `outlookImportRuns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`outlookConnectionId` int NOT NULL,
	`triggeredByUserId` int NOT NULL,
	`status` enum('simulada','concluida','parcial','falhou') NOT NULL,
	`messageCount` int NOT NULL DEFAULT 0,
	`attachmentCount` int NOT NULL DEFAULT 0,
	`importedDocumentCount` int NOT NULL DEFAULT 0,
	`summary` json,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `outlookImportRuns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `outlookConnections_tenant_status_idx` ON `outlookConnections` (`tenantId`,`status`);--> statement-breakpoint
CREATE INDEX `outlookImportRuns_tenant_connection_idx` ON `outlookImportRuns` (`tenantId`,`outlookConnectionId`,`startedAt`);