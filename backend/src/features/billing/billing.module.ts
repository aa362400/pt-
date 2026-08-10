import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller.js';
import { BillingService } from './billing.service.js';
import { BillingRepository } from './billing.repository.js';
import { MeteringService } from './metering.service.js';
import { PaymentService } from './payment.service.js';
import { InvoiceService } from './invoice.service.js';
import { QuotaGuard } from '../../shared/guards/quota.guard.js';
import { QuotaInterceptor } from '../../shared/interceptors/quota.interceptor.js';

@Module({
  controllers: [BillingController],
  providers: [
    BillingService,
    BillingRepository,
    MeteringService,
    PaymentService,
    InvoiceService,
    QuotaGuard,
    QuotaInterceptor,
  ],
  exports: [
    BillingService,
    MeteringService,
    InvoiceService,
    QuotaGuard,
    QuotaInterceptor,
  ],
})
export class BillingModule {}
