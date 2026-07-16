import { Module } from '@nestjs/common';
import { ChannelsController } from './channels.controller.js';
import { ChannelsService } from './channels.service.js';
import { OzonCredentialsService } from './ozon-credentials.service.js';
import { OzonSellerApiClient } from './ozon-seller-api.client.js';
import { OzonExternalWriteService } from './ozon-external-write.service.js';
import { OzonProductPublishService } from './ozon-product-publish.service.js';
import { ActionProposalsModule } from '../notifications/action-proposals.module.js';
import { OzonOrderSyncWorker } from './ozon-order-sync.worker.js';
import { MarketplaceCompilerModule } from '../marketplace-compiler/marketplace-compiler.module.js';
import { CredentialKmsService } from './credential-kms.service.js';
import { OzonCustomerServiceController } from './ozon-customer-service.controller.js';
import { OzonCustomerServiceService } from './ozon-customer-service.service.js';
import { OzonPerformanceController } from './ozon-performance.controller.js';
import { OzonPerformanceApiClient } from './ozon-performance-api.client.js';
import { OzonPerformanceService } from './ozon-performance.service.js';
import { ListingPublishSnapshotModule } from '../product-launch/listing-publish-snapshot.module.js';
import { OzonChannelAdapter } from './ozon-channel-adapter.service.js';
import { OzonPublishPolicyService } from './ozon-publish-policy.service.js';

@Module({
  imports: [
    ActionProposalsModule,
    MarketplaceCompilerModule,
    ListingPublishSnapshotModule,
  ],
  controllers: [
    ChannelsController,
    OzonCustomerServiceController,
    OzonPerformanceController,
  ],
  providers: [
    ChannelsService,
    CredentialKmsService,
    OzonCredentialsService,
    OzonSellerApiClient,
    OzonPerformanceApiClient,
    OzonCustomerServiceService,
    OzonPerformanceService,
    OzonExternalWriteService,
    OzonChannelAdapter,
    OzonPublishPolicyService,
    OzonProductPublishService,
    OzonOrderSyncWorker,
  ],
  exports: [
    ChannelsService,
    OzonExternalWriteService,
    OzonChannelAdapter,
    OzonPublishPolicyService,
    OzonProductPublishService,
  ],
})
export class ChannelsModule {}
