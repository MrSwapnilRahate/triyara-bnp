-- Admin access requests (TRY-BNP-SUPERADMIN-01).
--
-- Additive: a new enum, a new table and its indexes. No existing table or
-- column is touched.

CREATE TYPE "AdminAccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "AdminAccessRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "requesterEmail" TEXT NOT NULL,
    "currentRole" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "AdminAccessRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminAccessRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminAccessRequest_organizationId_status_createdAt_idx"
    ON "AdminAccessRequest"("organizationId", "status", "createdAt");

CREATE INDEX "AdminAccessRequest_userId_createdAt_idx"
    ON "AdminAccessRequest"("userId", "createdAt");

CREATE INDEX "AdminAccessRequest_organizationId_requesterEmail_idx"
    ON "AdminAccessRequest"("organizationId", "requesterEmail");

ALTER TABLE "AdminAccessRequest" ADD CONSTRAINT "AdminAccessRequest_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdminAccessRequest" ADD CONSTRAINT "AdminAccessRequest_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One pending request per person, enforced by the database.
--
-- A service-level "does one already exist" read would let two simultaneous
-- submissions both pass before either wrote. Prisma cannot express a partial
-- unique index, so this lives here and is covered by a test rather than by
-- `migrate diff`.
CREATE UNIQUE INDEX "AdminAccessRequest_one_pending_per_user"
    ON "AdminAccessRequest"("userId") WHERE "status" = 'PENDING';
