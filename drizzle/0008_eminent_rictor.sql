CREATE TABLE `crmSyncRuns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`crmConnectionId` int NOT NULL,
	`triggeredByUserId` int NOT NULL,
	`status` enum('em_curso','concluida','parcial','falhou','simulada') NOT NULL,
	`totalCount` int NOT NULL DEFAULT 0,
	`succeededCount` int NOT NULL DEFAULT 0,
	`failedCount` int NOT NULL DEFAULT 0,
	`summary` json,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `crmSyncRuns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `crmConnections` ADD `contactPath` varchar(255) DEFAULT '/contacts' NOT NULL;--> statement-breakpoint
ALTER TABLE `crmConnections` ADD `syncMethod` enum('POST','PUT','PATCH') DEFAULT 'POST' NOT NULL;--> statement-breakpoint
ALTER TABLE `crmConnections` ADD `authType` enum('bearer','api_key','basic','none') DEFAULT 'bearer' NOT NULL;--> statement-breakpoint
ALTER TABLE `crmConnections` ADD `secretEnvKey` varchar(120);--> statement-breakpoint
ALTER TABLE `crmConnections` ADD `externalIdPath` varchar(120) DEFAULT 'id' NOT NULL;--> statement-breakpoint
CREATE INDEX `crmSyncRuns_tenant_connection_idx` ON `crmSyncRuns` (`tenantId`,`crmConnectionId`,`startedAt`);