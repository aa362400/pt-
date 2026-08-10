export const PUBLISH_STEP_UP_MAX_AGE_SECONDS = 5 * 60;
const PUBLISH_STEP_UP_CLOCK_SKEW_SECONDS = 30;

export interface PublishStepUpAttestation {
  type: 'mfa-step-up/v1';
  actorId: string;
  amr: ['pwd', 'otp'];
  mfaAt: number;
}

export function readRecentPublishStepUp(
  input: unknown,
  expectedActorId: string,
  now = new Date(),
): PublishStepUpAttestation | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  const actorId = String(record.actorId ?? '').trim();
  const amr = Array.isArray(record.amr)
    ? record.amr.filter((item): item is string => typeof item === 'string')
    : [];
  const mfaAt = Number(record.mfaAt);
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (
    actorId !== expectedActorId ||
    !amr.includes('pwd') ||
    !amr.includes('otp') ||
    !Number.isInteger(mfaAt) ||
    mfaAt <= 0 ||
    mfaAt > nowSeconds + PUBLISH_STEP_UP_CLOCK_SKEW_SECONDS ||
    nowSeconds - mfaAt > PUBLISH_STEP_UP_MAX_AGE_SECONDS
  ) {
    return null;
  }
  return {
    type: 'mfa-step-up/v1',
    actorId,
    amr: ['pwd', 'otp'],
    mfaAt,
  };
}

export function attestRecentPublishStepUp(
  actor: { sub: string; amr?: string[]; mfaAt?: number },
  now = new Date(),
): PublishStepUpAttestation | null {
  return readRecentPublishStepUp(
    { actorId: actor.sub, amr: actor.amr, mfaAt: actor.mfaAt },
    actor.sub,
    now,
  );
}
