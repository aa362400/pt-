import { normalizeAgentRunErrorCode } from '../src/shared/errors/agent-run-error-code.js';

describe('normalizeAgentRunErrorCode', () => {
  it('classifies a generic model HTTP 403 as quota exhausted', () => {
    expect(normalizeAgentRunErrorCode({ status: 403, message: 'Forbidden' }))
      .toBe('MODEL_PROVIDER_QUOTA_EXHAUSTED');
  });

  it.each([
    ['[MODEL_PROVIDER_UNAVAILABLE] upstream 503', 'MODEL_PROVIDER_UNAVAILABLE'],
    ['[MODEL_PROVIDER_QUOTA_EXHAUSTED] insufficient_quota', 'MODEL_PROVIDER_QUOTA_EXHAUSTED'],
    ['[IMAGE_PROVIDER_INVALID_KEY] HTTP 401', 'IMAGE_PROVIDER_INVALID_KEY'],
    ['[EVIDENCE_INSUFFICIENT] only one source', 'EVIDENCE_INSUFFICIENT'],
    ['[EVIDENCE_QUALITY_GATE_FAILED] evidence rejected', 'EVIDENCE_QUALITY_GATE_FAILED'],
  ])('maps %s to %s', (message, expected) => {
    expect(normalizeAgentRunErrorCode(new Error(message))).toBe(expected);
  });

  it('prefers a supported structured diagnostics code', () => {
    expect(
      normalizeAgentRunErrorCode({
        message: 'provider failed',
        diagnostics: { code: 'EVIDENCE_INSUFFICIENT' },
      }),
    ).toBe('EVIDENCE_INSUFFICIENT');
  });

  it('recognizes an image authentication failure without storing the provider response', () => {
    expect(
      normalizeAgentRunErrorCode({
        status: 401,
        message: 'image provider invalid api key sk-private',
      }),
    ).toBe('IMAGE_PROVIDER_INVALID_KEY');
  });

  it('keeps unknown failures generic', () => {
    expect(normalizeAgentRunErrorCode(new Error('unexpected bug'))).toBe(
      'AGENT_ERROR',
    );
  });
});
