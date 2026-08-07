-- CreateEnum
CREATE TYPE "BuyerRegistrationStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'BLOCKED', 'INACTIVE');

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "isSelfRegistered" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "registrationStatus" "BuyerRegistrationStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "BuyerProfile" ADD COLUMN     "packaging" TEXT;

-- CreateTable
CREATE TABLE "BuyerContact" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BuyerContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyerApproval" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fromStatus" "BuyerRegistrationStatus",
    "toStatus" "BuyerRegistrationStatus" NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "comments" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuyerApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BuyerContact_accountId_isPrimary_idx" ON "BuyerContact"("accountId", "isPrimary");

-- CreateIndex
CREATE INDEX "BuyerContact_organizationId_email_idx" ON "BuyerContact"("organizationId", "email");

-- CreateIndex
CREATE INDEX "BuyerContact_accountId_deletedAt_idx" ON "BuyerContact"("accountId", "deletedAt");

-- CreateIndex
CREATE INDEX "BuyerApproval_accountId_reviewedAt_idx" ON "BuyerApproval"("accountId", "reviewedAt");

-- CreateIndex
CREATE INDEX "BuyerApproval_organizationId_toStatus_idx" ON "BuyerApproval"("organizationId", "toStatus");

-- CreateIndex
CREATE INDEX "BuyerApproval_organizationId_reviewerId_idx" ON "BuyerApproval"("organizationId", "reviewerId");

-- CreateIndex
CREATE INDEX "Account_organizationId_registrationStatus_idx" ON "Account"("organizationId", "registrationStatus");

-- AddForeignKey
ALTER TABLE "BuyerContact" ADD CONSTRAINT "BuyerContact_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerApproval" ADD CONSTRAINT "BuyerApproval_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

