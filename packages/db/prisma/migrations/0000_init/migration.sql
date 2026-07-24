-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('ADMIN', 'EXPORT_MANAGER', 'VERIFIER', 'READ_ONLY');

-- CreateEnum
CREATE TYPE "RelationshipStatus" AS ENUM ('PROSPECT', 'ACTIVE', 'PREFERRED', 'DORMANT', 'BLACKLISTED');

-- CreateEnum
CREATE TYPE "ManufacturingType" AS ENUM ('MANUFACTURER', 'PROCESSOR', 'TRADER', 'FARMER_PRODUCER', 'CONTRACT_MANUFACTURER', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('GST', 'IEC', 'FSSAI', 'APEDA', 'ISO', 'HACCP', 'BRC', 'FACTORY_LICENSE', 'COMPANY_REGISTRATION', 'IMPORT_EXPORT_LICENSE', 'PAN', 'MSME', 'PRODUCT_CATALOGUE', 'COMPANY_PROFILE', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'RECEIVED', 'VERIFIED', 'EXPIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'DOCUMENTS_REQUESTED', 'IN_REVIEW', 'VERIFIED', 'REJECTED', 'SUSPENDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "VerificationDecision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VerificationItemStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('CREATED', 'UPDATED', 'DELETED', 'RESTORED', 'ASSIGNED', 'UPLOADED', 'APPROVED', 'REJECTED', 'REQUESTED', 'DOWNLOADED', 'STATUS_CHANGED', 'OTHER');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ACCOUNT', 'SUPPLIER', 'DOCUMENT', 'VERIFICATION', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'WEBHOOK', 'PUSH');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "BuyerType" AS ENUM ('IMPORTER', 'DISTRIBUTOR', 'WHOLESALER', 'RETAILER', 'FOOD_PROCESSOR', 'TRADER', 'BRAND', 'HORECA', 'OTHER');

-- CreateEnum
CREATE TYPE "ImportExperience" AS ENUM ('NEW', 'YEARS_1_3', 'YEARS_3_PLUS');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" "RoleName" NOT NULL,
    "description" TEXT,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "displayName" TEXT,
    "country" TEXT,
    "relationshipStatus" "RelationshipStatus" NOT NULL DEFAULT 'PROSPECT',
    "source" TEXT,
    "ownerId" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "deletedById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierProfile" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "manufacturingType" "ManufacturingType",
    "businessType" TEXT,
    "factorySizeSqm" INTEGER,
    "employees" INTEGER,
    "productionCapacity" TEXT,
    "annualTurnoverBand" TEXT,
    "exportExperienceYears" INTEGER,
    "primaryMarkets" TEXT[],
    "exportCountries" TEXT[],
    "languages" TEXT[],
    "incoterms" TEXT[],
    "paymentTerms" TEXT[],
    "supportedDocuments" TEXT[],
    "certifications" TEXT[],
    "leadTimeDays" INTEGER,
    "moq" TEXT,
    "packaging" TEXT,
    "oem" BOOLEAN NOT NULL DEFAULT false,
    "odm" BOOLEAN NOT NULL DEFAULT false,
    "privateLabel" BOOLEAN NOT NULL DEFAULT false,
    "website" TEXT,
    "socialLinks" JSONB,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "deletedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierProduct" (
    "id" TEXT NOT NULL,
    "supplierProfileId" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "capacityPerMonth" TEXT,
    "moq" TEXT,
    "leadTimeDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "supplierProfileId" TEXT,
    "type" "DocumentType" NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "title" TEXT NOT NULL,
    "issuedDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "currentFileVersion" INTEGER NOT NULL DEFAULT 1,
    "currentStorageKey" TEXT NOT NULL,
    "currentMimeType" TEXT NOT NULL,
    "currentOriginalFilename" TEXT NOT NULL,
    "currentFileSize" INTEGER NOT NULL,
    "currentChecksum" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "deletedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "supplierProfileId" TEXT,
    "status" "VerificationStatus" NOT NULL DEFAULT 'DRAFT',
    "decision" "VerificationDecision",
    "reason" TEXT,
    "reviewerId" TEXT,
    "requiredDocumentTypes" TEXT[],
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationReview" (
    "id" TEXT NOT NULL,
    "verificationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "status" "VerificationItemStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationNote" (
    "id" TEXT NOT NULL,
    "verificationId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationHistory" (
    "id" TEXT NOT NULL,
    "verificationId" TEXT NOT NULL,
    "fromStatus" "VerificationStatus",
    "toStatus" "VerificationStatus" NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "accountId" TEXT,
    "actorId" TEXT,
    "actorType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "eventName" TEXT NOT NULL,
    "activityType" "ActivityType" NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "actorId" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "accountId" TEXT,
    "eventName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRecipient" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "recipientRowId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "attemptedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "digest" BOOLEAN NOT NULL DEFAULT false,
    "channels" "NotificationChannel"[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyerProfile" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "businessType" "BuyerType",
    "annualRequirement" TEXT,
    "annualBudgetBand" TEXT,
    "importExperience" "ImportExperience",
    "destinationCountries" TEXT[],
    "destinationPort" TEXT,
    "incoterms" TEXT[],
    "paymentTerms" TEXT[],
    "certificationsRequired" TEXT[],
    "languages" TEXT[],
    "website" TEXT,
    "socialLinks" JSONB,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "deletedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuyerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyerProduct" (
    "id" TEXT NOT NULL,
    "buyerProfileId" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "targetVolume" TEXT,
    "targetPrice" TEXT,
    "frequency" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuyerProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "Account_organizationId_deletedAt_idx" ON "Account"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "Account_organizationId_relationshipStatus_idx" ON "Account"("organizationId", "relationshipStatus");

-- CreateIndex
CREATE INDEX "Account_organizationId_legalName_idx" ON "Account"("organizationId", "legalName");

-- CreateIndex
CREATE INDEX "Account_organizationId_ownerId_idx" ON "Account"("organizationId", "ownerId");

-- CreateIndex
CREATE INDEX "Account_organizationId_createdAt_idx" ON "Account"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_entityType_entityId_idx" ON "AuditLog"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierProfile_accountId_key" ON "SupplierProfile"("accountId");

-- CreateIndex
CREATE INDEX "SupplierProfile_organizationId_deletedAt_idx" ON "SupplierProfile"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "SupplierProduct_supplierProfileId_idx" ON "SupplierProduct"("supplierProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierProduct_supplierProfileId_product_key" ON "SupplierProduct"("supplierProfileId", "product");

-- CreateIndex
CREATE INDEX "Document_organizationId_accountId_deletedAt_idx" ON "Document"("organizationId", "accountId", "deletedAt");

-- CreateIndex
CREATE INDEX "Document_organizationId_supplierProfileId_idx" ON "Document"("organizationId", "supplierProfileId");

-- CreateIndex
CREATE INDEX "Document_organizationId_type_idx" ON "Document"("organizationId", "type");

-- CreateIndex
CREATE INDEX "Document_organizationId_status_idx" ON "Document"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Document_organizationId_expiryDate_idx" ON "Document"("organizationId", "expiryDate");

-- CreateIndex
CREATE INDEX "Document_organizationId_currentChecksum_idx" ON "Document"("organizationId", "currentChecksum");

-- CreateIndex
CREATE INDEX "DocumentVersion_documentId_idx" ON "DocumentVersion"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_versionNumber_key" ON "DocumentVersion"("documentId", "versionNumber");

-- CreateIndex
CREATE INDEX "Verification_organizationId_accountId_idx" ON "Verification"("organizationId", "accountId");

-- CreateIndex
CREATE INDEX "Verification_organizationId_status_idx" ON "Verification"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Verification_organizationId_reviewerId_idx" ON "Verification"("organizationId", "reviewerId");

-- CreateIndex
CREATE INDEX "VerificationReview_verificationId_idx" ON "VerificationReview"("verificationId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationReview_verificationId_documentId_key" ON "VerificationReview"("verificationId", "documentId");

-- CreateIndex
CREATE INDEX "VerificationNote_verificationId_idx" ON "VerificationNote"("verificationId");

-- CreateIndex
CREATE INDEX "VerificationHistory_verificationId_idx" ON "VerificationHistory"("verificationId");

-- CreateIndex
CREATE INDEX "Activity_organizationId_createdAt_idx" ON "Activity"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Activity_organizationId_accountId_createdAt_idx" ON "Activity"("organizationId", "accountId", "createdAt");

-- CreateIndex
CREATE INDEX "Activity_organizationId_entityType_idx" ON "Activity"("organizationId", "entityType");

-- CreateIndex
CREATE INDEX "Activity_organizationId_actorId_idx" ON "Activity"("organizationId", "actorId");

-- CreateIndex
CREATE INDEX "Activity_organizationId_activityType_idx" ON "Activity"("organizationId", "activityType");

-- CreateIndex
CREATE INDEX "Notification_organizationId_createdAt_idx" ON "Notification"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationRecipient_organizationId_recipientId_createdAt_idx" ON "NotificationRecipient"("organizationId", "recipientId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationRecipient_recipientId_readAt_idx" ON "NotificationRecipient"("recipientId", "readAt");

-- CreateIndex
CREATE INDEX "NotificationRecipient_recipientId_archivedAt_idx" ON "NotificationRecipient"("recipientId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationRecipient_notificationId_recipientId_key" ON "NotificationRecipient"("notificationId", "recipientId");

-- CreateIndex
CREATE INDEX "NotificationDelivery_recipientRowId_idx" ON "NotificationDelivery"("recipientRowId");

-- CreateIndex
CREATE INDEX "NotificationPreference_organizationId_userId_idx" ON "NotificationPreference"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_type_key" ON "NotificationPreference"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "BuyerProfile_accountId_key" ON "BuyerProfile"("accountId");

-- CreateIndex
CREATE INDEX "BuyerProfile_organizationId_deletedAt_idx" ON "BuyerProfile"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "BuyerProduct_buyerProfileId_idx" ON "BuyerProduct"("buyerProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "BuyerProduct_buyerProfileId_product_key" ON "BuyerProduct"("buyerProfileId", "product");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierProfile" ADD CONSTRAINT "SupplierProfile_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierProduct" ADD CONSTRAINT "SupplierProduct_supplierProfileId_fkey" FOREIGN KEY ("supplierProfileId") REFERENCES "SupplierProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationReview" ADD CONSTRAINT "VerificationReview_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "Verification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationNote" ADD CONSTRAINT "VerificationNote_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "Verification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationHistory" ADD CONSTRAINT "VerificationHistory_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "Verification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_recipientRowId_fkey" FOREIGN KEY ("recipientRowId") REFERENCES "NotificationRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerProfile" ADD CONSTRAINT "BuyerProfile_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerProduct" ADD CONSTRAINT "BuyerProduct_buyerProfileId_fkey" FOREIGN KEY ("buyerProfileId") REFERENCES "BuyerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

