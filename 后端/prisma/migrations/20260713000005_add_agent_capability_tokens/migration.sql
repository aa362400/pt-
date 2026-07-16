CREATE TABLE "agent_capability_tokens" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "actorId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "actions" TEXT[],
    "description" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_capability_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_capability_tokens_tokenHash_key"
ON "agent_capability_tokens"("tokenHash");
CREATE INDEX "agent_capability_tokens_organizationId_expiresAt_idx"
ON "agent_capability_tokens"("organizationId", "expiresAt");
CREATE INDEX "agent_capability_tokens_organizationId_revokedAt_idx"
ON "agent_capability_tokens"("organizationId", "revokedAt");
CREATE INDEX "agent_capability_tokens_workspaceId_idx"
ON "agent_capability_tokens"("workspaceId");
CREATE INDEX "agent_capability_tokens_actorId_idx"
ON "agent_capability_tokens"("actorId");

ALTER TABLE "agent_capability_tokens"
ADD CONSTRAINT "agent_capability_tokens_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agent_capability_tokens"
ADD CONSTRAINT "agent_capability_tokens_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agent_capability_tokens"
ADD CONSTRAINT "agent_capability_tokens_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
