import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../../shared/database/prisma.service.js';

const FRONTEND_URL_DEFAULT = 'http://localhost:5173';

/**
 * Maps the internal plan name to Stripe price IDs configured in the environment.
 */
const PLAN_TO_PRICE_KEY: Record<string, string> = {
  FREE: 'STRIPE_PRICE_FREE',
  STARTER: 'STRIPE_PRICE_STARTER',
  PROFESSIONAL: 'STRIPE_PRICE_PROFESSIONAL',
  ENTERPRISE: 'STRIPE_PRICE_ENTERPRISE',
};

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
        'STRIPE_SECRET_KEY not set — PaymentService running in mock mode',
      );
    }

    this.webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    this.frontendUrl =
      this.config.get<string>('FRONTEND_URL') ?? FRONTEND_URL_DEFAULT;
  }

  /** Whether real Stripe integration is active. */
  get isLive(): boolean {
    return this.stripe !== null;
  }

  /**
   * Creates a Stripe Checkout Session for a subscription plan.
   * Returns the checkout URL for the frontend to redirect to.
   */
  async createCheckoutSession(plan: string, orgId: string): Promise<string> {
    if (!this.stripe) {
      this.logger.warn(
        `Mock: createCheckoutSession(plan=${plan}, orgId=${orgId})`,
      );
      return `${this.frontendUrl}/billing?mock_session=true&plan=${plan}&orgId=${orgId}`;
    }

    const priceId = this.getPriceId(plan);
    // Reuse the org's Stripe customer if one exists so subscriptions stay
    // attached to a single customer record.
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

    return session.url!;
  }

  /**
   * Creates a Stripe Customer Portal session for managing the subscription.
   * Resolves the org's Stripe customer ID; fails if the org has never paid.
   */
  async createPortalSession(orgId: string): Promise<string> {
    if (!this.stripe) {
      this.logger.warn(`Mock: createPortalSession(orgId=${orgId})`);
      return `${this.frontendUrl}/billing`;
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { stripeCustomerId: true },
    });
    if (!org?.stripeCustomerId) {
      throw new Error(
        'No Stripe customer for this organization yet — complete a checkout first.',
      );
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      return_url: `${this.frontendUrl}/billing`,
    });
    return session.url;
  }

  /**
   * Handles an incoming Stripe webhook event.
   * Verifies the signature and processes the event (e.g., subscription complete).
   */
  async handleWebhook(
    payload: Buffer | string,
    signature: string,
  ): Promise<{ received: boolean }> {
    if (!this.stripe || !this.webhookSecret) {
      this.logger.warn('Mock: webhook received (stripe not configured)');
      return { received: true };
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.webhookSecret,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Webhook signature verification failed: ${message}`);
      throw err;
    }

    this.logger.log(`Webhook received: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        await this.onCheckoutCompleted(session);
        break;
      }
      case 'invoice.paid': {
        const invoice = event.data.object;
        await this.onInvoicePaid(invoice);
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await this.onSubscriptionChanged(subscription);
        break;
      }
      default:
        this.logger.log(`Unhandled event type: ${event.type}`);
    }

    return { received: true };
  }

  // ── Private helpers ──────────────────────────────────────────────────

  private getPriceId(plan: string): string {
    const envKey = PLAN_TO_PRICE_KEY[plan.toUpperCase()] ?? 'STRIPE_PRICE_FREE';
    const priceId = this.config.get<string>(envKey);
    if (!priceId) {
      throw new Error(
        `Missing Stripe price ID for plan "${plan}". Set ${envKey} in environment.`,
      );
    }
    return priceId;
  }

  /** Resolve the org ID from event metadata, falling back to the Stripe customer link. */
  private async resolveOrgId(
    metadataOrgId: string | undefined,
    customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
  ): Promise<string | null> {
    if (metadataOrgId) return metadataOrgId;
    const customerId = typeof customer === 'string' ? customer : customer?.id;
    if (!customerId) return null;
    const org = await this.prisma.organization.findUnique({
      where: { stripeCustomerId: customerId },
      select: { id: true },
    });
    return org?.id ?? null;
  }

  private async onCheckoutCompleted(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const orgId = session.metadata?.orgId ?? session.client_reference_id;
    const plan = (session.metadata?.plan ?? 'STARTER').toUpperCase();
    if (!orgId) {
      this.logger.warn('Checkout session missing orgId metadata');
      return;
    }

    const customerId =
      typeof session.customer === 'string'
        ? session.customer
        : session.customer?.id;

    await this.prisma.organization.update({
      where: { id: orgId },
      data: {
        plan: plan as 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE',
        ...(customerId ? { stripeCustomerId: customerId } : {}),
      },
    });

    this.logger.log(
      `Checkout completed: org ${orgId} upgraded to ${plan} (customer ${customerId ?? 'n/a'})`,
    );
  }

  private async onInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
    const orgId = await this.resolveOrgId(
      invoice.metadata?.orgId,
      (invoice as unknown as { customer: string | null }).customer,
    );
    if (!orgId) {
      this.logger.warn('Invoice paid but no org could be resolved');
      return;
    }

    const line = invoice.lines?.data?.[0];
    const periodStart = line?.period?.start
      ? new Date(line.period.start * 1000)
      : new Date();
    const periodEnd = line?.period?.end
      ? new Date(line.period.end * 1000)
      : new Date();

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { plan: true },
    });

    // Idempotent: skip if we already recorded this Stripe invoice.
    const existing = invoice.id
      ? await this.prisma.invoice.findFirst({
          where: { stripeInvoiceId: invoice.id },
          select: { id: true },
        })
      : null;
    if (existing) {
      this.logger.log(`Invoice ${invoice.id} already recorded, skipping`);
      return;
    }

    await this.prisma.invoice.create({
      data: {
        organizationId: orgId,
        amount: (invoice.amount_paid ?? 0) / 100,
        currency: (invoice.currency ?? 'usd').toUpperCase(),
        status: 'PAID',
        plan: org?.plan ?? 'STARTER',
        periodStart,
        periodEnd,
        paidAt: new Date(),
        stripeInvoiceId: invoice.id ?? null,
      },
    });

    this.logger.log(`Invoice ${invoice.id} recorded as PAID for org ${orgId}`);
  }

  private async onSubscriptionChanged(
    subscription: Stripe.Subscription,
  ): Promise<void> {
    const orgId = await this.resolveOrgId(
      subscription.metadata?.orgId,
      subscription.customer,
    );
    if (!orgId) {
      this.logger.warn('Subscription event missing orgId metadata');
      return;
    }

    // Downgrade the org when the subscription is no longer active.
    const inactive = ['canceled', 'unpaid', 'incomplete_expired'];
    if (inactive.includes(subscription.status)) {
      await this.prisma.organization.update({
        where: { id: orgId },
        data: { plan: 'FREE' },
      });
      this.logger.log(
        `Subscription ${subscription.id} ${subscription.status} — org ${orgId} downgraded to FREE`,
      );
      return;
    }

    this.logger.log(
      `Subscription ${subscription.id} status=${subscription.status} for org ${orgId}`,
    );
  }
}
