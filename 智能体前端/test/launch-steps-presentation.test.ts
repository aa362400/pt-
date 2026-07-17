import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { launchStepsPresentation } from '../src/utils/launch-steps-presentation.ts';

test('launch steps map economics review, image generation, content, approval, and published states', () => {
  const cases = [
    [{ status: 'AWAITING_ECONOMICS_REVIEW' }, ['current', 'pending', 'pending', 'pending']],
    [{ status: 'GENERATING_IMAGES', imageGenerationApproved: true }, ['complete', 'current', 'pending', 'pending']],
    [{ status: 'QUEUED', imageProjectId: 'image-1', listingDraftId: 'draft-1' }, ['complete', 'complete', 'current', 'pending']],
    [{ status: 'AWAITING_PUBLISH_APPROVAL', imageProjectId: 'image-1', listingDraftId: 'draft-1', approvedContentHash: 'hash' }, ['complete', 'complete', 'complete', 'current']],
    [{ status: 'ACTIVE_ON_OZON', imageProjectId: 'image-1', listingDraftId: 'draft-1', approvedContentHash: 'hash', publishApprovedAt: '2026-07-17T00:00:00Z', publishExecutionGrantHash: 'grant' }, ['complete', 'complete', 'complete', 'complete']],
  ] as const;

  for (const [input, expected] of cases) {
    assert.deepEqual(launchStepsPresentation(input).map((step) => step.state), expected);
  }
});

test('the historical image 401 launch fails step two with an exact Chinese reason', () => {
  const steps = launchStepsPresentation({
    status: 'FAILED',
    imageGenerationApproved: true,
    failureCode: 'IMAGE_PROVIDER_INVALID_KEY',
  });
  assert.equal(steps[1].state, 'failed');
  assert.equal(steps[1].reason, '图片生成通道 API Key 无效');
  assert.deepEqual(steps.slice(2).map((step) => step.state), ['pending', 'pending']);
});

test('listing overview deep-links one launch and embeds the existing listing generator at step three', () => {
  const page = readFileSync(
    new URL('../src/pages-v2/ListingOverviewV2.tsx', import.meta.url),
    'utf8',
  );
  assert.match(page, /searchParams\.get\('launch'\)/);
  assert.match(page, /reviewApi\.getProductLaunch\(launchId\)/);
  assert.match(page, /launchStepsPresentation\(activeLaunch\)/);
  assert.match(page, /<ListingGenerator initialListingId=\{selectedListingId\}/);
  assert.match(page, /launchWizard\.retry/);
});
