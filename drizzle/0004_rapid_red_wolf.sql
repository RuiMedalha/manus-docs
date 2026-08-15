CREATE TABLE `reconciliations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`bankTransactionId` int NOT NULL,
	`financialRecordId` int NOT NULL,
	`documentId` int,
	`suggestionId` int,
	`acceptedByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reconciliations_id` PRIMARY KEY(`id`),
	CONSTRAINT `reconciliations_tenant_transaction_uq` UNIQUE(`tenantId`,`bankTransactionId`)
);
--> statement-breakpoint
CREATE INDEX `reconciliations_tenant_record_idx` ON `reconciliations` (`tenantId`,`financialRecordId`);