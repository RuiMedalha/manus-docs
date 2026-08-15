CREATE TABLE `documentProcessingJobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`documentId` int NOT NULL,
	`requestedByUserId` int,
	`trigger` enum('upload','manual','automatic') NOT NULL,
	`status` enum('pendente','em_processamento','concluido','falhou','ignorado') NOT NULL DEFAULT 'pendente',
	`attemptCount` int NOT NULL DEFAULT 0,
	`maxAttempts` int NOT NULL DEFAULT 3,
	`extractedText` text,
	`suggestion` json,
	`confidence` int,
	`lastError` text,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `documentProcessingJobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ocrProcessingConfigs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`automaticEnabled` boolean NOT NULL DEFAULT false,
	`scheduleCronTaskUid` varchar(65),
	`model` varchar(80) NOT NULL DEFAULT 'gemini-3-flash-preview',
	`batchSize` int NOT NULL DEFAULT 2,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ocrProcessingConfigs_id` PRIMARY KEY(`id`),
	CONSTRAINT `ocrProcessingConfigs_tenant_uq` UNIQUE(`tenantId`)
);
--> statement-breakpoint
CREATE INDEX `documentProcessingJobs_tenant_status_idx` ON `documentProcessingJobs` (`tenantId`,`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `documentProcessingJobs_tenant_document_idx` ON `documentProcessingJobs` (`tenantId`,`documentId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `ocrProcessingConfigs_schedule_idx` ON `ocrProcessingConfigs` (`scheduleCronTaskUid`);