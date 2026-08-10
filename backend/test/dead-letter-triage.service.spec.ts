import { DeadLetterTriageService } from '../src/features/dead-letter/dead-letter-triage.service.js';

describe('DeadLetterTriageService', () => {
  const service = new DeadLetterTriageService();

  it.each([
    [
      'RuntimeError: [MODEL_PROVIDER_QUOTA_EXHAUSTED] 模型供应商额度不足',
      'PROVIDER_FAILURE',
      false,
    ],
    [
      'RuntimeError: [IMAGE_PROVIDER_FALLBACK_EXHAUSTED] 主图片额度不足',
      'PROVIDER_FAILURE',
      false,
    ],
    [
      'HTTPError: 503 Server Error: Service Unavailable',
      'PROVIDER_FAILURE',
      false,
    ],
    ['fetch failed', 'RETRYABLE', true],
    ['RuntimeError: [WinError 5] 拒绝访问', 'RETRYABLE', true],
    [
      'Agent API 400: input 需要 imageBase64 或 imageUrl',
      'DATA_MISSING',
      false,
    ],
    [
      'ValueError: 真实产品研究当前仅支持已接入证据链的 Ozon',
      'PERMANENT',
      false,
    ],
    ['HTTPError: 400 Client Error: Bad Request', 'PERMANENT', false],
    [
      'new row violates row-level security policy for table "agent_runs" (42501)',
      'PERMANENT',
      false,
    ],
  ])(
    'classifies %s as %s without inventing replay eligibility',
    (failedReason, classification, replayEligible) => {
      expect(
        service.classify({
          queueName: 'agent-runs',
          data: { agentRunId: 'run-1' },
          failedReason,
          targetExists: true,
          targetStatus: 'FAILED',
        }),
      ).toEqual(expect.objectContaining({ classification, replayEligible }));
    },
  );

  it('treats a missing source run as data missing even when the old reason looked retryable', () => {
    expect(
      service.classify({
        queueName: 'automation-runs',
        data: { automationRunId: 'missing-run' },
        failedReason: 'fetch failed',
        targetExists: false,
      }),
    ).toEqual(
      expect.objectContaining({
        classification: 'DATA_MISSING',
        replayEligible: false,
      }),
    );
  });

  it('does not allow an unknown queue to become replayable', () => {
    expect(
      service.classify({
        queueName: 'unknown-queue',
        data: {},
        failedReason: 'fetch failed',
      }),
    ).toEqual(
      expect.objectContaining({
        classification: 'PERMANENT',
        replayEligible: false,
      }),
    );
  });
});
