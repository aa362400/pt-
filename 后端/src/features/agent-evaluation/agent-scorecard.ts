export const AGENT_SCORECARD_VERSION = 'agent-scorecard/v1' as const;

export interface AgentScorecardRunFact {
  id: string;
  status: string;
  attempt: number;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export interface AgentScorecardFeedbackFact {
  runId: string | null;
  signalType: string;
}

interface RatioMetric {
  value: number | null;
  numerator: number;
  denominator: number;
  reason: 'DENOMINATOR_ZERO' | null;
}

function ratio(numerator: number, denominator: number): RatioMetric {
  return denominator === 0
    ? { value: null, numerator, denominator, reason: 'DENOMINATOR_ZERO' }
    : { value: numerator / denominator, numerator, denominator, reason: null };
}

function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(percentileValue * sorted.length) - 1),
  );
  return sorted[index] ?? null;
}

export function buildAgentScorecard(input: {
  runs: AgentScorecardRunFact[];
  feedback: AgentScorecardFeedbackFact[];
  routeDecisionCount: number;
}) {
  const terminalRuns = input.runs.filter((run) =>
    ['COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT', 'DEAD_LETTERED'].includes(
      run.status,
    ),
  );
  const completed = terminalRuns.filter((run) => run.status === 'COMPLETED');
  const failed = terminalRuns.filter((run) =>
    ['FAILED', 'TIMEOUT', 'DEAD_LETTERED'].includes(run.status),
  );
  const retried = terminalRuns.filter((run) => run.attempt > 1);
  const completedFirstPass = completed.filter((run) => run.attempt === 1);
  const approved = input.feedback.filter(
    (fact) => fact.signalType === 'APPROVAL_APPROVED',
  ).length;
  const rejected = input.feedback.filter(
    (fact) => fact.signalType === 'APPROVAL_REJECTED',
  ).length;
  const changesRequested = input.feedback.filter(
    (fact) => fact.signalType === 'APPROVAL_CHANGES_REQUESTED',
  ).length;
  const sandboxEvaluated = input.feedback.filter(
    (fact) => fact.signalType === 'SANDBOX_EVALUATED',
  ).length;
  const sandboxBlocked = input.feedback.filter(
    (fact) => fact.signalType === 'SANDBOX_BLOCKED',
  ).length;
  const manualEdits = input.feedback.filter(
    (fact) => fact.signalType === 'USER_CORRECTION',
  ).length;
  const toolFailures = input.feedback.filter(
    (fact) => fact.signalType === 'TOOL_FAILURE',
  ).length;
  const attributedRunIds = new Set(
    input.feedback
      .map((fact) => fact.runId)
      .filter((runId): runId is string => Boolean(runId)),
  );
  const runDurations = terminalRuns
    .filter((run) => run.finishedAt)
    .map((run) =>
      Math.max(
        0,
        (run.finishedAt!.getTime() -
          (run.startedAt ?? run.createdAt).getTime()) /
          1_000,
      ),
    );
  const feedbackCoverage = ratio(
    terminalRuns.filter((run) => attributedRunIds.has(run.id)).length,
    terminalRuns.length,
  );
  const routeCoverage = ratio(input.routeDecisionCount, input.runs.length);
  const coverageValues = [feedbackCoverage.value, routeCoverage.value].filter(
    (value): value is number => value !== null,
  );
  const coverage =
    coverageValues.length === 0
      ? 0
      : Math.min(...coverageValues.map((value) => Math.min(1, value)));

  return {
    version: AGENT_SCORECARD_VERSION,
    sampleSize: input.runs.length,
    coverage,
    status:
      input.runs.length === 0
        ? 'NO_SAMPLE'
        : coverage >= 0.95
          ? 'COMPLETE'
          : 'PARTIAL',
    quality: {
      proposalAcceptRate: ratio(
        approved,
        approved + rejected + changesRequested,
      ),
      sandboxBlockRate: ratio(sandboxBlocked, sandboxEvaluated),
      manualEditRate: ratio(manualEdits, input.feedback.length),
      firstPassPublishSuccessRate: ratio(
        completedFirstPass.length,
        terminalRuns.length,
      ),
    },
    efficiency: {
      runCompletionSecondsP50: percentile(runDurations, 0.5),
      runCompletionSecondsP95: percentile(runDurations, 0.95),
    },
    stability: {
      completionRate: ratio(completed.length, terminalRuns.length),
      failureRate: ratio(failed.length, terminalRuns.length),
      retryRate: ratio(retried.length, terminalRuns.length),
      toolFailureRate: ratio(toolFailures, input.feedback.length),
    },
    attribution: {
      feedbackCoverage,
      routeCoverage,
      attributedRunCount: attributedRunIds.size,
      routeDecisionCount: input.routeDecisionCount,
    },
  };
}
