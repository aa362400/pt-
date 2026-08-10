import { InvoiceService } from '../src/features/billing/invoice.service.js';
import { PaymentService } from '../src/features/billing/payment.service.js';

describe('Invoice tenant persistence', () => {
  it('runs invoice listing and creation inside the organization context', async () => {
    const invoice = {
      id: 'invoice-1',
      organizationId: 'org-1',
      amount: 99,
      currency: 'USD',
      status: 'PAID',
      plan: 'PROFESSIONAL',
      periodStart: new Date(),
      periodEnd: new Date(),
      paidAt: new Date(),
      stripeInvoiceId: 'stripe-invoice-1',
      createdAt: new Date(),
    };
    const prisma: any = {
      invoice: {
        findMany: jest.fn().mockResolvedValue([invoice]),
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn().mockResolvedValue(invoice),
      },
    };
    const tenantDatabase = {
      run: jest.fn((_organizationId, operation) => operation(prisma)),
    };
    const service = new (InvoiceService as any)(prisma, tenantDatabase);

    await service.findAll('org-1', 1, 20);
    await service.create({
      organizationId: 'org-1',
      amount: 99,
      plan: 'PROFESSIONAL',
      periodStart: new Date(),
      periodEnd: new Date(),
    });

    expect(tenantDatabase.run).toHaveBeenCalledWith(
      'org-1',
      expect.any(Function),
    );
    expect(prisma.invoice.create).toHaveBeenCalled();
  });

  it('scopes Stripe invoice idempotency and persistence to the resolved organization', async () => {
    const transaction: any = {
      stripeWebhookEvent: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({ id: 'ledger-1' }),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({ plan: 'STARTER' }),
      },
      invoice: {
        upsert: jest.fn().mockResolvedValue({ id: 'invoice-1' }),
      },
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValue([{ organization_id: 'org-1' }]),
    };
    const prisma: any = {
      $transaction: jest.fn((operation) => operation(transaction)),
    };
    const config = { get: jest.fn().mockReturnValue(undefined) };
    const service = new (PaymentService as any)(config, prisma);
    service.stripe = {
      webhooks: {
        constructEvent: jest.fn().mockReturnValue({
          id: 'evt-invoice-1',
          livemode: true,
          type: 'invoice.paid',
          data: {
            object: {
              id: 'stripe-invoice-1',
              metadata: { orgId: 'org-1' },
              customer: null,
              amount_paid: 9900,
              currency: 'usd',
              lines: { data: [] },
            },
          },
        }),
      },
    };
    service.webhookSecret = 'whsec_test';

    await service.handleWebhook(Buffer.from('{}'), 'signature');

    expect(transaction.$executeRawUnsafe).toHaveBeenCalledWith(
      "SELECT set_config('app.current_organization_id', $1, true)",
      'org-1',
    );
    expect(transaction.invoice.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripeInvoiceId: 'stripe-invoice-1' },
        create: expect.objectContaining({ organizationId: 'org-1' }),
      }),
    );
  });
});
