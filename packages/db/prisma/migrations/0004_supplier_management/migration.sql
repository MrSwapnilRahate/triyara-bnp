-- CreateEnum
CREATE TYPE "SupplierBusinessType" AS ENUM ('MANUFACTURER', 'MANUFACTURER_EXPORTER', 'MERCHANT_EXPORTER', 'TRADER', 'PROCESSOR', 'FARMER_PRODUCER_ORGANISATION', 'CONTRACT_MANUFACTURER', 'OTHER');

-- CreateEnum
CREATE TYPE "SupplierStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'BLOCKED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "SupplierContactRole" AS ENUM ('OWNER', 'SALES', 'EXPORT_MANAGER', 'ACCOUNTS', 'QUALITY', 'LOGISTICS', 'PRODUCTION', 'OTHER');

-- CreateEnum
CREATE TYPE "SupplierAddressType" AS ENUM ('REGISTERED_OFFICE', 'FACTORY', 'WAREHOUSE', 'BRANCH', 'DISPATCH_POINT');

-- CreateEnum
CREATE TYPE "CertificationType" AS ENUM ('ISO', 'FSSAI', 'HACCP', 'APEDA', 'FDA', 'BRCGS', 'HALAL', 'KOSHER', 'ORGANIC', 'GMP', 'SPICE_BOARD', 'OTHER');

-- CreateEnum
CREATE TYPE "CertificationStatus" AS ENUM ('ACTIVE', 'PENDING_RENEWAL', 'EXPIRED', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "SupplierDocumentType" AS ENUM ('GST', 'IEC', 'PAN', 'CANCELLED_CHEQUE', 'MSME', 'IMPORT_EXPORT_LICENSE', 'FACTORY_LICENSE', 'COMPANY_PROFILE', 'CATALOG', 'LAB_REPORT', 'AGREEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "CapacityFrequency" AS ENUM ('PER_DAY', 'PER_WEEK', 'PER_MONTH', 'PER_QUARTER', 'PER_YEAR', 'PER_SEASON');

-- CreateEnum
CREATE TYPE "SupplierProductStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'INACTIVE', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'BLOCKED', 'UNBLOCKED', 'REOPENED');

-- CreateEnum
CREATE TYPE "PerformanceSource" AS ENUM ('MANUAL', 'COMPUTED', 'IMPORTED');

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "supplierCode" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "businessType" "SupplierBusinessType" NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "gstNumber" TEXT,
    "iecNumber" TEXT,
    "panNumber" TEXT,
    "country" CHAR(2),
    "state" TEXT,
    "city" TEXT,
    "status" "SupplierStatus" NOT NULL DEFAULT 'DRAFT',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "accountId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierContact" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "SupplierContactRole" NOT NULL DEFAULT 'OTHER',
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

    CONSTRAINT "SupplierContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierAddress" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "SupplierAddressType" NOT NULL,
    "label" TEXT,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "postalCode" TEXT,
    "country" CHAR(2) NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "factorySizeSqm" INTEGER,
    "productionLines" INTEGER,
    "employeeCount" INTEGER,
    "establishedYear" INTEGER,
    "isOwnedPremises" BOOLEAN,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SupplierAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierBankAccount" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "branchName" TEXT,
    "accountHolderName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "ifscCode" TEXT,
    "swiftCode" TEXT,
    "iban" TEXT,
    "currency" CHAR(3) NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SupplierBankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierCertification" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "CertificationType" NOT NULL,
    "certificateNumber" TEXT NOT NULL,
    "issuedBy" TEXT,
    "issuedDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "status" "CertificationStatus" NOT NULL DEFAULT 'ACTIVE',
    "scope" TEXT,
    "supplierDocumentId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SupplierCertification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierDocument" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "SupplierDocumentType" NOT NULL,
    "title" TEXT,
    "fileUrl" TEXT,
    "storageKey" TEXT,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "checksum" TEXT,
    "documentNumber" TEXT,
    "issuedDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "documentId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SupplierDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierProductOffering" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplierSku" TEXT,
    "moq" DECIMAL(18,4),
    "moqUnit" TEXT,
    "leadTimeDays" INTEGER,
    "isPreferred" BOOLEAN NOT NULL DEFAULT false,
    "price" DECIMAL(18,4),
    "currency" CHAR(3),
    "incoterm" "Incoterm",
    "port" TEXT,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "status" "SupplierProductStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SupplierProductOffering_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierCapacity" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "productId" TEXT,
    "addressId" TEXT,
    "capacity" DECIMAL(18,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "frequency" "CapacityFrequency" NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SupplierCapacity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPerformance" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "deliveryScore" DECIMAL(5,2),
    "qualityScore" DECIMAL(5,2),
    "communicationScore" DECIMAL(5,2),
    "documentationScore" DECIMAL(5,2),
    "responsivenessScore" DECIMAL(5,2),
    "overallScore" DECIMAL(5,2),
    "ordersCount" INTEGER,
    "onTimeDeliveryRate" DECIMAL(5,2),
    "rejectionRate" DECIMAL(5,2),
    "source" "PerformanceSource" NOT NULL DEFAULT 'MANUAL',
    "computedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SupplierPerformance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierApproval" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fromStatus" "SupplierStatus",
    "toStatus" "SupplierStatus" NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "comments" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierTag" (
    "supplierId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierTag_pkey" PRIMARY KEY ("supplierId","tagId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_accountId_key" ON "Supplier"("accountId");

-- CreateIndex
CREATE INDEX "Supplier_organizationId_status_deletedAt_idx" ON "Supplier"("organizationId", "status", "deletedAt");

-- CreateIndex
CREATE INDEX "Supplier_organizationId_businessType_idx" ON "Supplier"("organizationId", "businessType");

-- CreateIndex
CREATE INDEX "Supplier_organizationId_isVerified_status_idx" ON "Supplier"("organizationId", "isVerified", "status");

-- CreateIndex
CREATE INDEX "Supplier_organizationId_country_state_city_idx" ON "Supplier"("organizationId", "country", "state", "city");

-- CreateIndex
CREATE INDEX "Supplier_organizationId_gstNumber_idx" ON "Supplier"("organizationId", "gstNumber");

-- CreateIndex
CREATE INDEX "Supplier_organizationId_iecNumber_idx" ON "Supplier"("organizationId", "iecNumber");

-- CreateIndex
CREATE INDEX "Supplier_organizationId_panNumber_idx" ON "Supplier"("organizationId", "panNumber");

-- CreateIndex
CREATE INDEX "Supplier_organizationId_companyName_idx" ON "Supplier"("organizationId", "companyName");

-- CreateIndex
CREATE INDEX "Supplier_accountId_idx" ON "Supplier"("accountId");

-- CreateIndex
CREATE INDEX "Supplier_code_trgm_idx" ON "Supplier" USING GIN ("supplierCode" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Supplier_company_trgm_idx" ON "Supplier" USING GIN ("companyName" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_organizationId_supplierCode_key" ON "Supplier"("organizationId", "supplierCode");

-- CreateIndex
CREATE INDEX "SupplierContact_supplierId_isPrimary_idx" ON "SupplierContact"("supplierId", "isPrimary");

-- CreateIndex
CREATE INDEX "SupplierContact_supplierId_role_idx" ON "SupplierContact"("supplierId", "role");

-- CreateIndex
CREATE INDEX "SupplierContact_organizationId_email_idx" ON "SupplierContact"("organizationId", "email");

-- CreateIndex
CREATE INDEX "SupplierContact_supplierId_deletedAt_idx" ON "SupplierContact"("supplierId", "deletedAt");

-- CreateIndex
CREATE INDEX "SupplierAddress_supplierId_type_idx" ON "SupplierAddress"("supplierId", "type");

-- CreateIndex
CREATE INDEX "SupplierAddress_organizationId_country_city_idx" ON "SupplierAddress"("organizationId", "country", "city");

-- CreateIndex
CREATE INDEX "SupplierAddress_supplierId_deletedAt_idx" ON "SupplierAddress"("supplierId", "deletedAt");

-- CreateIndex
CREATE INDEX "SupplierBankAccount_supplierId_isPrimary_idx" ON "SupplierBankAccount"("supplierId", "isPrimary");

-- CreateIndex
CREATE INDEX "SupplierBankAccount_supplierId_currency_idx" ON "SupplierBankAccount"("supplierId", "currency");

-- CreateIndex
CREATE INDEX "SupplierBankAccount_supplierId_deletedAt_idx" ON "SupplierBankAccount"("supplierId", "deletedAt");

-- CreateIndex
CREATE INDEX "SupplierCertification_supplierId_type_idx" ON "SupplierCertification"("supplierId", "type");

-- CreateIndex
CREATE INDEX "SupplierCertification_supplierId_status_idx" ON "SupplierCertification"("supplierId", "status");

-- CreateIndex
CREATE INDEX "SupplierCertification_organizationId_expiryDate_idx" ON "SupplierCertification"("organizationId", "expiryDate");

-- CreateIndex
CREATE INDEX "SupplierCertification_organizationId_type_status_idx" ON "SupplierCertification"("organizationId", "type", "status");

-- CreateIndex
CREATE INDEX "SupplierDocument_supplierId_type_idx" ON "SupplierDocument"("supplierId", "type");

-- CreateIndex
CREATE INDEX "SupplierDocument_organizationId_expiryDate_idx" ON "SupplierDocument"("organizationId", "expiryDate");

-- CreateIndex
CREATE INDEX "SupplierDocument_documentId_idx" ON "SupplierDocument"("documentId");

-- CreateIndex
CREATE INDEX "SupplierDocument_supplierId_deletedAt_idx" ON "SupplierDocument"("supplierId", "deletedAt");

-- CreateIndex
CREATE INDEX "SupplierProductOffering_organizationId_productId_status_idx" ON "SupplierProductOffering"("organizationId", "productId", "status");

-- CreateIndex
CREATE INDEX "SupplierProductOffering_supplierId_status_idx" ON "SupplierProductOffering"("supplierId", "status");

-- CreateIndex
CREATE INDEX "SupplierProductOffering_productId_isPreferred_idx" ON "SupplierProductOffering"("productId", "isPreferred");

-- CreateIndex
CREATE INDEX "SupplierProductOffering_supplierId_deletedAt_idx" ON "SupplierProductOffering"("supplierId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierProductOffering_supplierId_productId_incoterm_port__key" ON "SupplierProductOffering"("supplierId", "productId", "incoterm", "port", "currency");

-- CreateIndex
CREATE INDEX "SupplierCapacity_supplierId_effectiveFrom_effectiveTo_idx" ON "SupplierCapacity"("supplierId", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "SupplierCapacity_organizationId_productId_idx" ON "SupplierCapacity"("organizationId", "productId");

-- CreateIndex
CREATE INDEX "SupplierCapacity_addressId_idx" ON "SupplierCapacity"("addressId");

-- CreateIndex
CREATE INDEX "SupplierCapacity_supplierId_deletedAt_idx" ON "SupplierCapacity"("supplierId", "deletedAt");

-- CreateIndex
CREATE INDEX "SupplierPerformance_organizationId_periodEnd_idx" ON "SupplierPerformance"("organizationId", "periodEnd");

-- CreateIndex
CREATE INDEX "SupplierPerformance_organizationId_overallScore_idx" ON "SupplierPerformance"("organizationId", "overallScore");

-- CreateIndex
CREATE INDEX "SupplierPerformance_supplierId_periodEnd_idx" ON "SupplierPerformance"("supplierId", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierPerformance_supplierId_periodStart_periodEnd_key" ON "SupplierPerformance"("supplierId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "SupplierApproval_supplierId_reviewedAt_idx" ON "SupplierApproval"("supplierId", "reviewedAt");

-- CreateIndex
CREATE INDEX "SupplierApproval_organizationId_toStatus_idx" ON "SupplierApproval"("organizationId", "toStatus");

-- CreateIndex
CREATE INDEX "SupplierApproval_organizationId_reviewerId_idx" ON "SupplierApproval"("organizationId", "reviewerId");

-- CreateIndex
CREATE INDEX "SupplierTag_tagId_idx" ON "SupplierTag"("tagId");

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierContact" ADD CONSTRAINT "SupplierContact_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierAddress" ADD CONSTRAINT "SupplierAddress_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierBankAccount" ADD CONSTRAINT "SupplierBankAccount_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCertification" ADD CONSTRAINT "SupplierCertification_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCertification" ADD CONSTRAINT "SupplierCertification_supplierDocumentId_fkey" FOREIGN KEY ("supplierDocumentId") REFERENCES "SupplierDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierDocument" ADD CONSTRAINT "SupplierDocument_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierProductOffering" ADD CONSTRAINT "SupplierProductOffering_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierProductOffering" ADD CONSTRAINT "SupplierProductOffering_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCapacity" ADD CONSTRAINT "SupplierCapacity_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCapacity" ADD CONSTRAINT "SupplierCapacity_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCapacity" ADD CONSTRAINT "SupplierCapacity_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "SupplierAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPerformance" ADD CONSTRAINT "SupplierPerformance_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierApproval" ADD CONSTRAINT "SupplierApproval_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierTag" ADD CONSTRAINT "SupplierTag_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierTag" ADD CONSTRAINT "SupplierTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

