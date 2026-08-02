-- CreateEnum
CREATE TYPE "SupplierNoteSource" AS ENUM ('WHATSAPP', 'INSTAGRAM', 'LINKEDIN', 'EMAIL', 'PHONE', 'TRADEINDIA', 'INDIAMART', 'OTHER');

-- CreateTable
CREATE TABLE "SupplierNote" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "source" "SupplierNoteSource",
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SupplierNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplierNote_supplierId_deletedAt_createdAt_idx" ON "SupplierNote"("supplierId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "SupplierNote_organizationId_authorId_idx" ON "SupplierNote"("organizationId", "authorId");

-- CreateIndex
CREATE INDEX "SupplierNote_organizationId_source_idx" ON "SupplierNote"("organizationId", "source");

-- AddForeignKey
ALTER TABLE "SupplierNote" ADD CONSTRAINT "SupplierNote_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

