import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  Headers,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BillingService } from './billing.service.js';
import { MeteringService } from './metering.service.js';
import { PaymentService } from './payment.service.js';
import { InvoiceService } from './invoice.service.js';
import { UpdatePlanDto } from './billing.dto.js';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard.js';
import { Public } from '../../shared/auth/public.decorator.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';

@ApiTags('Billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly metering: MeteringService,
    private readonly payment: PaymentService,
    private readonly invoices: InvoiceService,
  ) {}

  // ── Plan info ────────────────────────────────────────────────────────

  @Get('plans')
  @ApiOperation({ summary: 'Get available subscription plans with limits' })
  getPlans() {
    return this.billingService.getPlanInfo();
  }

  @Get('plan')
  @ApiOperation({ summary: 'Get current organization plan' })
  getCurrentPlan(@CurrentUser() user: JwtPayload) {
    return this.billingService.getCurrentPlan(user);
  }

  @Post('plan')
  @ApiOperation({ summary: 'Update organization subscription plan' })
  updatePlan(@CurrentUser() user: JwtPayload, @Body() dto: UpdatePlanDto) {
    return this.billingService.updatePlan(user, dto);
  }

  // ── Usage ────────────────────────────────────────────────────────────

  @Get('usage')
  @ApiOperation({ summary: 'Get current usage stats with quota limits' })
  async getUsage(@CurrentUser() user: JwtPayload) {
    const orgId = user.orgId!;
    const usage = await this.billingService.getUsage(user);

    const [products, agentRuns, members, storage, workspaces] =
      await Promise.all([
        this.metering.checkQuota(orgId, 'products'),
        this.metering.checkQuota(orgId, 'agentRuns'),
        this.metering.checkQuota(orgId, 'members'),
        this.metering.checkQuota(orgId, 'storage'),
        this.metering.checkQuota(orgId, 'workspaces'),
      ]);

    return {
      ...usage,
      quotas: {
        products: { used: products.used, limit: products.limit },
        agentRuns: { used: agentRuns.used, limit: agentRuns.limit },
        members: { used: members.used, limit: members.limit },
        storage: { used: storage.used, limit: storage.limit },
        workspaces: { used: workspaces.used, limit: workspaces.limit },
      },
    };
  }

  // ── Invoices ─────────────────────────────────────────────────────────

  @Get('invoices')
  @ApiOperation({ summary: 'List invoices with pagination' })
  async getInvoices(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const orgId = user.orgId!;
    const p = Math.max(1, Number(page) || 1);
    const l = Math.min(100, Math.max(1, Number(limit) || 20));
    return this.invoices.findAll(orgId, p, l);
  }

  @Get('invoices/:id')
  @ApiOperation({ summary: 'Get invoice detail' })
  async getInvoice(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.invoices.findOne(id, user.orgId!);
  }

  // ── Stripe Checkout ──────────────────────────────────────────────────

  @Post('create-checkout-session')
  @ApiOperation({ summary: 'Create a Stripe checkout session for a plan' })
  async createCheckoutSession(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdatePlanDto,
  ) {
    const orgId = user.orgId!;
    const url = await this.payment.createCheckoutSession(dto.plan, orgId);
    return { url };
  }

  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stripe webhook handler (public)' })
  async handleWebhook(
    @Req() req: any,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!signature) {
      return { received: false, error: 'Missing stripe-signature header' };
    }
    const payload = req.rawBody ?? JSON.stringify(req.body);
    return this.payment.handleWebhook(payload, signature);
  }

  @Get('portal')
  @ApiOperation({ summary: 'Create a Stripe customer portal session' })
  async createPortalSession(@CurrentUser() user: JwtPayload) {
    const orgId = user.orgId!;
    const url = await this.payment.createPortalSession(orgId, orgId);
    return { url };
  }
}
