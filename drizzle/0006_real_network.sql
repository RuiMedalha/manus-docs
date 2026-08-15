CREATE TABLE `paymentSchedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`documentId` int,
	`createdByUserId` int NOT NULL,
	`counterparty` varchar(255) NOT NULL,
	`dueDate` date NOT NULL,
	`amountCents` bigint NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'EUR',
	`status` enum('pendente','pago','cancelado') NOT NULL DEFAULT 'pendente',
	`paidAt` date,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `paymentSchedules_id` PRIMARY KEY(`id`),
	CONSTRAINT `paymentSchedules_tenant_document_uq` UNIQUE(`tenantId`,`documentId`)
);
--> statement-breakpoint
CREATE INDEX `paymentSchedules_tenant_due_idx` ON `paymentSchedules` (`tenantId`,`dueDate`,`status`);