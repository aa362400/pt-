import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Billing persistence security', () => {
  const root = process.cwd();

  it('keeps Stripe invoices unique and records provider event idempotency', () => {
    const schema = readFileSync(join(root, 'prisma', 'schema.prisma'), 'utf8');

    expect(schema).toMatch(/stripeInvoiceId\s+String\?\s+@unique/);
    expect(schema).toMatch(/model\s+StripeWebhookEvent\s*\{/);
    expect(schema).toMatch(
      /@@unique\(\[provider,\s*livemode,\s*providerEventId\]\)/,
    );
  });

  it('does not expose a direct authenticated plan mutation endpoint', () => {
    const controller = readFileSync(
      join(root, 'src', 'features', 'billing', 'billing.controller.ts'),
      'utf8',
    );

    expect(controller).not.toMatch(/@Post\(['"]plan['"]\)/);
  });
});
