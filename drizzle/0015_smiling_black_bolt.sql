CREATE TABLE `taxReviewProposals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`documentId` int NOT NULL,
	`taxCategory` enum('alimentacao','combustivel','utilidades','outro') NOT NULL,
	`ruleCode` varchar(96) NOT NULL,
	`ruleVersion` varchar(40) NOT NULL,
	`reviewStatus` enum('pendente','confirmado_contabilista','excecao','rejeitado') NOT NULL DEFAULT 'pendente',
	`vatOriginalCents` bigint NOT NULL,
	`vatDeductibleCents` bigint,
	`vatNonDeductibleCents` bigint,
	`rationale` text NOT NULL,
	`preparedByUserId` int NOT NULL,
	`reviewedByUserId` int,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `taxReviewProposals_id` PRIMARY KEY(`id`),
	CONSTRAINT `taxReviewProposals_tenant_document_uq` UNIQUE(`tenantId`,`documentId`)
);
--> statement-breakpoint
CREATE INDEX `taxReviewProposals_tenant_status_idx` ON `taxReviewProposals` (`tenantId`,`reviewStatus`,`updatedAt`);