CREATE TYPE "McpInvocationStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

CREATE TABLE "mcp_tool_invocations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "status" "McpInvocationStatus" NOT NULL DEFAULT 'RUNNING',
    "input" JSONB NOT NULL,
    "output" JSONB,
    "durationMs" INTEGER,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mcp_tool_invocations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mcp_tool_invocations_organizationId_createdAt_idx" ON "mcp_tool_invocations"("organizationId", "createdAt");
CREATE INDEX "mcp_tool_invocations_workspaceId_idx" ON "mcp_tool_invocations"("workspaceId");
CREATE INDEX "mcp_tool_invocations_toolName_idx" ON "mcp_tool_invocations"("toolName");
CREATE INDEX "mcp_tool_invocations_status_idx" ON "mcp_tool_invocations"("status");

ALTER TABLE "mcp_tool_invocations" ADD CONSTRAINT "mcp_tool_invocations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mcp_tool_invocations" ADD CONSTRAINT "mcp_tool_invocations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
