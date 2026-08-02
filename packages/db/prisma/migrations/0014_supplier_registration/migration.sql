-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SupplierDocumentType" ADD VALUE 'FACTORY_PHOTOS';
ALTER TYPE "SupplierDocumentType" ADD VALUE 'CERTIFICATE';

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "claimedCertifications" TEXT[],
ADD COLUMN     "containerCapacity" TEXT,
ADD COLUMN     "employeeCount" INTEGER,
ADD COLUMN     "establishedYear" INTEGER,
ADD COLUMN     "exportCountries" TEXT[],
ADD COLUMN     "isSelfRegistered" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "languages" TEXT[],
ADD COLUMN     "leadTimeDays" INTEGER,
ADD COLUMN     "moq" TEXT,
ADD COLUMN     "packaging" TEXT,
ADD COLUMN     "paymentTerms" TEXT,
ADD COLUMN     "productionCapacity" TEXT,
ADD COLUMN     "proposedProducts" TEXT[],
ADD COLUMN     "shippingPorts" TEXT[],
ADD COLUMN     "submittedAt" TIMESTAMP(3);

