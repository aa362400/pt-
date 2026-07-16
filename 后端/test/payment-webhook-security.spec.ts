import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BillingController } from '../src/features/billing/billing.controller.js';
import { PaymentService } from '../src/features/billing/payment.service.js';

function checkoutEvent() {
  return {
    id: 'evt_checkout_1',
    livemode: true,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_1',
        metadata: { orgId: 'org-1', plan: 'PROFESSIONAL' },
        client_reference_id: 'org-1',
        customer: 'cus_1',
      },
    },
  };
}

function createHarness(options?: {
  eventError?: unknown;
  duplicate?: boolean;
}) {
  const transaction = {
    stripeWebhookEvent: {
      createMany: jest
        .fn()
        .mockResolvedValue({ count: options?.duplicate ? 0 : 1 }),
      update: jest.fn().mockResolvedValue({ id: 'ledger-1' }),
    },
    organization: {
      findUnique: jest.fn().mockResolvedValue({ plan: 'STARTER' }),
      update: jest.fn().mockResolvedValue({ id: 'org-1' }),
    },
    invoice: {
      create: jest.fn().mockResolvedValue({ id: 'invoice-1' }),
    },
    $executeRawUnsafe: jest.fn().mockResolvedValue(1),
  };
  const prisma = {
    $transaction: jest.fn((operation: (tx: typeof transaction) => unknown) =>
      operation(transaction),
    ),
    organization: transaction.organization,
    invoice: transaction.invoice,
  };
  const config = { get: jest.fn().mockReturnValue(undefined) };
  const tenantDatabase = { run: jest.fn() };
  const service = new (PaymentService as any)(
    config,
    prisma,
    tenantDatabase,
  ) as PaymentService;
  const constructEvent = options?.eventError
    ? jest.fn().mockImplementation(() => {
        throw options.eventError;
      })
    : jest.fn().mockReturnValue(checkoutEvent());
  (service as any).stripe = { webhooks: { constructEvent } };
  (service as any).webhookSecret = 'whsec_test';
  return { service, prisma, transaction, constructEvent };
}

describe('Stripe webhook security', () => {
  it('rejects delivery when Stripe processing is not configured', async () => {
    const config = { get: jest.fn().mockReturnValue(undefined) };
    const service = new (PaymentService as any)(
      config,
      {},
      {},
    ) as PaymentService;

    await expect(
      service.handleWebhook(Buffer.from('{}'), 'signature'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('maps signature verification failures to a client error', async () => {
    const { service } = createHarness({
      eventError: new Error('bad signature'),
    });

    await expect(
      service.handleWebhook(Buffer.from('{}'), 'bad-signature'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('acknowledges a replay without repeating business side effects', async () => {
    const { service, transaction } = createHarness({ duplicate: true });

    await expect(
      service.handleWebhook(Buffer.from('{}'), 'signature'),
    ).resolves.toEqual({ received: true, duplicate: true });
    expect(transaction.organization.update).not.toHaveBeenCalled();
  });

  it('commits the event ledger and subscription change atomically', async () => {
    const { service, prisma, transaction } = createHarness();

    await expect(
      service.handleWebhook(Buffer.from('{}'), 'signature'),
    ).resolves.toEqual({ received: true, duplicate: false });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.stripeWebhookEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          provider: 'STRIPE',
          providerEventId: 'evt_checkout_1',
          livemode: true,
          eventType: 'checkout.session.completed',
        }),
      ],
      skipDuplicates: true,
    });
    expect(transaction.organization.update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: { plan: 'PROFESSIONAL', stripeCustomerId: 'cus_1' },
    });
    expect(transaction.stripeWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: expect.any(String) },
      data: expect.objectContaining({
        processedAt: expect.any(Date),
        resolvedOrganizationId: 'org-1',
      }),
    });
  });
});

describe('Billing webhook controller', () => {
  const payment = { handleWebhook: jest.fn() };
  const controller = new (BillingController as any)(
    {},
    {},
    payment,
    {},
  ) as BillingController;

  it('rejects a missing Stripe signature instead of returning HTTP 200 success', async () => {
    await expect(
      controller.handleWebhook({ rawBody: Buffer.from('{}') }, ''),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a missing raw request body', async () => {
    await expect(
      controller.handleWebhook({}, 'signature'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
