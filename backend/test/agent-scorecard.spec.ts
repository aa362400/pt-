import { buildAgentScorecard } from '../src/features/agent-evaluation/agent-scorecard.js';

describe('agent scorecard', () => {
  it('uses null ratios instead of fake zero values when there is no evidence', () => {
    const result = buildAgentScorecard({
      runs: [],
      feedback: [],
      routeDecisionCount: 0,
    });

    expect(result.status).toBe('NO_SAMPLE');
    expect(result.quality.proposalAcceptRate.value).toBeNull();
    expect(result.stability.completionRate.value).toBeNull();
    expect(result.coverage).toBe(0);
  });

  it('reports partial coverage when terminal runs lack attributable feedback', () => {
    const result = buildAgentScorecard({
      runs: [
        {
          id: 'run-1',
          status: 'COMPLETED',
          attempt: 1,
          createdAt: new Date('2026-07-14T00:00:00Z'),
          startedAt: new Date('2026-07-14T00:00:01Z'),
          finishedAt: new Date('2026-07-14T00:00:11Z'),
        },
        {
          id: 'run-2',
          status: 'FAILED',
          attempt: 2,
          createdAt: new Date('2026-07-14T00:01:00Z'),
          startedAt: new Date('2026-07-14T00:01:01Z'),
          finishedAt: new Date('2026-07-14T00:01:21Z'),
        },
      ],
      feedback: [{ runId: 'run-1', signalType: 'APPROVAL_APPROVED' }],
      routeDecisionCount: 2,
    });

    expect(result.status).toBe('PARTIAL');
    expect(result.attribution.feedbackCoverage.value).toBe(0.5);
    expect(result.attribution.routeCoverage.value).toBe(1);
    expect(result.stability.retryRate.value).toBe(0.5);
    expect(result.efficiency.runCompletionSecondsP95).toBe(20);
  });

  it('marks coverage complete only when every run is routed and attributed', () => {
    const run = {
      id: 'run-1',
      status: 'COMPLETED',
      attempt: 1,
      createdAt: new Date('2026-07-14T00:00:00Z'),
      startedAt: new Date('2026-07-14T00:00:01Z'),
      finishedAt: new Date('2026-07-14T00:00:02Z'),
    };
    const result = buildAgentScorecard({
      runs: [run],
      feedback: [
        { runId: run.id, signalType: 'APPROVAL_APPROVED' },
        { runId: run.id, signalType: 'SANDBOX_EVALUATED' },
      ],
      routeDecisionCount: 1,
    });

    expect(result.status).toBe('COMPLETE');
    expect(result.coverage).toBe(1);
    expect(result.quality.proposalAcceptRate.value).toBe(1);
  });
});
