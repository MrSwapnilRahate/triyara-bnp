-- CreateEnum
CREATE TYPE "RFQType" AS ENUM ('BUYER', 'INTERNAL');

-- CreateEnum
CREATE TYPE "RFQStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ISSUED', 'IN_PROGRESS', 'EVALUATING', 'AWARDED', 'CLOSED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RFQPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "RFQSupplierStatus" AS ENUM ('INVITED', 'VIEWED', 'ACCEPTED', 'DECLINED', 'SUBMITTED', 'NO_RESPONSE', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "RFQAttachmentType" AS ENUM ('SPECIFICATION', 'DRAWING', 'CERTIFICATE', 'IMAGE', 'PDF', 'PRICE_SHEET', 'OTHER');

-- CreateEnum
CREATE TYPE "RFQApprovalStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "RFQ" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "rfqNumber" TEXT NOT NULL,
    "type" "RFQType" NOT NULL DEFAULT 'BUYER',
    "buyerId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "currency" CHAR(3),
    "incoterm" "Incoterm",
    "destinationCountry" CHAR(2),
    "destinationPort" TEXT,
    "expectedShipmentDate" TIMESTAMP(3),
    "quotationDeadline" TIMESTAMP(3),
    "status" "RFQStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" "RFQPriority" NOT NULL DEFAULT 'NORMAL',
    "currentRevision" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "deletedById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RFQ_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RFQItem" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "productId" TEXT,
    "customProductName" TEXT,
    "customProductDescription" TEXT,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "targetPrice" DECIMAL(18,4),
    "targetCurrency" CHAR(3),
    "specifications" JSONB,
    "requiredCertifications" "CertificationType"[],
    "packaging" TEXT,
    "remarks" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RFQItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RFQSupplier" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" "RFQSupplierStatus" NOT NULL DEFAULT 'INVITED',
    "invitedById" TEXT NOT NULL,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewedAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "submittedAt" TIMESTAMP(3),
    "isLate" BOOLEAN NOT NULL DEFAULT false,
    "quotationCurrency" CHAR(3),
    "quotationIncoterm" "Incoterm",
    "quotationPort" TEXT,
    "quotationValidUntil" TIMESTAMP(3),
    "quotationRemarks" TEXT,
    "quotationTotal" DECIMAL(18,4),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RFQSupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RFQSupplierResponse" (
    "id" TEXT NOT NULL,
    "rfqSupplierId" TEXT NOT NULL,
    "rfqItemId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL DEFAULT 1,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "price" DECIMAL(18,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "moq" DECIMAL(18,4),
    "moqUnit" TEXT,
    "leadTimeDays" INTEGER,
    "incoterm" "Incoterm",
    "port" TEXT,
    "offeredProductId" TEXT,
    "offeredDescription" TEXT,
    "remarks" TEXT,
    "validUntil" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RFQSupplierResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RFQAttachment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "rfqSupplierId" TEXT,
    "rfqSupplierResponseId" TEXT,
    "type" "RFQAttachmentType" NOT NULL DEFAULT 'OTHER',
    "title" TEXT,
    "fileUrl" TEXT NOT NULL,
    "storageKey" TEXT,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "checksum" TEXT,
    "documentId" TEXT,
    "isVisibleToSuppliers" BOOLEAN NOT NULL DEFAULT true,
    "uploadedById" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RFQAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RFQComment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "parentId" TEXT,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT true,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RFQComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RFQRevision" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "reason" TEXT,
    "snapshot" JSONB NOT NULL,
    "changedById" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RFQRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RFQApproval" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "fromStatus" "RFQApprovalStatus",
    "toStatus" "RFQApprovalStatus" NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "approverId" TEXT NOT NULL,
    "comments" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RFQApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RFQ_organizationId_status_deletedAt_idx" ON "RFQ"("organizationId", "status", "deletedAt");

-- CreateIndex
CREATE INDEX "RFQ_organizationId_buyerId_status_idx" ON "RFQ"("organizationId", "buyerId", "status");

-- CreateIndex
CREATE INDEX "RFQ_organizationId_quotationDeadline_idx" ON "RFQ"("organizationId", "quotationDeadline");

-- CreateIndex
CREATE INDEX "RFQ_organizationId_destinationCountry_destinationPort_idx" ON "RFQ"("organizationId", "destinationCountry", "destinationPort");

-- CreateIndex
CREATE INDEX "RFQ_organizationId_priority_status_idx" ON "RFQ"("organizationId", "priority", "status");

-- CreateIndex
CREATE INDEX "RFQ_organizationId_createdAt_idx" ON "RFQ"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "RFQ_buyerId_idx" ON "RFQ"("buyerId");

-- CreateIndex
CREATE INDEX "RFQ_number_trgm_idx" ON "RFQ" USING GIN ("rfqNumber" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "RFQ_organizationId_rfqNumber_key" ON "RFQ"("organizationId", "rfqNumber");

-- CreateIndex
CREATE INDEX "RFQItem_rfqId_idx" ON "RFQItem"("rfqId");

-- CreateIndex
CREATE INDEX "RFQItem_organizationId_productId_idx" ON "RFQItem"("organizationId", "productId");

-- CreateIndex
CREATE INDEX "RFQItem_rfqId_deletedAt_idx" ON "RFQItem"("rfqId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RFQItem_rfqId_lineNumber_key" ON "RFQItem"("rfqId", "lineNumber");

-- CreateIndex
CREATE INDEX "RFQSupplier_rfqId_status_idx" ON "RFQSupplier"("rfqId", "status");

-- CreateIndex
CREATE INDEX "RFQSupplier_organizationId_supplierId_status_idx" ON "RFQSupplier"("organizationId", "supplierId", "status");

-- CreateIndex
CREATE INDEX "RFQSupplier_organizationId_submittedAt_idx" ON "RFQSupplier"("organizationId", "submittedAt");

-- CreateIndex
CREATE INDEX "RFQSupplier_supplierId_idx" ON "RFQSupplier"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "RFQSupplier_rfqId_supplierId_key" ON "RFQSupplier"("rfqId", "supplierId");

-- CreateIndex
CREATE INDEX "RFQSupplierResponse_rfqItemId_isCurrent_price_idx" ON "RFQSupplierResponse"("rfqItemId", "isCurrent", "price");

-- CreateIndex
CREATE INDEX "RFQSupplierResponse_rfqSupplierId_isCurrent_idx" ON "RFQSupplierResponse"("rfqSupplierId", "isCurrent");

-- CreateIndex
CREATE INDEX "RFQSupplierResponse_organizationId_validUntil_idx" ON "RFQSupplierResponse"("organizationId", "validUntil");

-- CreateIndex
CREATE INDEX "RFQSupplierResponse_offeredProductId_idx" ON "RFQSupplierResponse"("offeredProductId");

-- CreateIndex
CREATE UNIQUE INDEX "RFQSupplierResponse_rfqSupplierId_rfqItemId_revisionNumber_key" ON "RFQSupplierResponse"("rfqSupplierId", "rfqItemId", "revisionNumber");

-- CreateIndex
CREATE INDEX "RFQAttachment_rfqId_type_idx" ON "RFQAttachment"("rfqId", "type");

-- CreateIndex
CREATE INDEX "RFQAttachment_rfqSupplierId_idx" ON "RFQAttachment"("rfqSupplierId");

-- CreateIndex
CREATE INDEX "RFQAttachment_rfqSupplierResponseId_idx" ON "RFQAttachment"("rfqSupplierResponseId");

-- CreateIndex
CREATE INDEX "RFQAttachment_organizationId_deletedAt_idx" ON "RFQAttachment"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "RFQAttachment_documentId_idx" ON "RFQAttachment"("documentId");

-- CreateIndex
CREATE INDEX "RFQComment_rfqId_createdAt_idx" ON "RFQComment"("rfqId", "createdAt");

-- CreateIndex
CREATE INDEX "RFQComment_parentId_idx" ON "RFQComment"("parentId");

-- CreateIndex
CREATE INDEX "RFQComment_organizationId_authorId_idx" ON "RFQComment"("organizationId", "authorId");

-- CreateIndex
CREATE INDEX "RFQComment_rfqId_deletedAt_idx" ON "RFQComment"("rfqId", "deletedAt");

-- CreateIndex
CREATE INDEX "RFQRevision_organizationId_changedAt_idx" ON "RFQRevision"("organizationId", "changedAt");

-- CreateIndex
CREATE INDEX "RFQRevision_rfqId_changedAt_idx" ON "RFQRevision"("rfqId", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RFQRevision_rfqId_revisionNumber_key" ON "RFQRevision"("rfqId", "revisionNumber");

-- CreateIndex
CREATE INDEX "RFQApproval_rfqId_decidedAt_idx" ON "RFQApproval"("rfqId", "decidedAt");

-- CreateIndex
CREATE INDEX "RFQApproval_organizationId_toStatus_idx" ON "RFQApproval"("organizationId", "toStatus");

-- CreateIndex
CREATE INDEX "RFQApproval_organizationId_approverId_idx" ON "RFQApproval"("organizationId", "approverId");

-- AddForeignKey
ALTER TABLE "RFQ" ADD CONSTRAINT "RFQ_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RFQ" ADD CONSTRAINT "RFQ_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RFQItem" ADD CONSTRAINT "RFQItem_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "RFQ"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RFQItem" ADD CONSTRAINT "RFQItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RFQSupplier" ADD CONSTRAINT "RFQSupplier_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "RFQ"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RFQSupplier" ADD CONSTRAINT "RFQSupplier_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RFQSupplierResponse" ADD CONSTRAINT "RFQSupplierResponse_rfqSupplierId_fkey" FOREIGN KEY ("rfqSupplierId") REFERENCES "RFQSupplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RFQSupplierResponse" ADD CONSTRAINT "RFQSupplierResponse_rfqItemId_fkey" FOREIGN KEY ("rfqItemId") REFERENCES "RFQItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RFQSupplierResponse" ADD CONSTRAINT "RFQSupplierResponse_offeredProductId_fkey" FOREIGN KEY ("offeredProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RFQAttachment" ADD CONSTRAINT "RFQAttachment_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "RFQ"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RFQAttachment" ADD CONSTRAINT "RFQAttachment_rfqSupplierId_fkey" FOREIGN KEY ("rfqSupplierId") REFERENCES "RFQSupplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RFQAttachment" ADD CONSTRAINT "RFQAttachment_rfqSupplierResponseId_fkey" FOREIGN KEY ("rfqSupplierResponseId") REFERENCES "RFQSupplierResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RFQComment" ADD CONSTRAINT "RFQComment_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "RFQ"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RFQComment" ADD CONSTRAINT "RFQComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "RFQComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RFQRevision" ADD CONSTRAINT "RFQRevision_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "RFQ"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RFQApproval" ADD CONSTRAINT "RFQApproval_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "RFQ"("id") ON DELETE CASCADE ON UPDATE CASCADE;

