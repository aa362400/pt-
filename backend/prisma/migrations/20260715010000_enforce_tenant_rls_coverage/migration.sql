-- Enforce tenant isolation for every organization-owned table added after the
-- original RLS baseline. Policies are stated explicitly so schema audits can
-- prove coverage without executing procedural SQL.

ALTER TABLE "agent_autonomy_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agent_autonomy_policies" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agent_autonomy_policies_organization_isolation" ON "agent_autonomy_policies";
CREATE POLICY "agent_autonomy_policies_organization_isolation" ON "agent_autonomy_policies" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

ALTER TABLE "agent_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agent_plans" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agent_plans_organization_isolation" ON "agent_plans";
CREATE POLICY "agent_plans_organization_isolation" ON "agent_plans" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

ALTER TABLE "agent_tool_executions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agent_tool_executions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agent_tool_executions_organization_isolation" ON "agent_tool_executions";
CREATE POLICY "agent_tool_executions_organization_isolation" ON "agent_tool_executions" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

ALTER TABLE "market_observation_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "market_observation_batches" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "market_observation_batches_organization_isolation" ON "market_observation_batches";
CREATE POLICY "market_observation_batches_organization_isolation" ON "market_observation_batches" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

ALTER TABLE "market_observation_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "market_observation_items" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "market_observation_items_organization_isolation" ON "market_observation_items";
CREATE POLICY "market_observation_items_organization_isolation" ON "market_observation_items" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

ALTER TABLE "product_opportunities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_opportunities" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "product_opportunities_organization_isolation" ON "product_opportunities";
CREATE POLICY "product_opportunities_organization_isolation" ON "product_opportunities" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

ALTER TABLE "business_outcomes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "business_outcomes" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "business_outcomes_organization_isolation" ON "business_outcomes";
CREATE POLICY "business_outcomes_organization_isolation" ON "business_outcomes" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

ALTER TABLE "feedback_signals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "feedback_signals" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "feedback_signals_organization_isolation" ON "feedback_signals";
CREATE POLICY "feedback_signals_organization_isolation" ON "feedback_signals" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

ALTER TABLE "agent_eval_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agent_eval_snapshots" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agent_eval_snapshots_organization_isolation" ON "agent_eval_snapshots";
CREATE POLICY "agent_eval_snapshots_organization_isolation" ON "agent_eval_snapshots" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

ALTER TABLE "prompt_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prompt_versions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "prompt_versions_organization_isolation" ON "prompt_versions";
CREATE POLICY "prompt_versions_organization_isolation" ON "prompt_versions" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

ALTER TABLE "router_decision_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "router_decision_logs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "router_decision_logs_organization_isolation" ON "router_decision_logs";
CREATE POLICY "router_decision_logs_organization_isolation" ON "router_decision_logs" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

ALTER TABLE "training_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "training_jobs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "training_jobs_organization_isolation" ON "training_jobs";
CREATE POLICY "training_jobs_organization_isolation" ON "training_jobs" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

ALTER TABLE "agent_transitions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agent_transitions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agent_transitions_organization_isolation" ON "agent_transitions";
CREATE POLICY "agent_transitions_organization_isolation" ON "agent_transitions" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

ALTER TABLE "agent_steps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agent_steps" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agent_steps_organization_isolation" ON "agent_steps";
CREATE POLICY "agent_steps_organization_isolation" ON "agent_steps" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

ALTER TABLE "agent_run_leases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agent_run_leases" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agent_run_leases_organization_isolation" ON "agent_run_leases";
CREATE POLICY "agent_run_leases_organization_isolation" ON "agent_run_leases" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

ALTER TABLE "approval_decisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "approval_decisions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "approval_decisions_organization_isolation" ON "approval_decisions";
CREATE POLICY "approval_decisions_organization_isolation" ON "approval_decisions" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

ALTER TABLE "listing_sandbox_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "listing_sandbox_reports" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "listing_sandbox_reports_organization_isolation" ON "listing_sandbox_reports";
CREATE POLICY "listing_sandbox_reports_organization_isolation" ON "listing_sandbox_reports" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

ALTER TABLE "policy_rule_hits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "policy_rule_hits" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "policy_rule_hits_organization_isolation" ON "policy_rule_hits";
CREATE POLICY "policy_rule_hits_organization_isolation" ON "policy_rule_hits" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));
