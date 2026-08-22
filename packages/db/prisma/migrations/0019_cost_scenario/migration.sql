-- CreateEnum
CREATE TYPE "ShipmentMode" AS ENUM ('SEA_FCL', 'SEA_LCL', 'AIR', 'ROAD', 'RAIL', 'MULTIMODAL');

-- CreateTable
CREATE TABLE "CostScenario" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "buyerId" TEXT,
    "incoterm" "Incoterm" NOT NULL,
    "originLocode" CHAR(5),
    "destinationLocode" CHAR(5),
    "destinationCountry" CHAR(2),
    "mode" "ShipmentMode",
    "grossWeightKg" DECIMAL(18,4),
    "volumeCbm" DECIMAL(18,4),
    "containerCount" INTEGER,
    "unitCost" DECIMAL(18,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "baseCurrency" CHAR(3) NOT NULL,
    "fxRate" DECIMAL(18,8),
    "fxRateDate" TIMESTAMP(3),
    "sellingPricePerUnit" DECIMAL(18,4),
    "createdById" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CostScenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostScenarioCharge" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "ChargeType" NOT NULL,
    "basis" "ChargeCalculationBasis" NOT NULL DEFAULT 'FIXED_AMOUNT',
    "label" TEXT,
    "rate" DECIMAL(12,6),
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "isDeduction" BOOLEAN NOT NULL DEFAULT false,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CostScenarioCharge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CostScenario_organizationId_deletedAt_idx" ON "CostScenario"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "CostScenario_organizationId_productId_idx" ON "CostScenario"("organizationId", "productId");

-- CreateIndex
CREATE INDEX "CostScenario_organizationId_buyerId_idx" ON "CostScenario"("organizationId", "buyerId");

-- CreateIndex
CREATE INDEX "CostScenario_organizationId_incoterm_idx" ON "CostScenario"("organizationId", "incoterm");

-- CreateIndex
CREATE INDEX "CostScenario_organizationId_createdAt_idx" ON "CostScenario"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "CostScenario_productId_idx" ON "CostScenario"("productId");

-- CreateIndex
CREATE INDEX "CostScenario_buyerId_idx" ON "CostScenario"("buyerId");

-- CreateIndex
CREATE INDEX "CostScenarioCharge_scenarioId_sequence_idx" ON "CostScenarioCharge"("scenarioId", "sequence");

-- CreateIndex
CREATE INDEX "CostScenarioCharge_organizationId_type_idx" ON "CostScenarioCharge"("organizationId", "type");

-- CreateIndex
CREATE INDEX "CostScenarioCharge_scenarioId_deletedAt_idx" ON "CostScenarioCharge"("scenarioId", "deletedAt");

-- AddForeignKey
ALTER TABLE "CostScenario" ADD CONSTRAINT "CostScenario_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostScenario" ADD CONSTRAINT "CostScenario_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostScenario" ADD CONSTRAINT "CostScenario_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostScenarioCharge" ADD CONSTRAINT "CostScenarioCharge_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "CostScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
