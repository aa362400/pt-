UPDATE "dead_letter_jobs" AS dead_letter
SET "organizationId" = agent_run."organizationId"
FROM "agent_runs" AS agent_run
WHERE dead_letter."organizationId" IS NULL
  AND dead_letter."queueName" = 'agent-runs'
  AND dead_letter."data" ->> 'agentRunId' = agent_run."id";

UPDATE "dead_letter_jobs" AS dead_letter
SET "organizationId" = automation_flow."organizationId"
FROM "automation_runs" AS automation_run
JOIN "automation_flows" AS automation_flow
  ON automation_flow."id" = automation_run."flowId"
WHERE dead_letter."organizationId" IS NULL
  AND dead_letter."queueName" = 'automation-runs'
  AND dead_letter."data" ->> 'automationRunId' = automation_run."id";
