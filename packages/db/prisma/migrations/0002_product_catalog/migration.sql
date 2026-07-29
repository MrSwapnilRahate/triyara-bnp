-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'DISCONTINUED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DataType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'DATE', 'ENUM');

-- CreateEnum
CREATE TYPE "ImageType" AS ENUM ('PRIMARY', 'GALLERY', 'THUMBNAIL', 'PACKAGING', 'LABEL');

-- CreateEnum
CREATE TYPE "ProductDocumentType" AS ENUM ('COA', 'MSDS', 'SPEC_SHEET', 'ISO_CERTIFICATE', 'FSSAI', 'HALAL', 'KOSHER', 'LAB_REPORT', 'ORGANIC_CERTIFICATE', 'PHYTOSANITARY', 'CERTIFICATE_OF_ORIGIN', 'OTHER');

-- CreateEnum
CREATE TYPE "Incoterm" AS ENUM ('EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP');

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "path" TEXT NOT NULL,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "shortDescription" TEXT,
    "description" TEXT,
    "categoryId" TEXT NOT NULL,
    "countryOfOrigin" CHAR(2),
    "brand" TEXT,
    "hsCode" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSpecificationDefinition" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "unit" TEXT,
    "dataType" "DataType" NOT NULL DEFAULT 'STRING',
    "allowedValues" TEXT[],
    "isFilterable" BOOLEAN NOT NULL DEFAULT false,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProductSpecificationDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSpecification" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "valueNumber" DECIMAL(18,6),
    "valueBoolean" BOOLEAN,
    "valueDate" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSpecification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "altText" TEXT,
    "type" "ImageType" NOT NULL DEFAULT 'GALLERY',
    "storageKey" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "fileSize" INTEGER,
    "checksum" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductDocument" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "documentType" "ProductDocumentType" NOT NULL,
    "title" TEXT,
    "fileUrl" TEXT NOT NULL,
    "storageKey" TEXT,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "checksum" TEXT,
    "version" TEXT,
    "issuedBy" TEXT,
    "issuedAt" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "documentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "recordVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProductDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductPrice" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "price" DECIMAL(18,4) NOT NULL,
    "incoterm" "Incoterm" NOT NULL,
    "port" TEXT,
    "minimumOrderQty" DECIMAL(18,4),
    "unit" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProductPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductTag" (
    "productId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductTag_pkey" PRIMARY KEY ("productId","tagId")
);

-- CreateIndex
CREATE INDEX "Category_organizationId_parentId_sortOrder_idx" ON "Category"("organizationId", "parentId", "sortOrder");

-- CreateIndex
CREATE INDEX "Category_organizationId_path_idx" ON "Category"("organizationId", "path");

-- CreateIndex
CREATE INDEX "Category_organizationId_isActive_deletedAt_idx" ON "Category"("organizationId", "isActive", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Category_organizationId_slug_key" ON "Category"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "Product_organizationId_categoryId_status_idx" ON "Product"("organizationId", "categoryId", "status");

-- CreateIndex
CREATE INDEX "Product_organizationId_status_isActive_deletedAt_idx" ON "Product"("organizationId", "status", "isActive", "deletedAt");

-- CreateIndex
CREATE INDEX "Product_organizationId_hsCode_idx" ON "Product"("organizationId", "hsCode");

-- CreateIndex
CREATE INDEX "Product_organizationId_countryOfOrigin_idx" ON "Product"("organizationId", "countryOfOrigin");

-- CreateIndex
CREATE INDEX "Product_organizationId_brand_idx" ON "Product"("organizationId", "brand");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE INDEX "Product_sku_trgm_idx" ON "Product" USING GIN ("sku" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Product_name_trgm_idx" ON "Product" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "Product_organizationId_sku_key" ON "Product"("organizationId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "Product_organizationId_slug_key" ON "Product"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "ProductSpecificationDefinition_organizationId_sortOrder_idx" ON "ProductSpecificationDefinition"("organizationId", "sortOrder");

-- CreateIndex
CREATE INDEX "ProductSpecificationDefinition_organizationId_isFilterable_idx" ON "ProductSpecificationDefinition"("organizationId", "isFilterable");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSpecificationDefinition_organizationId_slug_key" ON "ProductSpecificationDefinition"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "ProductSpecification_productId_idx" ON "ProductSpecification"("productId");

-- CreateIndex
CREATE INDEX "ProductSpecification_definitionId_valueNumber_idx" ON "ProductSpecification"("definitionId", "valueNumber");

-- CreateIndex
CREATE INDEX "ProductSpecification_definitionId_value_idx" ON "ProductSpecification"("definitionId", "value");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSpecification_productId_definitionId_key" ON "ProductSpecification"("productId", "definitionId");

-- CreateIndex
CREATE INDEX "ProductImage_productId_type_sortOrder_idx" ON "ProductImage"("productId", "type", "sortOrder");

-- CreateIndex
CREATE INDEX "ProductImage_productId_deletedAt_idx" ON "ProductImage"("productId", "deletedAt");

-- CreateIndex
CREATE INDEX "ProductDocument_productId_documentType_idx" ON "ProductDocument"("productId", "documentType");

-- CreateIndex
CREATE INDEX "ProductDocument_productId_deletedAt_idx" ON "ProductDocument"("productId", "deletedAt");

-- CreateIndex
CREATE INDEX "ProductDocument_validUntil_idx" ON "ProductDocument"("validUntil");

-- CreateIndex
CREATE INDEX "ProductDocument_documentId_idx" ON "ProductDocument"("documentId");

-- CreateIndex
CREATE INDEX "ProductPrice_productId_isActive_validFrom_validTo_idx" ON "ProductPrice"("productId", "isActive", "validFrom", "validTo");

-- CreateIndex
CREATE INDEX "ProductPrice_productId_incoterm_idx" ON "ProductPrice"("productId", "incoterm");

-- CreateIndex
CREATE INDEX "ProductPrice_productId_currency_idx" ON "ProductPrice"("productId", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "ProductPrice_productId_incoterm_port_currency_minimumOrderQ_key" ON "ProductPrice"("productId", "incoterm", "port", "currency", "minimumOrderQty", "validFrom");

-- CreateIndex
CREATE INDEX "Tag_organizationId_isActive_sortOrder_idx" ON "Tag"("organizationId", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_organizationId_slug_key" ON "Tag"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "ProductTag_tagId_idx" ON "ProductTag"("tagId");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSpecificationDefinition" ADD CONSTRAINT "ProductSpecificationDefinition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSpecification" ADD CONSTRAINT "ProductSpecification_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSpecification" ADD CONSTRAINT "ProductSpecification_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "ProductSpecificationDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductDocument" ADD CONSTRAINT "ProductDocument_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPrice" ADD CONSTRAINT "ProductPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTag" ADD CONSTRAINT "ProductTag_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTag" ADD CONSTRAINT "ProductTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

