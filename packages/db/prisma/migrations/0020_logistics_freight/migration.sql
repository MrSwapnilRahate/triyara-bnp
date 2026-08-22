-- AlterTable
ALTER TABLE "CostScenario" ADD COLUMN     "containerTypeId" TEXT,
ADD COLUMN     "destinationPortId" TEXT,
ADD COLUMN     "originPortId" TEXT;

-- CreateTable
CREATE TABLE "Port" (
    "id" TEXT NOT NULL,
    "locode" CHAR(5) NOT NULL,
    "name" TEXT NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "modes" "ShipmentMode"[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Port_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContainerType" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(8) NOT NULL,
    "name" TEXT NOT NULL,
    "teu" DECIMAL(4,2) NOT NULL,
    "maxPayloadKg" DECIMAL(10,2),
    "internalVolumeCbm" DECIMAL(10,3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContainerType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FreightRate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "originPortId" TEXT NOT NULL,
    "destinationPortId" TEXT NOT NULL,
    "mode" "ShipmentMode" NOT NULL,
    "containerTypeId" TEXT,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "source" TEXT,
    "notes" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FreightRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Port_countryCode_idx" ON "Port"("countryCode");

-- CreateIndex
CREATE INDEX "Port_isActive_idx" ON "Port"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Port_locode_key" ON "Port"("locode");

-- CreateIndex
CREATE INDEX "ContainerType_isActive_idx" ON "ContainerType"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ContainerType_code_key" ON "ContainerType"("code");

-- CreateIndex
CREATE INDEX "FreightRate_organizationId_deletedAt_idx" ON "FreightRate"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "FreightRate_organizationId_originPortId_destinationPortId_m_idx" ON "FreightRate"("organizationId", "originPortId", "destinationPortId", "mode");

-- CreateIndex
CREATE INDEX "FreightRate_organizationId_effectiveFrom_effectiveTo_idx" ON "FreightRate"("organizationId", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "FreightRate_originPortId_idx" ON "FreightRate"("originPortId");

-- CreateIndex
CREATE INDEX "FreightRate_destinationPortId_idx" ON "FreightRate"("destinationPortId");

-- CreateIndex
CREATE INDEX "FreightRate_containerTypeId_idx" ON "FreightRate"("containerTypeId");

-- CreateIndex
CREATE INDEX "CostScenario_originPortId_idx" ON "CostScenario"("originPortId");

-- CreateIndex
CREATE INDEX "CostScenario_destinationPortId_idx" ON "CostScenario"("destinationPortId");

-- AddForeignKey
ALTER TABLE "CostScenario" ADD CONSTRAINT "CostScenario_originPortId_fkey" FOREIGN KEY ("originPortId") REFERENCES "Port"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostScenario" ADD CONSTRAINT "CostScenario_destinationPortId_fkey" FOREIGN KEY ("destinationPortId") REFERENCES "Port"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostScenario" ADD CONSTRAINT "CostScenario_containerTypeId_fkey" FOREIGN KEY ("containerTypeId") REFERENCES "ContainerType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreightRate" ADD CONSTRAINT "FreightRate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreightRate" ADD CONSTRAINT "FreightRate_originPortId_fkey" FOREIGN KEY ("originPortId") REFERENCES "Port"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreightRate" ADD CONSTRAINT "FreightRate_destinationPortId_fkey" FOREIGN KEY ("destinationPortId") REFERENCES "Port"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreightRate" ADD CONSTRAINT "FreightRate_containerTypeId_fkey" FOREIGN KEY ("containerTypeId") REFERENCES "ContainerType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- FreightRate integrity (V3.3, ADR-0012).
--
-- These four rules are carried by the database, not only by the service. A
-- freight rate is commercial data that V3.4's engine will select automatically:
-- if two live rates could cover the same corridor on the same day, selection
-- becomes ambiguous, and an ambiguous cost is worse than a missing one.
--
-- tsrange (not tstzrange) because Prisma maps DateTime to timestamp(3) without
-- time zone; tstzrange would additionally not be immutable here. This mirrors
-- ProductPrice_no_overlapping_validity and SupplierCapacity_no_overlapping_windows.
-- ---------------------------------------------------------------------------

-- A corridor from a port to itself is not a route.
ALTER TABLE "FreightRate"
  ADD CONSTRAINT "FreightRate_distinct_ports"
  CHECK ("originPortId" <> "destinationPortId");

-- Containerised modes need a container standard; the others must not carry one,
-- so nothing ever invents a placeholder container id to satisfy a column.
-- MULTIMODAL is deliberately permissive: a leg may or may not be containerised.
ALTER TABLE "FreightRate"
  ADD CONSTRAINT "FreightRate_container_matches_mode"
  CHECK (
    ("mode" = 'SEA_FCL'    AND "containerTypeId" IS NOT NULL)
    OR ("mode" = 'MULTIMODAL')
    OR ("mode" IN ('SEA_LCL', 'AIR', 'ROAD', 'RAIL') AND "containerTypeId" IS NULL)
  );

-- An open-ended rate has no end date; a closed one must end after it starts.
ALTER TABLE "FreightRate"
  ADD CONSTRAINT "FreightRate_effective_order"
  CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom");

-- A negative freight rate is not a discount, it is a data error.
ALTER TABLE "FreightRate"
  ADD CONSTRAINT "FreightRate_amount_non_negative"
  CHECK ("amount" >= 0);

-- At most one live rate per corridor at any instant, so V3.4 selects
-- deterministically. COALESCE on the nullable container id keeps non-containerised
-- modes inside the same rule rather than silently exempt from it.
ALTER TABLE "FreightRate"
  ADD CONSTRAINT "FreightRate_no_overlapping_validity"
  EXCLUDE USING gist (
    "organizationId" WITH =,
    "originPortId" WITH =,
    "destinationPortId" WITH =,
    "mode" WITH =,
    (COALESCE("containerTypeId", '')) WITH =,
    tsrange("effectiveFrom", "effectiveTo") WITH &&
  )
  WHERE ("deletedAt" IS NULL);
