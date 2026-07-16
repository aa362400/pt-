import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

@Module({
  imports: [BillingModule, NotificationsModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
