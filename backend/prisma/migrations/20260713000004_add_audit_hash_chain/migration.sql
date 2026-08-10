ALTER TABLE "audit_logs"
ADD COLUMN "sequence" BIGINT,
ADD COLUMN "previousHash" TEXT,
ADD COLUMN "entryHash" TEXT,
ADD COLUMN "hashAlgorithm" TEXT DEFAULT 'SHA-256';

CREATE UNIQUE INDEX "audit_logs_entryHash_key" ON "audit_logs"("entryHash");
CREATE UNIQUE INDEX "audit_logs_organizationId_sequence_key"
ON "audit_logs"("organizationId", "sequence");

CREATE TABLE "audit_chain_heads" (
    "organizationId" TEXT NOT NULL,
    "lastSequence" BIGINT NOT NULL DEFAULT 0,
    "lastHash" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "audit_chain_heads_pkey" PRIMARY KEY ("organizationId")
);

ALTER TABLE "audit_chain_heads"
ADD CONSTRAINT "audit_chain_heads_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
