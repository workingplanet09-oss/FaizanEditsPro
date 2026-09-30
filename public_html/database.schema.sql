-- FaizanEdits Pro — MySQL / MariaDB schema
-- Generated from the live structure of the previous (PostgreSQL/Prisma) database by migration-tools/pg-to-mysql.mjs.
-- Requires MySQL 5.7+ or MariaDB 10.3+ (utf8mb4, JSON, fractional-second DATETIME).
-- Import this file with phpMyAdmin (Import tab) into an EMPTY database.

SET NAMES utf8mb4;
SET time_zone = '+00:00';
SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';

CREATE TABLE `onboarding_category_questions` (
  `categoryId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `questionId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (`categoryId`, `questionId`),
  KEY `onboarding_category_questions_questionId_idx` (`questionId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `activity_logs` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `actorId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `type` TEXT NOT NULL,
  `message` MEDIUMTEXT NOT NULL,
  `entityType` TEXT NULL DEFAULT NULL,
  `entityId` VARCHAR(191) NULL DEFAULT NULL,
  `projectId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `clientId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `leadId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `visibility` ENUM('CLIENT','INTERNAL') NOT NULL DEFAULT 'INTERNAL',
  `metadata` JSON NULL,
  `isDemo` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `activity_logs_clientId_createdAt_idx` (`clientId`, `createdAt`),
  KEY `activity_logs_leadId_createdAt_idx` (`leadId`, `createdAt`),
  KEY `activity_logs_projectId_createdAt_idx` (`projectId`, `createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `asset_folders` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `projectId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `name` TEXT NOT NULL,
  `sortOrder` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `asset_folders_projectId_key_key` (`projectId`, `key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `assets` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `projectId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `clientId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `leadId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `draftToken` VARCHAR(191) NULL DEFAULT NULL,
  `folderId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `uploadedById` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `filename` TEXT NOT NULL,
  `displayName` TEXT NOT NULL,
  `storageKey` VARCHAR(191) NOT NULL,
  `mimeType` TEXT NOT NULL,
  `sizeBytes` BIGINT NOT NULL DEFAULT 0,
  `version` INT NOT NULL DEFAULT 1,
  `versionGroup` VARCHAR(191) NULL DEFAULT NULL,
  `status` ENUM('UPLOADING','PROCESSING','READY','QUARANTINED','FAILED','DELETED') NOT NULL DEFAULT 'UPLOADING',
  `scanStatus` VARCHAR(255) NOT NULL DEFAULT 'pending',
  `thumbnailKey` TEXT NULL DEFAULT NULL,
  `durationMs` INT NULL DEFAULT NULL,
  `checksum` TEXT NULL DEFAULT NULL,
  `isDeliverable` TINYINT(1) NOT NULL DEFAULT 0,
  `deliverableLabel` TEXT NULL DEFAULT NULL,
  `visibleToClient` TINYINT(1) NOT NULL DEFAULT 1,
  `sharedToken` VARCHAR(191) NULL DEFAULT NULL,
  `isDemo` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deletedAt` DATETIME(3) NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `assets_clientId_idx` (`clientId`),
  KEY `assets_draftToken_idx` (`draftToken`),
  KEY `assets_leadId_idx` (`leadId`),
  KEY `assets_projectId_folderId_status_idx` (`projectId`, `folderId`, `status`),
  KEY `assets_projectId_versionGroup_idx` (`projectId`, `versionGroup`),
  UNIQUE KEY `assets_sharedToken_key` (`sharedToken`),
  UNIQUE KEY `assets_storageKey_key` (`storageKey`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `audit_logs` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `actorId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `actorLabel` TEXT NULL DEFAULT NULL,
  `action` TEXT NOT NULL,
  `entityType` VARCHAR(191) NOT NULL,
  `entityId` VARCHAR(191) NULL DEFAULT NULL,
  `message` MEDIUMTEXT NULL DEFAULT NULL,
  `metadata` JSON NULL,
  `ip` TEXT NULL DEFAULT NULL,
  `userAgent` TEXT NULL DEFAULT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `audit_logs_actorId_idx` (`actorId`),
  KEY `audit_logs_entityType_entityId_idx` (`entityType`, `entityId`),
  KEY `audit_logs_workspaceId_createdAt_idx` (`workspaceId`, `createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `auth_tokens` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `userId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `email` VARCHAR(191) NOT NULL,
  `type` ENUM('MAGIC_LINK','PASSWORD_RESET','INVITE','EMAIL_VERIFY') NOT NULL,
  `tokenHash` VARCHAR(191) NOT NULL,
  `meta` JSON NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `usedAt` DATETIME(3) NULL DEFAULT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `auth_tokens_email_type_idx` (`email`, `type`),
  UNIQUE KEY `auth_tokens_tokenHash_key` (`tokenHash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `automation_actions` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `automationId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `type` ENUM('EMAIL','NOTIFICATION','STATUS_UPDATE','CREATE_TASK','ADMIN_ALERT','CLIENT_REMINDER') NOT NULL,
  `config` JSON NOT NULL,
  `delayMinutes` INT NOT NULL DEFAULT 0,
  `sortOrder` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `automation_actions_automationId_sortOrder_idx` (`automationId`, `sortOrder`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `automation_runs` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `automationId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `event` TEXT NOT NULL,
  `entityId` VARCHAR(191) NULL DEFAULT NULL,
  `status` TEXT NOT NULL,
  `error` MEDIUMTEXT NULL DEFAULT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `automation_runs_automationId_createdAt_idx` (`automationId`, `createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `automations` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` TEXT NOT NULL,
  `description` MEDIUMTEXT NULL DEFAULT NULL,
  `event` VARCHAR(191) NOT NULL,
  `conditions` JSON NULL,
  `enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `isSystem` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `automations_workspaceId_event_enabled_idx` (`workspaceId`, `event`, `enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `blog_categories` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `name` TEXT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `blog_categories_workspaceId_slug_key` (`workspaceId`, `slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `blog_posts` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `title` TEXT NOT NULL,
  `excerpt` MEDIUMTEXT NULL DEFAULT NULL,
  `content` MEDIUMTEXT NOT NULL,
  `featuredImage` MEDIUMTEXT NULL DEFAULT NULL,
  `categoryId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `authorId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `authorName` TEXT NULL DEFAULT NULL,
  `seoTitle` TEXT NULL DEFAULT NULL,
  `metaDescription` MEDIUMTEXT NULL DEFAULT NULL,
  `tags` JSON NULL,
  `status` ENUM('DRAFT','PUBLISHED') NOT NULL DEFAULT 'DRAFT',
  `publishedAt` DATETIME(3) NULL DEFAULT NULL,
  `isDemo` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `blog_posts_workspaceId_slug_key` (`workspaceId`, `slug`),
  KEY `blog_posts_workspaceId_status_publishedAt_idx` (`workspaceId`, `status`, `publishedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `calendar_events` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `title` TEXT NOT NULL,
  `kind` VARCHAR(255) NOT NULL DEFAULT 'custom',
  `startsAt` DATETIME(3) NOT NULL,
  `endsAt` DATETIME(3) NULL DEFAULT NULL,
  `allDay` TINYINT(1) NOT NULL DEFAULT 0,
  `projectId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `clientId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `createdById` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `notes` MEDIUMTEXT NULL DEFAULT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `calendar_events_workspaceId_startsAt_idx` (`workspaceId`, `startsAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `case_studies` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `portfolioProjectId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `title` TEXT NOT NULL,
  `clientName` TEXT NOT NULL,
  `industry` TEXT NULL DEFAULT NULL,
  `summary` MEDIUMTEXT NULL DEFAULT NULL,
  `problem` MEDIUMTEXT NULL DEFAULT NULL,
  `objective` MEDIUMTEXT NULL DEFAULT NULL,
  `strategy` MEDIUMTEXT NULL DEFAULT NULL,
  `creativeDirection` MEDIUMTEXT NULL DEFAULT NULL,
  `beforeVideoUrl` MEDIUMTEXT NULL DEFAULT NULL,
  `afterVideoUrl` MEDIUMTEXT NULL DEFAULT NULL,
  `heroImage` MEDIUMTEXT NULL DEFAULT NULL,
  `results` JSON NULL,
  `clientFeedback` MEDIUMTEXT NULL DEFAULT NULL,
  `feedbackAuthor` TEXT NULL DEFAULT NULL,
  `deliverables` JSON NULL,
  `timeline` MEDIUMTEXT NULL DEFAULT NULL,
  `seoTitle` TEXT NULL DEFAULT NULL,
  `seoDescription` MEDIUMTEXT NULL DEFAULT NULL,
  `status` ENUM('DRAFT','PUBLISHED') NOT NULL DEFAULT 'PUBLISHED',
  `isDemo` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `case_studies_portfolioProjectId_key` (`portfolioProjectId`),
  UNIQUE KEY `case_studies_workspaceId_slug_key` (`workspaceId`, `slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `change_requests` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `projectId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `submittedById` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `whatChanged` MEDIUMTEXT NOT NULL,
  `why` MEDIUMTEXT NULL DEFAULT NULL,
  `additionalRequirements` MEDIUMTEXT NULL DEFAULT NULL,
  `referenceAssetIds` JSON NULL,
  `classification` ENUM('PENDING','INCLUDED','OUT_OF_SCOPE','ADDITIONAL_COST') NOT NULL DEFAULT 'PENDING',
  `staffNote` MEDIUMTEXT NULL DEFAULT NULL,
  `quoteId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `resolvedById` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `resolvedAt` DATETIME(3) NULL DEFAULT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `change_requests_projectId_idx` (`projectId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `client_brand_kits` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `clientId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `logoAssetId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `altLogoAssetIds` JSON NULL,
  `colors` JSON NULL,
  `fonts` JSON NULL,
  `typographyRules` MEDIUMTEXT NULL DEFAULT NULL,
  `guidelinesAssetId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `introAssetId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `outroAssetId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `watermarkAssetId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `lowerThirdAssetIds` JSON NULL,
  `musicPreference` TEXT NULL DEFAULT NULL,
  `socialHandles` JSON NULL,
  `websiteUrl` MEDIUMTEXT NULL DEFAULT NULL,
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `client_brand_kits_clientId_key` (`clientId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `client_profiles` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `clientId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `brandSummary` MEDIUMTEXT NULL DEFAULT NULL,
  `editingPreferences` MEDIUMTEXT NULL DEFAULT NULL,
  `preferredContact` TEXT NULL DEFAULT NULL,
  `communicationPrefs` JSON NULL,
  `checklist` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `client_profiles_clientId_key` (`clientId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `clients` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `organizationId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `userId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `name` TEXT NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `phone` TEXT NULL DEFAULT NULL,
  `companyName` TEXT NOT NULL,
  `industry` TEXT NULL DEFAULT NULL,
  `website` TEXT NULL DEFAULT NULL,
  `socialLinks` JSON NULL,
  `country` TEXT NULL DEFAULT NULL,
  `timezone` TEXT NULL DEFAULT NULL,
  `source` TEXT NULL DEFAULT NULL,
  `status` ENUM('LEAD','PROSPECT','ONBOARDING','ACTIVE','RETAINER','INACTIVE','ARCHIVED') NOT NULL DEFAULT 'PROSPECT',
  `tags` JSON NULL,
  `managerId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `lastContactAt` DATETIME(3) NULL DEFAULT NULL,
  `referralCode` VARCHAR(191) NULL DEFAULT NULL,
  `firstTime` TINYINT(1) NOT NULL DEFAULT 1,
  `isDemo` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `archivedAt` DATETIME(3) NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `clients_email_idx` (`email`),
  KEY `clients_organizationId_idx` (`organizationId`),
  UNIQUE KEY `clients_referralCode_key` (`referralCode`),
  KEY `clients_workspaceId_status_idx` (`workspaceId`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `contact_submissions` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` TEXT NOT NULL,
  `email` TEXT NOT NULL,
  `phone` TEXT NULL DEFAULT NULL,
  `company` TEXT NULL DEFAULT NULL,
  `reason` ENUM('GENERAL','PROJECT','PARTNERSHIP','AGENCY','CAREER') NOT NULL DEFAULT 'GENERAL',
  `message` MEDIUMTEXT NOT NULL,
  `source` TEXT NULL DEFAULT NULL,
  `utm` JSON NULL,
  `ip` TEXT NULL DEFAULT NULL,
  `handled` TINYINT(1) NOT NULL DEFAULT 0,
  `leadId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `isDemo` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `contact_submissions_workspaceId_createdAt_idx` (`workspaceId`, `createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `contract_signatures` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `contractVersionId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `signerUserId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `signerName` TEXT NOT NULL,
  `signerEmail` TEXT NOT NULL,
  `signatureData` MEDIUMTEXT NOT NULL,
  `signatureKind` VARCHAR(255) NOT NULL DEFAULT 'typed',
  `acceptedTerms` TINYINT(1) NOT NULL DEFAULT 1,
  `ip` TEXT NULL DEFAULT NULL,
  `userAgent` TEXT NULL DEFAULT NULL,
  `contentHash` TEXT NOT NULL,
  `signedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `contract_signatures_contractVersionId_idx` (`contractVersionId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `contract_versions` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `contractId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `version` INT NOT NULL,
  `sections` JSON NOT NULL,
  `variables` JSON NULL,
  `contentHash` TEXT NOT NULL,
  `createdById` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `contract_versions_contractId_version_key` (`contractId`, `version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `contracts` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `organizationId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `clientId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `projectId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `quoteId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `number` VARCHAR(191) NOT NULL,
  `title` TEXT NOT NULL,
  `status` ENUM('DRAFT','SENT','VIEWED','SIGNED','DECLINED','VOID') NOT NULL DEFAULT 'DRAFT',
  `currentVersion` INT NOT NULL DEFAULT 1,
  `sentAt` DATETIME(3) NULL DEFAULT NULL,
  `viewedAt` DATETIME(3) NULL DEFAULT NULL,
  `signedAt` DATETIME(3) NULL DEFAULT NULL,
  `signedById` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `declinedAt` DATETIME(3) NULL DEFAULT NULL,
  `createdById` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `isDemo` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `contracts_organizationId_status_idx` (`organizationId`, `status`),
  KEY `contracts_projectId_idx` (`projectId`),
  UNIQUE KEY `contracts_workspaceId_number_key` (`workspaceId`, `number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `counters` (
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `key` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `value` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`workspaceId`, `key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `email_logs` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `toEmail` VARCHAR(191) NOT NULL,
  `toUserId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `subject` TEXT NOT NULL,
  `body` MEDIUMTEXT NOT NULL,
  `templateKey` TEXT NULL DEFAULT NULL,
  `status` ENUM('QUEUED','SENT','FAILED','SKIPPED') NOT NULL DEFAULT 'QUEUED',
  `provider` TEXT NULL DEFAULT NULL,
  `providerMessageId` TEXT NULL DEFAULT NULL,
  `error` MEDIUMTEXT NULL DEFAULT NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `sentAt` DATETIME(3) NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `email_logs_toEmail_idx` (`toEmail`),
  KEY `email_logs_workspaceId_createdAt_idx` (`workspaceId`, `createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `email_templates` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `name` TEXT NOT NULL,
  `subject` TEXT NOT NULL,
  `body` MEDIUMTEXT NOT NULL,
  `variables` JSON NULL,
  `enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `email_templates_workspaceId_key_key` (`workspaceId`, `key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `faqs` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `category` VARCHAR(191) NOT NULL,
  `question` MEDIUMTEXT NOT NULL,
  `answer` MEDIUMTEXT NOT NULL,
  `serviceSlugs` JSON NULL,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `published` TINYINT(1) NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `faqs_workspaceId_category_idx` (`workspaceId`, `category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `file_requests` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `projectId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `requestedById` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `title` TEXT NOT NULL,
  `description` MEDIUMTEXT NULL DEFAULT NULL,
  `acceptedTypes` JSON NULL,
  `status` ENUM('OPEN','COMPLETED','CANCELLED') NOT NULL DEFAULT 'OPEN',
  `fulfilledAssetId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `fulfilledAt` DATETIME(3) NULL DEFAULT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `file_requests_projectId_status_idx` (`projectId`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `internal_notes` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `entityType` ENUM('LEAD','CLIENT','PROJECT','TASK','INVOICE') NOT NULL,
  `entityId` VARCHAR(191) NOT NULL,
  `authorId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `body` MEDIUMTEXT NOT NULL,
  `mentionUserIds` JSON NULL,
  `pinned` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `internal_notes_entityType_entityId_createdAt_idx` (`entityType`, `entityId`, `createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `invoice_items` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `invoiceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `description` MEDIUMTEXT NOT NULL,
  `quantity` DOUBLE NOT NULL DEFAULT 1,
  `unitPrice` INT NOT NULL,
  `amount` INT NOT NULL,
  `sortOrder` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `invoice_items_invoiceId_idx` (`invoiceId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `invoices` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `organizationId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `clientId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `projectId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `quoteId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `retainerId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `number` VARCHAR(191) NOT NULL,
  `kind` ENUM('DEPOSIT','BALANCE','FULL','RETAINER','CHANGE_ORDER','OTHER') NOT NULL DEFAULT 'FULL',
  `currency` VARCHAR(255) NOT NULL DEFAULT 'USD',
  `subtotal` INT NOT NULL DEFAULT 0,
  `discount` INT NOT NULL DEFAULT 0,
  `tax` INT NOT NULL DEFAULT 0,
  `total` INT NOT NULL DEFAULT 0,
  `amountPaid` INT NOT NULL DEFAULT 0,
  `status` ENUM('DRAFT','SENT','VIEWED','PARTIALLY_PAID','PAID','OVERDUE','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  `dueDate` DATETIME(3) NULL DEFAULT NULL,
  `issuedAt` DATETIME(3) NULL DEFAULT NULL,
  `sentAt` DATETIME(3) NULL DEFAULT NULL,
  `viewedAt` DATETIME(3) NULL DEFAULT NULL,
  `paidAt` DATETIME(3) NULL DEFAULT NULL,
  `paymentMethod` TEXT NULL DEFAULT NULL,
  `notes` MEDIUMTEXT NULL DEFAULT NULL,
  `createdById` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `isDemo` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `invoices_dueDate_status_idx` (`dueDate`, `status`),
  KEY `invoices_organizationId_status_idx` (`organizationId`, `status`),
  KEY `invoices_projectId_idx` (`projectId`),
  UNIQUE KEY `invoices_workspaceId_number_key` (`workspaceId`, `number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `jobs` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `type` TEXT NOT NULL,
  `payload` JSON NOT NULL,
  `status` ENUM('PENDING','RUNNING','DONE','FAILED') NOT NULL DEFAULT 'PENDING',
  `runAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `attempts` INT NOT NULL DEFAULT 0,
  `maxAttempts` INT NOT NULL DEFAULT 5,
  `lockedAt` DATETIME(3) NULL DEFAULT NULL,
  `lockedBy` TEXT NULL DEFAULT NULL,
  `lastError` MEDIUMTEXT NULL DEFAULT NULL,
  `dedupeKey` VARCHAR(191) NULL DEFAULT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completedAt` DATETIME(3) NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `jobs_dedupeKey_key` (`dedupeKey`),
  KEY `jobs_status_runAt_idx` (`status`, `runAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `kb_articles` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `title` TEXT NOT NULL,
  `content` MEDIUMTEXT NOT NULL,
  `category` VARCHAR(255) NOT NULL DEFAULT 'General',
  `sortOrder` INT NOT NULL DEFAULT 0,
  `published` TINYINT(1) NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `kb_articles_workspaceId_slug_key` (`workspaceId`, `slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `lead_activities` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `leadId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `type` TEXT NOT NULL,
  `title` TEXT NOT NULL,
  `metadata` JSON NULL,
  `actorId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `lead_activities_leadId_createdAt_idx` (`leadId`, `createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `lead_sources` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `label` TEXT NOT NULL,
  `isSystem` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `lead_sources_key_key` (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `leads` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `requestCode` VARCHAR(191) NOT NULL,
  `name` TEXT NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `phone` TEXT NULL DEFAULT NULL,
  `company` TEXT NULL DEFAULT NULL,
  `website` TEXT NULL DEFAULT NULL,
  `instagram` TEXT NULL DEFAULT NULL,
  `youtube` TEXT NULL DEFAULT NULL,
  `linkedin` TEXT NULL DEFAULT NULL,
  `industry` TEXT NULL DEFAULT NULL,
  `clientType` TEXT NULL DEFAULT NULL,
  `lookingFor` TEXT NULL DEFAULT NULL,
  `serviceSlug` TEXT NULL DEFAULT NULL,
  `projectType` TEXT NULL DEFAULT NULL,
  `budgetRange` TEXT NULL DEFAULT NULL,
  `budgetMax` INT NULL DEFAULT NULL,
  `stylePrefs` JSON NULL,
  `description` MEDIUMTEXT NULL DEFAULT NULL,
  `answers` JSON NULL,
  `sourceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `utmSource` TEXT NULL DEFAULT NULL,
  `utmMedium` TEXT NULL DEFAULT NULL,
  `utmCampaign` TEXT NULL DEFAULT NULL,
  `utmTerm` TEXT NULL DEFAULT NULL,
  `utmContent` TEXT NULL DEFAULT NULL,
  `referrer` TEXT NULL DEFAULT NULL,
  `referralCode` TEXT NULL DEFAULT NULL,
  `status` ENUM('NEW','CONTACTED','CALL_SCHEDULED','QUALIFIED','QUOTED','CONVERTED','LOST','ARCHIVED') NOT NULL DEFAULT 'NEW',
  `score` INT NOT NULL DEFAULT 0,
  `scoreBreakdown` JSON NULL,
  `temperature` ENUM('HOT','WARM','COLD','NEEDS_REVIEW') NOT NULL DEFAULT 'NEEDS_REVIEW',
  `temperatureOverride` ENUM('HOT','WARM','COLD','NEEDS_REVIEW') NULL DEFAULT NULL,
  `assignedToId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `lastContactAt` DATETIME(3) NULL DEFAULT NULL,
  `nextFollowUpAt` DATETIME(3) NULL DEFAULT NULL,
  `tags` JSON NULL,
  `lostReason` TEXT NULL DEFAULT NULL,
  `convertedClientId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `isDemo` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `existingClientId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `leads_assignedToId_idx` (`assignedToId`),
  KEY `leads_email_idx` (`email`),
  KEY `leads_existingClientId_idx` (`existingClientId`),
  UNIQUE KEY `leads_requestCode_key` (`requestCode`),
  KEY `leads_workspaceId_status_createdAt_idx` (`workspaceId`, `status`, `createdAt`),
  KEY `leads_workspaceId_temperature_idx` (`workspaceId`, `temperature`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `meetings` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `clientId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `leadId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `projectId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `hostId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `type` ENUM('DISCOVERY_CALL','PROJECT_CONSULTATION','CLIENT_REVIEW_CALL','STRATEGY_CALL') NOT NULL DEFAULT 'DISCOVERY_CALL',
  `title` TEXT NOT NULL,
  `name` TEXT NULL DEFAULT NULL,
  `email` TEXT NULL DEFAULT NULL,
  `startsAt` DATETIME(3) NOT NULL,
  `endsAt` DATETIME(3) NOT NULL,
  `timezone` TEXT NULL DEFAULT NULL,
  `meetingUrl` MEDIUMTEXT NULL DEFAULT NULL,
  `notes` MEDIUMTEXT NULL DEFAULT NULL,
  `status` ENUM('SCHEDULED','COMPLETED','CANCELLED','NO_SHOW') NOT NULL DEFAULT 'SCHEDULED',
  `isDemo` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `meetings_workspaceId_startsAt_idx` (`workspaceId`, `startsAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `message_attachments` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `messageId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `assetId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `message_attachments_messageId_assetId_key` (`messageId`, `assetId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `message_reads` (
  `messageId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `userId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `readAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`messageId`, `userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `messages` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `organizationId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `clientId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `projectId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `senderId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `recipientGroup` ENUM('PROJECT_MANAGER','EDITOR','SUPPORT','CLIENT') NOT NULL DEFAULT 'PROJECT_MANAGER',
  `body` MEDIUMTEXT NOT NULL,
  `mentionUserIds` JSON NULL,
  `links` JSON NULL,
  `isDemo` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `messages_clientId_createdAt_idx` (`clientId`, `createdAt`),
  KEY `messages_projectId_createdAt_idx` (`projectId`, `createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `newsletter_subscribers` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `newsletter_subscribers_workspaceId_email_key` (`workspaceId`, `email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `notification_preferences` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `userId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `category` ENUM('PROJECT','MESSAGE','PAYMENT','REVIEW','SYSTEM') NOT NULL,
  `inApp` TINYINT(1) NOT NULL DEFAULT 1,
  `email` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `notification_preferences_userId_category_key` (`userId`, `category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `notifications` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `userId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `category` ENUM('PROJECT','MESSAGE','PAYMENT','REVIEW','SYSTEM') NOT NULL DEFAULT 'SYSTEM',
  `type` TEXT NOT NULL,
  `title` TEXT NOT NULL,
  `message` MEDIUMTEXT NULL DEFAULT NULL,
  `link` TEXT NULL DEFAULT NULL,
  `readAt` DATETIME(3) NULL DEFAULT NULL,
  `isDemo` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `notifications_userId_readAt_createdAt_idx` (`userId`, `readAt`, `createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `oauth_accounts` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `userId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `provider` VARCHAR(191) NOT NULL,
  `providerAccountId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `oauth_accounts_provider_providerAccountId_key` (`provider`, `providerAccountId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `onboarding_categories` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `name` TEXT NOT NULL,
  `sortOrder` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `onboarding_categories_workspaceId_key_key` (`workspaceId`, `key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `onboarding_drafts` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `token` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `formKey` VARCHAR(191) NOT NULL,
  `subjectType` VARCHAR(191) NULL DEFAULT NULL,
  `subjectId` VARCHAR(191) NULL DEFAULT NULL,
  `data` JSON NOT NULL,
  `step` INT NOT NULL DEFAULT 0,
  `submittedAt` DATETIME(3) NULL DEFAULT NULL,
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `onboarding_drafts_subjectType_subjectId_idx` (`subjectType`, `subjectId`),
  UNIQUE KEY `onboarding_drafts_token_key` (`token`),
  KEY `onboarding_drafts_userId_formKey_idx` (`userId`, `formKey`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `onboarding_forms` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `name` TEXT NOT NULL,
  `description` MEDIUMTEXT NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `onboarding_forms_workspaceId_key_key` (`workspaceId`, `key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `onboarding_options` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `questionId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `label` TEXT NOT NULL,
  `value` MEDIUMTEXT NOT NULL,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `categoryKeys` JSON NULL,
  `icon` TEXT NULL DEFAULT NULL,
  `description` MEDIUMTEXT NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `onboarding_options_questionId_sortOrder_idx` (`questionId`, `sortOrder`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `onboarding_questions` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `formId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `sectionId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `text` MEDIUMTEXT NOT NULL,
  `helpText` MEDIUMTEXT NULL DEFAULT NULL,
  `placeholder` TEXT NULL DEFAULT NULL,
  `type` ENUM('TEXT','TEXTAREA','SELECT','MULTI_SELECT','RADIO','CHECKBOX','DATE','TIME','NUMBER','CURRENCY','FILE','URL','EMAIL','PHONE','COLOR','RATING') NOT NULL DEFAULT 'TEXT',
  `required` TINYINT(1) NOT NULL DEFAULT 0,
  `conditionalLogic` JSON NULL,
  `meta` JSON NULL,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `onboarding_questions_formId_key_key` (`formId`, `key`),
  KEY `onboarding_questions_formId_sectionId_sortOrder_idx` (`formId`, `sectionId`, `sortOrder`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `onboarding_responses` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `formKey` TEXT NOT NULL,
  `subjectType` VARCHAR(191) NOT NULL,
  `subjectId` VARCHAR(191) NOT NULL,
  `questionKey` VARCHAR(191) NOT NULL,
  `questionText` TEXT NOT NULL,
  `value` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `onboarding_responses_subjectType_subjectId_idx` (`subjectType`, `subjectId`),
  UNIQUE KEY `onboarding_responses_subjectType_subjectId_questionKey_key` (`subjectType`, `subjectId`, `questionKey`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `onboarding_sections` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `formId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `title` TEXT NOT NULL,
  `description` MEDIUMTEXT NULL DEFAULT NULL,
  `sortOrder` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `onboarding_sections_formId_key_key` (`formId`, `key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `organization_members` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `organizationId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `userId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `role` ENUM('OWNER','MANAGER','ASSISTANT','BILLING','MEMBER') NOT NULL DEFAULT 'MEMBER',
  `title` TEXT NULL DEFAULT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `organization_members_organizationId_userId_key` (`organizationId`, `userId`),
  KEY `organization_members_userId_idx` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `organizations` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` TEXT NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `website` TEXT NULL DEFAULT NULL,
  `logoUrl` MEDIUMTEXT NULL DEFAULT NULL,
  `billingEmail` TEXT NULL DEFAULT NULL,
  `billingAddress` MEDIUMTEXT NULL DEFAULT NULL,
  `taxId` TEXT NULL DEFAULT NULL,
  `defaultCurrency` VARCHAR(255) NOT NULL DEFAULT 'USD',
  `isDemo` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `organizations_workspaceId_idx` (`workspaceId`),
  UNIQUE KEY `organizations_workspaceId_slug_key` (`workspaceId`, `slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `payments` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `invoiceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `clientId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `organizationId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `amount` INT NOT NULL,
  `currency` TEXT NOT NULL,
  `provider` VARCHAR(191) NOT NULL,
  `transactionId` VARCHAR(191) NULL DEFAULT NULL,
  `method` TEXT NULL DEFAULT NULL,
  `status` ENUM('PENDING','SUCCEEDED','FAILED','REFUNDED') NOT NULL DEFAULT 'PENDING',
  `paidAt` DATETIME(3) NULL DEFAULT NULL,
  `metadata` JSON NULL,
  `isDemo` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `payments_invoiceId_idx` (`invoiceId`),
  KEY `payments_organizationId_idx` (`organizationId`),
  UNIQUE KEY `payments_provider_transactionId_key` (`provider`, `transactionId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `permissions` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `description` MEDIUMTEXT NULL DEFAULT NULL,
  `group` TEXT NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `permissions_key_key` (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `portfolio_projects` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `title` TEXT NOT NULL,
  `description` MEDIUMTEXT NULL DEFAULT NULL,
  `clientName` TEXT NULL DEFAULT NULL,
  `industry` TEXT NULL DEFAULT NULL,
  `category` TEXT NOT NULL,
  `projectType` TEXT NULL DEFAULT NULL,
  `platforms` JSON NULL,
  `videoUrl` MEDIUMTEXT NULL DEFAULT NULL,
  `thumbnailUrl` MEDIUMTEXT NULL DEFAULT NULL,
  `beforeVideoUrl` MEDIUMTEXT NULL DEFAULT NULL,
  `afterVideoUrl` MEDIUMTEXT NULL DEFAULT NULL,
  `results` JSON NULL,
  `testimonial` MEDIUMTEXT NULL DEFAULT NULL,
  `tags` JSON NULL,
  `featured` TINYINT(1) NOT NULL DEFAULT 0,
  `status` ENUM('DRAFT','PUBLISHED') NOT NULL DEFAULT 'PUBLISHED',
  `sortOrder` INT NOT NULL DEFAULT 0,
  `isDemo` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `portfolio_projects_workspaceId_slug_key` (`workspaceId`, `slug`),
  KEY `portfolio_projects_workspaceId_status_featured_idx` (`workspaceId`, `status`, `featured`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `pricing_plans` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` TEXT NOT NULL,
  `tier` TEXT NULL DEFAULT NULL,
  `description` MEDIUMTEXT NULL DEFAULT NULL,
  `price` INT NULL DEFAULT NULL,
  `currency` VARCHAR(255) NOT NULL DEFAULT 'USD',
  `billingType` ENUM('ONE_TIME','PER_VIDEO','PER_SHORT','MONTHLY_RETAINER','HOURLY','CUSTOM_QUOTE') NOT NULL DEFAULT 'ONE_TIME',
  `priceNote` TEXT NULL DEFAULT NULL,
  `includedVideos` INT NULL DEFAULT NULL,
  `includedShorts` INT NULL DEFAULT NULL,
  `includedRevisions` INT NULL DEFAULT NULL,
  `hoursIncluded` INT NULL DEFAULT NULL,
  `turnaround` TEXT NULL DEFAULT NULL,
  `resolution` TEXT NULL DEFAULT NULL,
  `motionGraphics` TINYINT(1) NOT NULL DEFAULT 0,
  `captions` TINYINT(1) NOT NULL DEFAULT 0,
  `soundDesign` TINYINT(1) NOT NULL DEFAULT 0,
  `prioritySupport` TINYINT(1) NOT NULL DEFAULT 0,
  `dedicatedEditor` TINYINT(1) NOT NULL DEFAULT 0,
  `storageGb` INT NULL DEFAULT NULL,
  `features` JSON NULL,
  `highlighted` TINYINT(1) NOT NULL DEFAULT 0,
  `ctaLabel` TEXT NULL DEFAULT NULL,
  `enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `isDemo` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `pricing_plans_workspaceId_enabled_idx` (`workspaceId`, `enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `project_briefs` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `projectId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `version` INT NOT NULL DEFAULT 1,
  `content` JSON NOT NULL,
  `status` VARCHAR(255) NOT NULL DEFAULT 'DRAFT',
  `confirmedAt` DATETIME(3) NULL DEFAULT NULL,
  `lockedAt` DATETIME(3) NULL DEFAULT NULL,
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `project_briefs_projectId_key` (`projectId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `project_members` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `projectId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `userId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `role` ENUM('MANAGER','EDITOR','MOTION_DESIGNER','REVIEWER','SUPPORT') NOT NULL DEFAULT 'EDITOR',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `project_members_projectId_userId_role_key` (`projectId`, `userId`, `role`),
  KEY `project_members_userId_idx` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `project_status_changes` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `projectId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `fromStatus` ENUM('INQUIRY','AWAITING_QUOTE','AWAITING_CONTRACT','AWAITING_PAYMENT','ONBOARDING','AWAITING_ASSETS','QUEUED','EDITING','INTERNAL_REVIEW','CLIENT_REVIEW','REVISION','FINAL_REVIEW','APPROVED','DELIVERED','ARCHIVED','CANCELLED') NULL DEFAULT NULL,
  `toStatus` ENUM('INQUIRY','AWAITING_QUOTE','AWAITING_CONTRACT','AWAITING_PAYMENT','ONBOARDING','AWAITING_ASSETS','QUEUED','EDITING','INTERNAL_REVIEW','CLIENT_REVIEW','REVISION','FINAL_REVIEW','APPROVED','DELIVERED','ARCHIVED','CANCELLED') NOT NULL,
  `actorId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `comment` MEDIUMTEXT NULL DEFAULT NULL,
  `override` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `project_status_changes_projectId_createdAt_idx` (`projectId`, `createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `project_templates` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` TEXT NOT NULL,
  `description` MEDIUMTEXT NULL DEFAULT NULL,
  `serviceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `projectTypeKey` TEXT NULL DEFAULT NULL,
  `defaultTurnaroundDays` INT NOT NULL DEFAULT 5,
  `defaultRevisionLimit` INT NOT NULL DEFAULT 2,
  `tasks` JSON NULL,
  `requiredAssets` JSON NULL,
  `questionKeys` JSON NULL,
  `deliverables` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `project_types` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `name` TEXT NOT NULL,
  `defaultTurnaroundDays` INT NOT NULL DEFAULT 5,
  `defaultRevisionLimit` INT NOT NULL DEFAULT 2,
  `onboardingCategories` JSON NULL,
  `sortOrder` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `project_types_workspaceId_key_key` (`workspaceId`, `key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `projects` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `organizationId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `clientId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `serviceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `projectTypeId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `templateId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `sourceProjectId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `name` TEXT NOT NULL,
  `description` MEDIUMTEXT NULL DEFAULT NULL,
  `status` ENUM('INQUIRY','AWAITING_QUOTE','AWAITING_CONTRACT','AWAITING_PAYMENT','ONBOARDING','AWAITING_ASSETS','QUEUED','EDITING','INTERNAL_REVIEW','CLIENT_REVIEW','REVISION','FINAL_REVIEW','APPROVED','DELIVERED','ARCHIVED','CANCELLED') NOT NULL DEFAULT 'INQUIRY',
  `priority` ENUM('LOW','NORMAL','HIGH','URGENT') NOT NULL DEFAULT 'NORMAL',
  `deadline` DATETIME(3) NULL DEFAULT NULL,
  `startDate` DATETIME(3) NULL DEFAULT NULL,
  `completionDate` DATETIME(3) NULL DEFAULT NULL,
  `deliveredAt` DATETIME(3) NULL DEFAULT NULL,
  `managerId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `clientVisible` TINYINT(1) NOT NULL DEFAULT 0,
  `scope` JSON NULL,
  `revisionLimit` INT NOT NULL DEFAULT 2,
  `revisionsUsed` INT NOT NULL DEFAULT 0,
  `rushFee` INT NULL DEFAULT NULL,
  `currency` VARCHAR(255) NOT NULL DEFAULT 'USD',
  `internalCost` INT NULL DEFAULT NULL,
  `gateOverride` TINYINT(1) NOT NULL DEFAULT 0,
  `brandOverrides` JSON NULL,
  `tags` JSON NULL,
  `isDemo` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `archivedAt` DATETIME(3) NULL DEFAULT NULL,
  `retainerId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `leadId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `projects_clientId_idx` (`clientId`),
  KEY `projects_deadline_idx` (`deadline`),
  KEY `projects_organizationId_idx` (`organizationId`),
  UNIQUE KEY `projects_workspaceId_code_key` (`workspaceId`, `code`),
  KEY `projects_workspaceId_status_idx` (`workspaceId`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `quote_items` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `quoteId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `serviceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `description` MEDIUMTEXT NOT NULL,
  `quantity` DOUBLE NOT NULL DEFAULT 1,
  `unitPrice` INT NOT NULL,
  `amount` INT NOT NULL,
  `sortOrder` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `quote_items_quoteId_idx` (`quoteId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `quotes` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `organizationId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `clientId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `projectId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `leadId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `changeRequestId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `number` VARCHAR(191) NOT NULL,
  `title` TEXT NULL DEFAULT NULL,
  `currency` VARCHAR(255) NOT NULL DEFAULT 'USD',
  `subtotal` INT NOT NULL DEFAULT 0,
  `discount` INT NOT NULL DEFAULT 0,
  `taxRateBps` INT NOT NULL DEFAULT 0,
  `tax` INT NOT NULL DEFAULT 0,
  `total` INT NOT NULL DEFAULT 0,
  `depositPercent` INT NOT NULL DEFAULT 100,
  `deposit` INT NOT NULL DEFAULT 0,
  `balance` INT NOT NULL DEFAULT 0,
  `status` ENUM('DRAFT','SENT','VIEWED','ACCEPTED','REJECTED','EXPIRED') NOT NULL DEFAULT 'DRAFT',
  `validUntil` DATETIME(3) NULL DEFAULT NULL,
  `notes` MEDIUMTEXT NULL DEFAULT NULL,
  `terms` MEDIUMTEXT NULL DEFAULT NULL,
  `sentAt` DATETIME(3) NULL DEFAULT NULL,
  `viewedAt` DATETIME(3) NULL DEFAULT NULL,
  `acceptedAt` DATETIME(3) NULL DEFAULT NULL,
  `acceptedById` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `acceptedIp` TEXT NULL DEFAULT NULL,
  `rejectedAt` DATETIME(3) NULL DEFAULT NULL,
  `rejectionReason` TEXT NULL DEFAULT NULL,
  `createdById` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `isDemo` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `quotes_organizationId_status_idx` (`organizationId`, `status`),
  KEY `quotes_projectId_idx` (`projectId`),
  UNIQUE KEY `quotes_workspaceId_number_key` (`workspaceId`, `number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `recurring_schedules` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `clientId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `templateId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` TEXT NOT NULL,
  `cadence` ENUM('WEEKLY','BIWEEKLY','MONTHLY') NOT NULL DEFAULT 'WEEKLY',
  `nextRunAt` DATETIME(3) NOT NULL,
  `lastRunAt` DATETIME(3) NULL DEFAULT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `recurring_schedules_active_nextRunAt_idx` (`active`, `nextRunAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `referrals` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `referrerClientId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `referredClientId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `referredLeadId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `status` ENUM('PENDING','QUALIFIED','REWARDED','EXPIRED') NOT NULL DEFAULT 'PENDING',
  `reward` TEXT NULL DEFAULT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `referrals_code_idx` (`code`),
  KEY `referrals_referrerClientId_idx` (`referrerClientId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `retainer_usage` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `retainerId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `projectId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `periodStart` DATETIME(3) NOT NULL,
  `kind` TEXT NOT NULL,
  `quantity` DOUBLE NOT NULL DEFAULT 1,
  `note` MEDIUMTEXT NULL DEFAULT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `retainer_usage_retainerId_periodStart_idx` (`retainerId`, `periodStart`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `retainers` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `organizationId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `clientId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `planId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `name` TEXT NOT NULL,
  `monthlyPrice` INT NOT NULL,
  `currency` VARCHAR(255) NOT NULL DEFAULT 'USD',
  `videosIncluded` INT NOT NULL DEFAULT 0,
  `shortsIncluded` INT NOT NULL DEFAULT 0,
  `hoursIncluded` INT NOT NULL DEFAULT 0,
  `turnaroundDays` INT NOT NULL DEFAULT 5,
  `revisionsIncluded` INT NOT NULL DEFAULT 2,
  `startDate` DATETIME(3) NOT NULL,
  `renewalDate` DATETIME(3) NOT NULL,
  `status` ENUM('ACTIVE','PAUSED','CANCELLED','EXPIRED') NOT NULL DEFAULT 'ACTIVE',
  `notes` MEDIUMTEXT NULL DEFAULT NULL,
  `isDemo` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `retainers_organizationId_status_idx` (`organizationId`, `status`),
  KEY `retainers_renewalDate_idx` (`renewalDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `revision_requests` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `projectId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `versionId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `submittedById` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `description` MEDIUMTEXT NOT NULL,
  `status` ENUM('OPEN','IN_PROGRESS','RESOLVED','REJECTED','CLOSED') NOT NULL DEFAULT 'OPEN',
  `priority` ENUM('LOW','NORMAL','HIGH','URGENT') NOT NULL DEFAULT 'NORMAL',
  `roundNumber` INT NOT NULL DEFAULT 1,
  `resolvedInVersionId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `isDemo` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `resolvedAt` DATETIME(3) NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `revision_requests_projectId_status_idx` (`projectId`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `role_permissions` (
  `roleId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `permissionId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (`roleId`, `permissionId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `roles` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `name` TEXT NOT NULL,
  `description` MEDIUMTEXT NULL DEFAULT NULL,
  `isStaff` TINYINT(1) NOT NULL DEFAULT 1,
  `isSystem` TINYINT(1) NOT NULL DEFAULT 1,
  `rank` INT NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `roles_key_key` (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `service_categories` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `name` TEXT NOT NULL,
  `sortOrder` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `service_categories_workspaceId_key_key` (`workspaceId`, `key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `services` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `title` TEXT NOT NULL,
  `shortDescription` MEDIUMTEXT NOT NULL,
  `description` MEDIUMTEXT NULL DEFAULT NULL,
  `categoryId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `icon` VARCHAR(255) NOT NULL DEFAULT 'clapperboard',
  `useCase` TEXT NULL DEFAULT NULL,
  `deliverables` JSON NULL,
  `included` JSON NULL,
  `whoFor` JSON NULL,
  `exampleDeliverables` JSON NULL,
  `platforms` JSON NULL,
  `editingStyle` TEXT NULL DEFAULT NULL,
  `addOns` JSON NULL,
  `workflow` JSON NULL,
  `revisionPolicy` TEXT NULL DEFAULT NULL,
  `turnaround` TEXT NULL DEFAULT NULL,
  `startingPrice` INT NULL DEFAULT NULL,
  `currency` VARCHAR(255) NOT NULL DEFAULT 'USD',
  `priceLabel` TEXT NULL DEFAULT NULL,
  `faqCategory` TEXT NULL DEFAULT NULL,
  `onboardingCategories` JSON NULL,
  `seoTitle` TEXT NULL DEFAULT NULL,
  `seoDescription` MEDIUMTEXT NULL DEFAULT NULL,
  `heroImage` MEDIUMTEXT NULL DEFAULT NULL,
  `published` TINYINT(1) NOT NULL DEFAULT 1,
  `featured` TINYINT(1) NOT NULL DEFAULT 0,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `services_workspaceId_slug_key` (`workspaceId`, `slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `sessions` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `userId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `tokenHash` VARCHAR(191) NOT NULL,
  `twoFactorPending` TINYINT(1) NOT NULL DEFAULT 0,
  `ip` TEXT NULL DEFAULT NULL,
  `userAgent` TEXT NULL DEFAULT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `lastUsedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `data` MEDIUMTEXT NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `sessions_expiresAt_idx` (`expiresAt`),
  UNIQUE KEY `sessions_tokenHash_key` (`tokenHash`),
  KEY `sessions_userId_idx` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `settings` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `value` JSON NOT NULL,
  `updatedById` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `settings_workspaceId_key_key` (`workspaceId`, `key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `task_comments` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `taskId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `authorId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `body` MEDIUMTEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `task_comments_taskId_idx` (`taskId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tasks` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `projectId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `parentId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `title` TEXT NOT NULL,
  `description` MEDIUMTEXT NULL DEFAULT NULL,
  `assigneeId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `priority` ENUM('LOW','NORMAL','HIGH','URGENT') NOT NULL DEFAULT 'NORMAL',
  `dueDate` DATETIME(3) NULL DEFAULT NULL,
  `status` ENUM('TODO','IN_PROGRESS','REVIEW','BLOCKED','COMPLETE') NOT NULL DEFAULT 'TODO',
  `sortOrder` INT NOT NULL DEFAULT 0,
  `createdById` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `completedAt` DATETIME(3) NULL DEFAULT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `tasks_assigneeId_status_idx` (`assigneeId`, `status`),
  KEY `tasks_dueDate_idx` (`dueDate`),
  KEY `tasks_projectId_idx` (`projectId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `testimonial_requests` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `projectId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `clientId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `token` VARCHAR(191) NOT NULL,
  `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completedAt` DATETIME(3) NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `testimonial_requests_projectId_key` (`projectId`),
  UNIQUE KEY `testimonial_requests_token_key` (`token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `testimonials` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `projectId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `clientId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `rating` INT NOT NULL,
  `quote` MEDIUMTEXT NOT NULL,
  `permissionToPublish` TINYINT(1) NOT NULL DEFAULT 0,
  `name` TEXT NOT NULL,
  `role` TEXT NULL DEFAULT NULL,
  `company` TEXT NULL DEFAULT NULL,
  `imageUrl` MEDIUMTEXT NULL DEFAULT NULL,
  `status` ENUM('PENDING','APPROVED','REJECTED','HIDDEN') NOT NULL DEFAULT 'PENDING',
  `featured` TINYINT(1) NOT NULL DEFAULT 0,
  `isDemo` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `testimonials_workspaceId_status_idx` (`workspaceId`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `time_entries` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `projectId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `userId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `taskId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `startedAt` DATETIME(3) NOT NULL,
  `endedAt` DATETIME(3) NULL DEFAULT NULL,
  `seconds` INT NOT NULL DEFAULT 0,
  `note` MEDIUMTEXT NULL DEFAULT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `time_entries_projectId_idx` (`projectId`),
  KEY `time_entries_userId_startedAt_idx` (`userId`, `startedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `user_roles` (
  `userId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `roleId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (`userId`, `roleId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `users` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` TEXT NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `passwordHash` TEXT NULL DEFAULT NULL,
  `avatarUrl` MEDIUMTEXT NULL DEFAULT NULL,
  `phone` TEXT NULL DEFAULT NULL,
  `title` TEXT NULL DEFAULT NULL,
  `timezone` TEXT NULL DEFAULT NULL,
  `status` ENUM('ACTIVE','INVITED','SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
  `isStaff` TINYINT(1) NOT NULL DEFAULT 0,
  `twoFactorEnabled` TINYINT(1) NOT NULL DEFAULT 0,
  `twoFactorSecret` TEXT NULL DEFAULT NULL,
  `recoveryCodes` JSON NULL,
  `emailVerifiedAt` DATETIME(3) NULL DEFAULT NULL,
  `lastLoginAt` DATETIME(3) NULL DEFAULT NULL,
  `hourlyCost` INT NULL DEFAULT NULL,
  `hourlyCostCurrency` TEXT NULL DEFAULT NULL,
  `isDemo` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_key` (`email`),
  KEY `users_workspaceId_isStaff_idx` (`workspaceId`, `isStaff`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `video_comments` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `projectId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `versionId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `userId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `parentId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `timecodeMs` INT NOT NULL,
  `comment` MEDIUMTEXT NOT NULL,
  `status` ENUM('OPEN','IN_PROGRESS','RESOLVED','REJECTED','CLOSED') NOT NULL DEFAULT 'OPEN',
  `isStaff` TINYINT(1) NOT NULL DEFAULT 0,
  `revisionId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `isDemo` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `resolvedAt` DATETIME(3) NULL DEFAULT NULL,
  `resolvedById` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `video_comments_projectId_status_idx` (`projectId`, `status`),
  KEY `video_comments_versionId_timecodeMs_idx` (`versionId`, `timecodeMs`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `video_versions` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `workspaceId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `projectId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `versionNumber` INT NOT NULL,
  `label` TEXT NOT NULL,
  `assetId` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `videoUrl` MEDIUMTEXT NULL DEFAULT NULL,
  `thumbnailKey` TEXT NULL DEFAULT NULL,
  `durationMs` INT NULL DEFAULT NULL,
  `notes` MEDIUMTEXT NULL DEFAULT NULL,
  `changeSummary` MEDIUMTEXT NULL DEFAULT NULL,
  `createdById` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `reviewStatus` ENUM('DRAFT','INTERNAL_REVIEW','PENDING_CLIENT','CHANGES_REQUESTED','APPROVED','SUPERSEDED') NOT NULL DEFAULT 'PENDING_CLIENT',
  `isFinal` TINYINT(1) NOT NULL DEFAULT 0,
  `approvedById` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `approvedAt` DATETIME(3) NULL DEFAULT NULL,
  `approvalNotes` MEDIUMTEXT NULL DEFAULT NULL,
  `isDemo` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `releasedAt` DATETIME(3) NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `video_versions_projectId_createdAt_idx` (`projectId`, `createdAt`),
  UNIQUE KEY `video_versions_projectId_versionNumber_key` (`projectId`, `versionNumber`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `workspaces` (
  `id` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` TEXT NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `workspaces_slug_key` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- added for the PHP version: request counters for rate limiting
CREATE TABLE `rate_limits` (
  `k` VARCHAR(190) NOT NULL,
  `hits` INT NOT NULL DEFAULT 0,
  `resetAt` BIGINT NOT NULL,
  PRIMARY KEY (`k`),
  KEY `rate_limits_resetAt_idx` (`resetAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── foreign keys (added after all tables exist, so import order never matters) ──
ALTER TABLE `activity_logs` ADD CONSTRAINT `activity_logs_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `activity_logs` ADD CONSTRAINT `activity_logs_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `asset_folders` ADD CONSTRAINT `asset_folders_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `assets` ADD CONSTRAINT `assets_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `clients` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `assets` ADD CONSTRAINT `assets_folderId_fkey` FOREIGN KEY (`folderId`) REFERENCES `asset_folders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `assets` ADD CONSTRAINT `assets_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `assets` ADD CONSTRAINT `assets_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `automation_actions` ADD CONSTRAINT `automation_actions_automationId_fkey` FOREIGN KEY (`automationId`) REFERENCES `automations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `automation_runs` ADD CONSTRAINT `automation_runs_automationId_fkey` FOREIGN KEY (`automationId`) REFERENCES `automations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `blog_posts` ADD CONSTRAINT `blog_posts_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `blog_categories` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `case_studies` ADD CONSTRAINT `case_studies_portfolioProjectId_fkey` FOREIGN KEY (`portfolioProjectId`) REFERENCES `portfolio_projects` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `change_requests` ADD CONSTRAINT `change_requests_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `change_requests` ADD CONSTRAINT `change_requests_submittedById_fkey` FOREIGN KEY (`submittedById`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `client_brand_kits` ADD CONSTRAINT `client_brand_kits_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `clients` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `client_profiles` ADD CONSTRAINT `client_profiles_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `clients` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `clients` ADD CONSTRAINT `clients_managerId_fkey` FOREIGN KEY (`managerId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `clients` ADD CONSTRAINT `clients_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `clients` ADD CONSTRAINT `clients_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `contract_signatures` ADD CONSTRAINT `contract_signatures_contractVersionId_fkey` FOREIGN KEY (`contractVersionId`) REFERENCES `contract_versions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `contract_versions` ADD CONSTRAINT `contract_versions_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `contracts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `contracts` ADD CONSTRAINT `contracts_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `clients` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `contracts` ADD CONSTRAINT `contracts_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `contracts` ADD CONSTRAINT `contracts_quoteId_fkey` FOREIGN KEY (`quoteId`) REFERENCES `quotes` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `file_requests` ADD CONSTRAINT `file_requests_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `file_requests` ADD CONSTRAINT `file_requests_requestedById_fkey` FOREIGN KEY (`requestedById`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `internal_notes` ADD CONSTRAINT `internal_notes_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `invoice_items` ADD CONSTRAINT `invoice_items_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `invoices` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `clients` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_quoteId_fkey` FOREIGN KEY (`quoteId`) REFERENCES `quotes` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_retainerId_fkey` FOREIGN KEY (`retainerId`) REFERENCES `retainers` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `lead_activities` ADD CONSTRAINT `lead_activities_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `lead_activities` ADD CONSTRAINT `lead_activities_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `leads` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `leads` ADD CONSTRAINT `leads_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `leads` ADD CONSTRAINT `leads_convertedClientId_fkey` FOREIGN KEY (`convertedClientId`) REFERENCES `clients` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `leads` ADD CONSTRAINT `leads_sourceId_fkey` FOREIGN KEY (`sourceId`) REFERENCES `lead_sources` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `meetings` ADD CONSTRAINT `meetings_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `clients` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `meetings` ADD CONSTRAINT `meetings_hostId_fkey` FOREIGN KEY (`hostId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `meetings` ADD CONSTRAINT `meetings_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `leads` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `message_attachments` ADD CONSTRAINT `message_attachments_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `assets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `message_attachments` ADD CONSTRAINT `message_attachments_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `messages` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `message_reads` ADD CONSTRAINT `message_reads_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `messages` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `message_reads` ADD CONSTRAINT `message_reads_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `messages` ADD CONSTRAINT `messages_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `clients` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `messages` ADD CONSTRAINT `messages_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `messages` ADD CONSTRAINT `messages_senderId_fkey` FOREIGN KEY (`senderId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `notification_preferences` ADD CONSTRAINT `notification_preferences_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `oauth_accounts` ADD CONSTRAINT `oauth_accounts_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `onboarding_options` ADD CONSTRAINT `onboarding_options_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `onboarding_questions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `onboarding_questions` ADD CONSTRAINT `onboarding_questions_formId_fkey` FOREIGN KEY (`formId`) REFERENCES `onboarding_forms` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `onboarding_questions` ADD CONSTRAINT `onboarding_questions_sectionId_fkey` FOREIGN KEY (`sectionId`) REFERENCES `onboarding_sections` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `onboarding_sections` ADD CONSTRAINT `onboarding_sections_formId_fkey` FOREIGN KEY (`formId`) REFERENCES `onboarding_forms` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `organization_members` ADD CONSTRAINT `organization_members_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `organization_members` ADD CONSTRAINT `organization_members_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `payments` ADD CONSTRAINT `payments_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `clients` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `payments` ADD CONSTRAINT `payments_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `invoices` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `project_briefs` ADD CONSTRAINT `project_briefs_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `project_members` ADD CONSTRAINT `project_members_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `project_members` ADD CONSTRAINT `project_members_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `project_status_changes` ADD CONSTRAINT `project_status_changes_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `project_status_changes` ADD CONSTRAINT `project_status_changes_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `project_templates` ADD CONSTRAINT `project_templates_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `services` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `projects` ADD CONSTRAINT `projects_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `clients` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `projects` ADD CONSTRAINT `projects_managerId_fkey` FOREIGN KEY (`managerId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `projects` ADD CONSTRAINT `projects_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `projects` ADD CONSTRAINT `projects_projectTypeId_fkey` FOREIGN KEY (`projectTypeId`) REFERENCES `project_types` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `projects` ADD CONSTRAINT `projects_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `services` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `projects` ADD CONSTRAINT `projects_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `project_templates` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `quote_items` ADD CONSTRAINT `quote_items_quoteId_fkey` FOREIGN KEY (`quoteId`) REFERENCES `quotes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `clients` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `leads` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `recurring_schedules` ADD CONSTRAINT `recurring_schedules_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `project_templates` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `retainer_usage` ADD CONSTRAINT `retainer_usage_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `retainer_usage` ADD CONSTRAINT `retainer_usage_retainerId_fkey` FOREIGN KEY (`retainerId`) REFERENCES `retainers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `retainers` ADD CONSTRAINT `retainers_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `clients` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `retainers` ADD CONSTRAINT `retainers_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `pricing_plans` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `revision_requests` ADD CONSTRAINT `revision_requests_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `revision_requests` ADD CONSTRAINT `revision_requests_submittedById_fkey` FOREIGN KEY (`submittedById`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `revision_requests` ADD CONSTRAINT `revision_requests_versionId_fkey` FOREIGN KEY (`versionId`) REFERENCES `video_versions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permissionId_fkey` FOREIGN KEY (`permissionId`) REFERENCES `permissions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `roles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `services` ADD CONSTRAINT `services_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `service_categories` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `task_comments` ADD CONSTRAINT `task_comments_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `task_comments` ADD CONSTRAINT `task_comments_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `tasks` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `tasks` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `time_entries` ADD CONSTRAINT `time_entries_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `time_entries` ADD CONSTRAINT `time_entries_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `tasks` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `time_entries` ADD CONSTRAINT `time_entries_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `roles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `video_comments` ADD CONSTRAINT `video_comments_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `video_comments` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `video_comments` ADD CONSTRAINT `video_comments_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `video_comments` ADD CONSTRAINT `video_comments_revisionId_fkey` FOREIGN KEY (`revisionId`) REFERENCES `revision_requests` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `video_comments` ADD CONSTRAINT `video_comments_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `video_comments` ADD CONSTRAINT `video_comments_versionId_fkey` FOREIGN KEY (`versionId`) REFERENCES `video_versions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `video_versions` ADD CONSTRAINT `video_versions_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `video_versions` ADD CONSTRAINT `video_versions_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `assets` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `video_versions` ADD CONSTRAINT `video_versions_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `video_versions` ADD CONSTRAINT `video_versions_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

SET FOREIGN_KEY_CHECKS = 1;
