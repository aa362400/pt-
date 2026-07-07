import {
  Injectable,
  Logger,
  RawBodyRequest,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

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

  constructor(private readonly config: ConfigService) {
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
  async createCheckoutSession(
    plan: string,
    orgId: string,
  ): Promise<string> {
    if (!this.stripe) {
      this.logger.warn(
        `Mock: createCheckoutSession(plan=${plan}, orgId=${orgId})`,
      );
      return `${this.frontendUrl}/billing?mock_session=true&plan=${plan}&orgId=${orgId}`;
    }

    const priceId = this.getPriceId(plan);
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { orgId, plan },
      success_url: `${this.frontendUrl}/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.frontendUrl}/billing?canceled=true`,
      allow_promotion_codes: true,
    });

    return session.url!;
  }

  /**
   * Creates a Stripe Customer Portal session for managing the subscription.
   */
  async createPortalSession(
    orgId: string,
    customerId: string,
  ): Promise<string> {
    if (!this.stripe) {
      this.logger.warn(
        `Mock: createPortalSession(orgId=${orgId})`,
      );
      return `${this.frontendUrl}/billing`;
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: customerId,
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
    } catch (err: any) {
      this.logger.error(`Webhook signature verification failed: ${err.message}`);
      throw err;
    }

    this.logger.log(`Webhook received: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await this.onCheckoutCompleted(session);
        break;
      }
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        await this.onInvoicePaid(invoice);
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
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

  private async onCheckoutCompleted(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const orgId = session.metadata?.orgId;
    const plan = session.metadata?.plan ?? 'STARTER';
    if (!orgId) {
      this.logger.warn('Checkout session missing orgId metadata');
      return;
    }

    this.logger.log(
      `Checkout completed for org ${orgId}, plan ${plan}, customer ${session.customer}`,
    );
    // The invoice.paid event will handle the actual plan update and invoice creation.
  }

  private async onInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
    const orgId = invoice.metadata?.orgId;
    if (!orgId) {
      this.logger.warn('Invoice paid but no orgId found in metadata');
      return;
    }

    this.logger.log(`Invoice ${invoice.id} paid for org ${orgId}`);
    // The actual plan update and invoice record creation is handled
    // by the BillingService which listens to this via the controller.
  }

  private async onSubscriptionChanged(
    subscription: Stripe.Subscription,
  ): Promise<void> {
    const orgId = subscription.metadata?.orgId;
    if (!orgId) {
      this.logger.warn('Subscription event missing orgId metadata');
      return;
    }

    this.logger.log(
      `Subscription ${subscription.id} status=${subscription.status} for org ${orgId}`,
    );
  }
}
