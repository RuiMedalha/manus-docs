CREATE TABLE `paymentApprovalPolicies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`minAmountCents` bigint NOT NULL DEFAULT 0,
	`categoryId` int,
	`requiredRole` enum('admin','contabilidade','operador','aprovador') NOT NULL DEFAULT 'aprovador',
	`enabled` boolean NOT NULL DEFAULT true,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `paymentApprovalPolicies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `paymentApprovalPolicies_tenant_amount_idx` ON `paymentApprovalPolicies` (`tenantId`,`minAmountCents`,`enabled`);