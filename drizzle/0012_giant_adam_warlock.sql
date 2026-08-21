CREATE TABLE `supplierPaymentProfiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`entityId` int NOT NULL,
	`paymentMethod` enum('manual','transferencia','cartao','debito_direto') NOT NULL DEFAULT 'manual',
	`paymentTermsDays` int,
	`paymentWindowMinDays` int,
	`paymentWindowMaxDays` int,
	`defaultDebitAccountId` int,
	`defaultCategoryId` int,
	`finalFolder` varchar(512),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `supplierPaymentProfiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `supplierPaymentProfiles_tenant_entity_uq` UNIQUE(`tenantId`,`entityId`)
);
--> statement-breakpoint
ALTER TABLE `paymentSchedules` ADD `paymentMethod` enum('manual','transferencia','cartao','debito_direto') DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `paymentSchedules` ADD `settlementSource` enum('manual','bank_reconciliation');--> statement-breakpoint
ALTER TABLE `paymentSchedules` ADD `bankTransactionId` int;--> statement-breakpoint
CREATE INDEX `supplierPaymentProfiles_tenant_method_idx` ON `supplierPaymentProfiles` (`tenantId`,`paymentMethod`,`isActive`);--> statement-breakpoint
CREATE INDEX `paymentSchedules_tenant_method_idx` ON `paymentSchedules` (`tenantId`,`paymentMethod`,`status`);