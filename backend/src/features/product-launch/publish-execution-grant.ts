import { createHash, randomBytes } from 'node:crypto';

export const OZON_LISTING_PUBLISH_CAPABILITY =
  'action:ozon.listing.publish' as const;
export const PUBLISH_EXECUTION_GRANT_TTL_MS = 5 * 60 * 1000;

export function hashPublishExecutionGrant(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function issuePublishExecutionGrant(
  snapshotHash: string,
  now = new Date(),
) {
  const token = `plg_${randomBytes(32).toString('base64url')}`;
  return {
    token,
    tokenHash: hashPublishExecutionGrant(token),
    capabilityScope: OZON_LISTING_PUBLISH_CAPABILITY,
    snapshotHash,
    expiresAt: new Date(now.getTime() + PUBLISH_EXECUTION_GRANT_TTL_MS),
  };
}
