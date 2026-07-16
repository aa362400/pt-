import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import Stripe from 'stripe';
import { PrismaService } from '../../shared/database/prisma.service.js';

const FRONTEND_URL_DEFAULT = 'http://localhost:5173';

const PLAN_TO_PRICE_KEY: Record<string, string> = {
  FREE: 'STRIPE_PRICE_FREE',
  STARTER: 'STRIPE_PRICE_STARTER',
  PROFESSIONAL: 'STRIPE_PRICE_PROFESSIONAL',
  ENTERPRISE: 'STRIPE_PRICE_ENTERPRISE',
};

const SUPPORTED_PLANS = [
  'FREE',
  'STARTER',
  'PROFESSIONAL',
  'ENTERPRISE',
] as const;
type SupportedPlan = (typeof SUPPORTED_PLANS)[number];

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private stripe: Stripe | null = null;
  private readonly webhookSecret: string | undefined;
  private readonly frontendUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const key = this.config.get<string>('STRIPE_SECRET_KEY');
    if (key) {
      this.stripe = new Stripe(key, {
        apiVersion: '2026-06-24.dahlia',
        typescript: true,
      });
      this.logger.log('Stripe client initialized');
    } else {
      this.logger.warn(
        'STRIPE_SECRET_KEY not set; payment writes are disabled',
      );
    }

    this.webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    this.frontendUrl =
      this.config.get<string>('FRONTEND_URL') ?? FRONTEND_URL_DEFAULT;
  }

  get isLive(): boolean {
    return this.stripe !== null;
  }

  async createCheckoutSession(plan: string, orgId: string): Promise<string> {
    if (!this.stripe) {
      throw new ServiceUnavailableException(
        'Stripe checkout is not configured',
      );
    }

    const priceId = this.getPriceId(plan);
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { stripeCustomerId: true },
    });

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      customer: org?.stripeCustomerId ?? undefined,
      client_reference_id: orgId,
      metadata: { orgId, plan },
      subscription_data: { metadata: { orgId, plan } },
      success_url: `${this.frontendUrl}/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.frontendUrl}/billing?canceled=true`,
      allow_promotion_codes: true,
    });

    if (!session.url) {
      throw new ServiceUnavailableException(
        'Stripe did not return a checkout URL',
      );
    }
    return session.url;
  }

  async createPortalSession(orgId: string): Promise<string> {
    if (!this.stripe) {
      throw new ServiceUnavailableException(
        'Stripe customer portal is not configured',
      );
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { stripeCustomerId: true },
    });
    if (!org?.stripeCustomerId) {
      throw new BadRequestException(
        'Complete a Stripe checkout before opening the customer portal',
      );
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      return_url: `${this.frontendUrl}/billing`,
    });
    return session.url;
  }

  async handleWebhook(
    payload: Buffer | string,
    signature: string,
  ): Promise<{ received: true; duplicate: boolean }> {
    if (!this.stripe || !this.webhookSecret) {
      throw new ServiceUnavailableException(
        'Stripe webhook processing is not configured',
      );
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.webhookSecret,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Webhook signature verification failed: ${message}`);
      throw new BadRequestException('Invalid Stripe webhook signature');
    }

    const duplicate = await this.prisma.$transaction(async (transaction) => {
      const ledgerId = randomUUID();
      const objectId = (event.data.object as { id?: string }).id ?? null;
      const inserted = await transaction.stripeWebhookEvent.createMany({
        data: [
          {
            id: ledgerId,
            provider: 'STRIPE',
            providerEventId: event.id,
            livemode: event.livemode,
            eventType: event.type,
            objectId,
          },
        ],
        skipDuplicates: true,
      });

      if (inserted.count === 0) {
        this.logger.log(`Stripe event ${event.id} already processed`);
        return true;
      }

      const resolvedOrganizationId = await this.processWebhookEvent(
        event,
        transaction,
      );
      await transaction.stripeWebhookEvent.update({
        where: { id: ledgerId },
        data: {
          processedAt: new Date(),
          resolvedOrganizationId,
        },
      });
      return false;
    });

    return { received: true, duplicate };
  }

  private getPriceId(plan: string): string {
    const normalizedPlan = this.parsePlan(plan);
    const envKey = PLAN_TO_PRICE_KEY[normalizedPlan];
    const priceId = this.config.get<string>(envKey);
    if (!priceId) {
      throw new ServiceUnavailableException(
        `Stripe price is not configured for plan ${normalizedPlan}`,
      );
    }
    return priceId;
  }

  private parsePlan(value: string | undefined): SupportedPlan {
    const normalized = (value ?? 'STARTER').toUpperCase();
    if (!SUPPORTED_PLANS.includes(normalized as SupportedPlan)) {
      throw new BadRequestException('Unsupported Stripe plan metadata');
    }
    return normalized as SupportedPlan;
  }

  private async processWebhookEvent(
    event: Stripe.Event,
    transaction: Prisma.TransactionClient,
  ): Promise<string | null> {
    switch (event.type) {
      case 'checkout.session.completed':
        return this.onCheckoutCompleted(event.data.object, transaction);
      case 'invoice.paid':
        return this.onInvoicePaid(event.data.object, transaction);
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        return this.onSubscriptionChanged(event.data.object, transaction);
      default:
        this.logger.log(`Unhandled Stripe event type: ${event.type}`);
        return null;
    }
  }

  private async resolveOrgId(
    metadataOrgId: string | undefined,
    customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
    transaction: Prisma.TransactionClient,
  ): Promise<string | null> {
    if (metadataOrgId) return metadataOrgId;
    const customerId = typeof customer === 'string' ? customer : customer?.id;
    if (!customerId) return null;
    const org = await transaction.organization.findUnique({
      where: { stripeCustomerId: customerId },
      select: { id: true },
    });
    return org?.id ?? null;
  }

  private async onCheckoutCompleted(
    session: Stripe.Checkout.Session,
    transaction: Prisma.TransactionClient,
  ): Promise<string | null> {
    const orgId = session.metadata?.orgId ?? session.client_reference_id;
    const plan = this.parsePlan(session.metadata?.plan);
    if (!orgId) {
      this.logger.warn('Checkout session missing orgId metadata');
      return null;
    }

    const customerId =
      typeof session.customer === 'string'
        ? session.customer
        : session.customer?.id;
    await transaction.organization.update({
      where: { id: orgId },
      data: {
        plan,
        ...(customerId ? { stripeCustomerId: customerId } : {}),
      },
    });
    this.logger.log(`Stripe checkout completed for organization ${orgId}`);
    return orgId;
  }

  private async onInvoicePaid(
    invoice: Stripe.Invoice,
    transaction: Prisma.TransactionClient,
  ): Promise<string | null> {
    const orgId = await this.resolveOrgId(
      invoice.metadata?.orgId,
      (invoice as unknown as { customer: string | null }).customer,
      transaction,
    );
    if (!orgId) {
      this.logger.warn('Invoice paid but no organization could be resolved');
      return null;
    }

    const line = invoice.lines?.data?.[0];
    const periodStart = line?.period?.start
      ? new Date(line.period.start * 1000)
      : new Date();
    const periodEnd = line?.period?.end
      ? new Date(line.period.end * 1000)
      : new Date();
    const org = await transaction.organization.findUnique({
      where: { id: orgId },
      select: { plan: true },
    });

    await this.setTenantContext(transaction, orgId);
    const data = {
      organizationId: orgId,
      amount: (invoice.amount_paid ?? 0) / 100,
      currency: (invoice.currency ?? 'usd').toUpperCase(),
      status: 'PAID',
      plan: org?.plan ?? 'STARTER',
      periodStart,
      periodEnd,
      paidAt: new Date(),
      stripeInvoiceId: invoice.id ?? null,
    };

    if (invoice.id) {
      await transaction.invoice.upsert({
        where: { stripeInvoiceId: invoice.id },
        update: {},
        create: data,
      });
    } else {
      await transaction.invoice.create({ data });
    }
    this.logger.log(`Stripe invoice ${invoice.id} recorded for ${orgId}`);
    return orgId;
  }

  private async onSubscriptionChanged(
    subscription: Stripe.Subscription,
    transaction: Prisma.TransactionClient,
  ): Promise<string | null> {
    const orgId = await this.resolveOrgId(
      subscription.metadata?.orgId,
      subscription.customer,
      transaction,
    );
    if (!orgId) {
      this.logger.warn('Subscription event missing organization metadata');
      return null;
    }

    if (
      ['canceled', 'unpaid', 'incomplete_expired'].includes(subscription.status)
    ) {
      await transaction.organization.update({
        where: { id: orgId },
        data: { plan: 'FREE' },
      });
    }
    this.logger.log(
      `Stripe subscription ${subscription.id} is ${subscription.status}`,
    );
    return orgId;
  }

  private async setTenantContext(
    transaction: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<void> {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(organizationId)) {
      throw new BadRequestException('Stripe organization id is invalid');
    }
    await transaction.$executeRawUnsafe(
      "SELECT set_config('app.current_organization_id', $1, true)",
      organizationId,
    );
    const context = await transaction.$queryRawUnsafe<
      Array<{ organization_id: string | null }>
    >(
      "SELECT current_setting('app.current_organization_id', true) AS organization_id",
    );
    if (context[0]?.organization_id !== organizationId) {
      throw new Error('Tenant database context verification failed');
    }
  }
}
