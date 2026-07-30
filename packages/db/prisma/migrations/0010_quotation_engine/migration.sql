-- CreateEnum
CREATE TYPE "QuotationType" AS ENUM ('BUDGETARY', 'FIRM', 'PROFORMA');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'UNDER_NEGOTIATION', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'WITHDRAWN', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "QuotationApprovalStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ChargeType" AS ENUM ('FREIGHT', 'INSURANCE', 'PACKING', 'SAMPLING', 'HANDLING', 'INSPECTION', 'CERTIFICATION', 'DOCUMENTATION', 'BANK_CHARGES', 'DISCOUNT', 'SURCHARGE', 'OTHER');

-- CreateEnum
CREATE TYPE "ChargeCalculationBasis" AS ENUM ('FIXED_AMOUNT', 'PERCENTAGE', 'PER_UNIT', 'PER_WEIGHT', 'PER_CONTAINER');

-- CreateEnum
CREATE TYPE "ChargeScope" AS ENUM ('HEADER', 'LINE');

-- CreateEnum
CREATE TYPE "TaxType" AS ENUM ('GST', 'IGST', 'CGST', 'SGST', 'VAT', 'CUSTOMS_DUTY', 'CESS', 'WITHHOLDING', 'OTHER');

-- CreateEnum
CREATE TYPE "ExchangeRateSource" AS ENUM ('MANUAL', 'RBI', 'ECB', 'MARKET_FEED', 'IMPORTED');

-- CreateTable
CREATE TABLE "PaymentTerm" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "netDays" INTEGER,
    "advancePercent" DECIMAL(5,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fromCurrency" CHAR(3) NOT NULL,
    "toCurrency" CHAR(3) NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "source" "ExchangeRateSource" NOT NULL DEFAULT 'MANUAL',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "quotationNumber" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL DEFAULT 1,
    "type" "QuotationType" NOT NULL DEFAULT 'FIRM',
    "buyerId" TEXT NOT NULL,
    "primaryRfqId" TEXT,
    "title" TEXT,
    "description" TEXT,
    "previousRevisionId" TEXT,
    "supersededAt" TIMESTAMP(3),
    "currency" CHAR(3) NOT NULL,
    "baseCurrency" CHAR(3) NOT NULL,
    "fxRate" DECIMAL(18,8),
    "fxRateDate" TIMESTAMP(3),
    "incoterm" "Incoterm",
    "namedPlace" TEXT,
    "destinationCountry" CHAR(2),
    "destinationPort" TEXT,
    "paymentTermId" TEXT,
    "paymentTermsText" TEXT,
    "leadTimeDays" INTEGER,
    "packingSummary" TEXT,
    "samplingTerms" TEXT,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotal" DECIMAL(18,4),
    "chargesTotal" DECIMAL(18,4),
    "discountTotal" DECIMAL(18,4),
    "taxTotal" DECIMAL(18,4),
    "grandTotal" DECIMAL(18,4),
    "costTotal" DECIMAL(18,4),
    "marginPercent" DECIMAL(9,4),
    "sentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "deletedById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationItem" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "productId" TEXT,
    "customProductName" TEXT,
    "description" TEXT,
    "rfqItemId" TEXT,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitCost" DECIMAL(18,4),
    "marginPercent" DECIMAL(9,4),
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "lineSubtotal" DECIMAL(18,4) NOT NULL,
    "lineTotal" DECIMAL(18,4) NOT NULL,
    "packaging" TEXT,
    "hsCode" TEXT,
    "countryOfOrigin" CHAR(2),
    "requiredCertifications" "CertificationType"[],
    "leadTimeDays" INTEGER,
    "remarks" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "QuotationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationSourceOption" (
    "id" TEXT NOT NULL,
    "quotationItemId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "rfqSupplierResponseId" TEXT,
    "supplierPrice" DECIMAL(18,4) NOT NULL,
    "supplierCurrency" CHAR(3) NOT NULL,
    "fxRate" DECIMAL(18,8),
    "landedUnitCost" DECIMAL(18,4) NOT NULL,
    "moq" DECIMAL(18,4),
    "leadTimeDays" INTEGER,
    "incoterm" "Incoterm",
    "port" TEXT,
    "rank" INTEGER,
    "isSelected" BOOLEAN NOT NULL DEFAULT false,
    "selectionReason" TEXT,
    "selectedById" TEXT,
    "selectedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "QuotationSourceOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationCharge" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "quotationItemId" TEXT,
    "type" "ChargeType" NOT NULL,
    "scope" "ChargeScope" NOT NULL DEFAULT 'HEADER',
    "basis" "ChargeCalculationBasis" NOT NULL DEFAULT 'FIXED_AMOUNT',
    "label" TEXT,
    "rate" DECIMAL(12,6),
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "isDeduction" BOOLEAN NOT NULL DEFAULT false,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "isVisibleToCustomer" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "QuotationCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationTax" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "quotationItemId" TEXT,
    "type" "TaxType" NOT NULL,
    "code" TEXT,
    "jurisdiction" TEXT,
    "ratePercent" DECIMAL(9,4) NOT NULL,
    "taxableAmount" DECIMAL(18,4) NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "isCompound" BOOLEAN NOT NULL DEFAULT false,
    "isReverseCharge" BOOLEAN NOT NULL DEFAULT false,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "QuotationTax_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationRevision" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "fromRevision" INTEGER,
    "toRevision" INTEGER NOT NULL,
    "reason" TEXT,
    "changeSummary" JSONB,
    "changedById" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationApproval" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "fromStatus" "QuotationApprovalStatus",
    "toStatus" "QuotationApprovalStatus" NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "approverId" TEXT NOT NULL,
    "thresholdAmount" DECIMAL(18,4),
    "marginPercent" DECIMAL(9,4),
    "comments" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationComment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "parentId" TEXT,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT true,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "QuotationComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentTerm_organizationId_isActive_sortOrder_idx" ON "PaymentTerm"("organizationId", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTerm_organizationId_code_key" ON "PaymentTerm"("organizationId", "code");

-- CreateIndex
CREATE INDEX "ExchangeRate_organizationId_fromCurrency_toCurrency_effecti_idx" ON "ExchangeRate"("organizationId", "fromCurrency", "toCurrency", "effectiveFrom");

-- CreateIndex
CREATE INDEX "ExchangeRate_organizationId_effectiveFrom_idx" ON "ExchangeRate"("organizationId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_organizationId_fromCurrency_toCurrency_effecti_key" ON "ExchangeRate"("organizationId", "fromCurrency", "toCurrency", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_previousRevisionId_key" ON "Quotation"("previousRevisionId");

-- CreateIndex
CREATE INDEX "Quotation_organizationId_status_deletedAt_idx" ON "Quotation"("organizationId", "status", "deletedAt");

-- CreateIndex
CREATE INDEX "Quotation_organizationId_buyerId_status_idx" ON "Quotation"("organizationId", "buyerId", "status");

-- CreateIndex
CREATE INDEX "Quotation_organizationId_validUntil_idx" ON "Quotation"("organizationId", "validUntil");

-- CreateIndex
CREATE INDEX "Quotation_organizationId_quotationNumber_idx" ON "Quotation"("organizationId", "quotationNumber");

-- CreateIndex
CREATE INDEX "Quotation_organizationId_createdAt_idx" ON "Quotation"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Quotation_primaryRfqId_idx" ON "Quotation"("primaryRfqId");

-- CreateIndex
CREATE INDEX "Quotation_buyerId_idx" ON "Quotation"("buyerId");

-- CreateIndex
CREATE INDEX "Quotation_paymentTermId_idx" ON "Quotation"("paymentTermId");

-- CreateIndex
CREATE INDEX "Quotation_number_trgm_idx" ON "Quotation" USING GIN ("quotationNumber" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_organizationId_quotationNumber_revisionNumber_key" ON "Quotation"("organizationId", "quotationNumber", "revisionNumber");

-- CreateIndex
CREATE INDEX "QuotationItem_quotationId_idx" ON "QuotationItem"("quotationId");

-- CreateIndex
CREATE INDEX "QuotationItem_organizationId_productId_idx" ON "QuotationItem"("organizationId", "productId");

-- CreateIndex
CREATE INDEX "QuotationItem_rfqItemId_idx" ON "QuotationItem"("rfqItemId");

-- CreateIndex
CREATE INDEX "QuotationItem_quotationId_deletedAt_idx" ON "QuotationItem"("quotationId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuotationItem_quotationId_lineNumber_key" ON "QuotationItem"("quotationId", "lineNumber");

-- CreateIndex
CREATE INDEX "QuotationSourceOption_quotationItemId_landedUnitCost_idx" ON "QuotationSourceOption"("quotationItemId", "landedUnitCost");

-- CreateIndex
CREATE INDEX "QuotationSourceOption_quotationItemId_isSelected_idx" ON "QuotationSourceOption"("quotationItemId", "isSelected");

-- CreateIndex
CREATE INDEX "QuotationSourceOption_organizationId_supplierId_idx" ON "QuotationSourceOption"("organizationId", "supplierId");

-- CreateIndex
CREATE INDEX "QuotationSourceOption_rfqSupplierResponseId_idx" ON "QuotationSourceOption"("rfqSupplierResponseId");

-- CreateIndex
CREATE UNIQUE INDEX "QuotationSourceOption_quotationItemId_supplierId_key" ON "QuotationSourceOption"("quotationItemId", "supplierId");

-- CreateIndex
CREATE INDEX "QuotationCharge_quotationId_scope_sequence_idx" ON "QuotationCharge"("quotationId", "scope", "sequence");

-- CreateIndex
CREATE INDEX "QuotationCharge_quotationItemId_idx" ON "QuotationCharge"("quotationItemId");

-- CreateIndex
CREATE INDEX "QuotationCharge_organizationId_type_idx" ON "QuotationCharge"("organizationId", "type");

-- CreateIndex
CREATE INDEX "QuotationTax_quotationId_sequence_idx" ON "QuotationTax"("quotationId", "sequence");

-- CreateIndex
CREATE INDEX "QuotationTax_quotationItemId_idx" ON "QuotationTax"("quotationItemId");

-- CreateIndex
CREATE INDEX "QuotationTax_organizationId_type_idx" ON "QuotationTax"("organizationId", "type");

-- CreateIndex
CREATE INDEX "QuotationRevision_organizationId_changedAt_idx" ON "QuotationRevision"("organizationId", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuotationRevision_quotationId_toRevision_key" ON "QuotationRevision"("quotationId", "toRevision");

-- CreateIndex
CREATE INDEX "QuotationApproval_quotationId_decidedAt_idx" ON "QuotationApproval"("quotationId", "decidedAt");

-- CreateIndex
CREATE INDEX "QuotationApproval_organizationId_toStatus_idx" ON "QuotationApproval"("organizationId", "toStatus");

-- CreateIndex
CREATE INDEX "QuotationApproval_organizationId_approverId_idx" ON "QuotationApproval"("organizationId", "approverId");

-- CreateIndex
CREATE INDEX "QuotationComment_quotationId_createdAt_idx" ON "QuotationComment"("quotationId", "createdAt");

-- CreateIndex
CREATE INDEX "QuotationComment_parentId_idx" ON "QuotationComment"("parentId");

-- CreateIndex
CREATE INDEX "QuotationComment_organizationId_authorId_idx" ON "QuotationComment"("organizationId", "authorId");

-- AddForeignKey
ALTER TABLE "PaymentTerm" ADD CONSTRAINT "PaymentTerm_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_primaryRfqId_fkey" FOREIGN KEY ("primaryRfqId") REFERENCES "RFQ"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_paymentTermId_fkey" FOREIGN KEY ("paymentTermId") REFERENCES "PaymentTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_previousRevisionId_fkey" FOREIGN KEY ("previousRevisionId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_rfqItemId_fkey" FOREIGN KEY ("rfqItemId") REFERENCES "RFQItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationSourceOption" ADD CONSTRAINT "QuotationSourceOption_quotationItemId_fkey" FOREIGN KEY ("quotationItemId") REFERENCES "QuotationItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationSourceOption" ADD CONSTRAINT "QuotationSourceOption_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationSourceOption" ADD CONSTRAINT "QuotationSourceOption_rfqSupplierResponseId_fkey" FOREIGN KEY ("rfqSupplierResponseId") REFERENCES "RFQSupplierResponse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationCharge" ADD CONSTRAINT "QuotationCharge_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationCharge" ADD CONSTRAINT "QuotationCharge_quotationItemId_fkey" FOREIGN KEY ("quotationItemId") REFERENCES "QuotationItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationTax" ADD CONSTRAINT "QuotationTax_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationTax" ADD CONSTRAINT "QuotationTax_quotationItemId_fkey" FOREIGN KEY ("quotationItemId") REFERENCES "QuotationItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationRevision" ADD CONSTRAINT "QuotationRevision_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationApproval" ADD CONSTRAINT "QuotationApproval_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationComment" ADD CONSTRAINT "QuotationComment_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationComment" ADD CONSTRAINT "QuotationComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "QuotationComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

