CREATE TABLE `localAuthCredentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`userId` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`resetTokenHash` varchar(64),
	`resetExpiresAt` timestamp,
	`failedAttempts` int NOT NULL DEFAULT 0,
	`lockedUntil` timestamp,
	`lastPasswordChangedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `localAuthCredentials_id` PRIMARY KEY(`id`),
	CONSTRAINT `localAuthCredentials_email_uq` UNIQUE(`email`),
	CONSTRAINT `localAuthCredentials_user_uq` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `localAuthSessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`userId` int NOT NULL,
	`refreshTokenHash` varchar(64) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`revokedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `localAuthSessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `localAuthSessions_token_uq` UNIQUE(`refreshTokenHash`)
);
--> statement-breakpoint
CREATE INDEX `localAuthCredentials_tenant_idx` ON `localAuthCredentials` (`tenantId`);--> statement-breakpoint
CREATE INDEX `localAuthSessions_tenant_user_idx` ON `localAuthSessions` (`tenantId`,`userId`);