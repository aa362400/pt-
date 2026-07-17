import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pageSource = readFileSync(
  new URL('../src/pages/ListingGenerator.tsx', import.meta.url),
  'utf8',
);
const apiSource = readFileSync(
  new URL('../src/api/listings.ts', import.meta.url),
  'utf8',
);
const clientSource = readFileSync(
  new URL('../src/api/client.ts', import.meta.url),
  'utf8',
);
const overviewSource = readFileSync(
  new URL('../src/pages-v2/ListingOverviewV2.tsx', import.meta.url),
  'utf8',
);

test('Ozon listing creation uses the backend listing-platform enum and has no Amazon fallback', () => {
  assert.match(apiSource, /export const OZON_LISTING_PLATFORM = ['"]ozon['"]/);
  assert.match(apiSource, /platform: ListingPlatform;/);
  assert.match(apiSource, /platform: input\.platform,/);
  assert.doesNotMatch(apiSource, /input\.platform \?\? ['"]amazon['"]/);
  assert.match(pageSource, /platform: OZON_LISTING_PLATFORM,/);
  assert.doesNotMatch(pageSource, /platform:\s*['"]amazon['"]/);
});

test('new task only clears local draft state and never writes to the backend', () => {
  assert.match(
    pageSource,
    /const handleNewTask = \(\) => \{[\s\S]*?setCurrentListingId\(null\);[\s\S]*?setListingProductName\(['"]['"]\);[\s\S]*?\n  \};/,
  );
  const handler = pageSource.match(
    /const handleNewTask = \(\) => \{([\s\S]*?)\n  \};/,
  )?.[1] ?? '';
  assert.doesNotMatch(handler, /listingsApi\.(generate|update)/);
  assert.doesNotMatch(handler, /generateRealListing/);
});

test('one guarded save creates once, binds the id, then updates the existing draft', () => {
  assert.match(pageSource, /const savingRef = useRef\(false\)/);
  assert.match(pageSource, /if \(savingRef\.current\) return/);
  assert.match(pageSource, /savingRef\.current = true/);
  assert.match(pageSource, /listingsApi\.update\(currentListingId,/);
  assert.match(pageSource, /listingsApi\.generate\(/);
  assert.match(pageSource, /setCurrentListingId\(created\.id\)/);
  assert.match(pageSource, /finally \{[\s\S]*?savingRef\.current = false/);
  assert.match(pageSource, /disabled=\{isSaving\}/);
});

test('listing generation carries one stable idempotency key across response-loss retries', () => {
  assert.match(apiSource, /idempotencyKey: string;/);
  assert.match(apiSource, /idempotencyKey:\s*input\.idempotencyKey/);
  assert.match(
    clientSource,
    /headers\[['"]Idempotency-Key['"]\]\s*=\s*options\.idempotencyKey/,
  );
  assert.match(pageSource, /sessionStorage\.getItem\(LISTING_GENERATION_KEY_STORAGE\)/);
  assert.match(pageSource, /generationIdempotencyKeyRef/);
  assert.match(pageSource, /idempotencyKey:\s*generationIdempotencyKeyRef\.current/);
  const handler = pageSource.match(
    /const handleNewTask = \(\) => \{([\s\S]*?)\n  \};/,
  )?.[1] ?? '';
  assert.match(handler, /rotateListingGenerationKey/);
});

test('a successful create rotates the next-task key while a failed response keeps the retry key', () => {
  const saveHandler = pageSource.match(
    /const handlePersistListing = async \(\) => \{([\s\S]*?)\n  \};/,
  )?.[1] ?? '';
  assert.match(
    saveHandler,
    /const created = await listingsApi\.generate\([\s\S]*?generationIdempotencyKeyRef\.current = rotateListingGenerationKey\(\);[\s\S]*?setCurrentListingId\(created\.id\)/,
  );
  const failedResponseHandler = saveHandler.match(
    /\} catch \(error\) \{([\s\S]*?)\n    \} finally/,
  )?.[1] ?? '';
  assert.doesNotMatch(failedResponseHandler, /rotateListingGenerationKey/);
});

test('title candidates expose a real selection action and unsupported actions are disabled', () => {
  assert.match(
    pageSource,
    /data-testid=\{`candidate-\$\{tc\.id\}`\}[\s\S]{0,500}onClick=\{\(\) => handleSelectCandidate\(tc\)\}/,
  );
  assert.match(pageSource, /const handleSelectCandidate = \(candidate: TitleCandidate\)/);
  assert.match(pageSource, /data-testid="action-share"[\s\S]{0,180}disabled/);
  assert.match(pageSource, /data-testid="action-feedback"[\s\S]{0,180}disabled/);
  assert.match(pageSource, /const unavailableModule = mod\.id === 'lm5' \|\| mod\.id === 'lm6'/);
  assert.match(pageSource, /disabled=\{unavailableModule\}/);
});

test('listings API exposes a narrow update contract instead of accepting a whole draft', () => {
  assert.match(apiSource, /export interface ListingUpdateInput \{/);
  assert.match(apiSource, /update: async \(id: string, data: ListingUpdateInput\)/);
  assert.doesNotMatch(apiSource, /data: Partial<ListingDraft>/);
});

test('opening the create editor stays blank instead of adopting the newest history item', () => {
  assert.doesNotMatch(pageSource, /:\s*listRes\.items\[0\]/);
  assert.match(
    pageSource,
    /const initialListing = initialListingId[\s\S]{0,180}: null;/,
  );
  assert.match(
    pageSource,
    /currentListingId \? listingPlatformLabel\(previewData\?\.platform\) : listingPlatformLabel\(OZON_LISTING_PLATFORM\)/,
  );
});

test('legacy platform and listing statuses are shown with customer-readable labels', () => {
  assert.match(overviewSource, /listingPlatformLabel\(item\.platform\)/);
  assert.match(overviewSource, /listingStatusLabel\(item\.status\)/);
  assert.doesNotMatch(overviewSource, />\{item\.platform \|\| '未设置'\}</);
  assert.doesNotMatch(overviewSource, />\{item\.status\}</);
  assert.match(pageSource, /listingPlatformLabel\(item\.platform\)/);
  assert.match(pageSource, /listingStatusLabel\(item\.status\)/);
});
