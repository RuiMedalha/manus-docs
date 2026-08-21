CREATE TABLE `tocOnlineExports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`documentId` int NOT NULL,
	`status` enum('nao_preparado','pronto_para_revisao','aprovado_para_envio','enviado','falhou') NOT NULL DEFAULT 'nao_preparado',
	`exportReference` varchar(96) NOT NULL,
	`payloadSnapshot` json NOT NULL,
	`preparedByUserId` int NOT NULL,
	`preparedAt` timestamp NOT NULL DEFAULT (now()),
	`approvedByUserId` int,
	`approvedAt` timestamp,
	`sentByUserId` int,
	`sentAt` timestamp,
	`externalDocumentId` varchar(160),
	`responseSummary` json,
	`lastError` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tocOnlineExports_id` PRIMARY KEY(`id`),
	CONSTRAINT `tocOnlineExports_tenant_document_uq` UNIQUE(`tenantId`,`documentId`),
	CONSTRAINT `tocOnlineExports_tenant_reference_uq` UNIQUE(`tenantId`,`exportReference`)
);
--> statement-breakpoint
CREATE INDEX `tocOnlineExports_tenant_status_idx` ON `tocOnlineExports` (`tenantId`,`status`,`updatedAt`);