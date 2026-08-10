import { Module } from '@nestjs/common';
import { ProductResearchModule } from '../product-research/product-research.module.js';
import { ProductLaunchService } from './product-launch.service.js';
import { FilesModule } from '../files/files.module.js';
import { ListingPublishSnapshotModule } from './listing-publish-snapshot.module.js';
import { ExternalSubmissionsService } from './external-submissions.service.js';
import { ListingSandboxModule } from '../listing-sandbox/listing-sandbox.module.js';
import { ChannelsModule } from '../channels/channels.module.js';
import { ProductLaunchRecoveryService } from './product-launch-recovery.service.js';
import { ActionProposalsModule } from '../notifications/action-proposals.module.js';

@Module({
  imports: [
    ProductResearchModule,
    FilesModule,
    ListingPublishSnapshotModule,
    ListingSandboxModule,
    ChannelsModule,
    ActionProposalsModule,
  ],
  providers: [
    ProductLaunchService,
    ExternalSubmissionsService,
    ProductLaunchRecoveryService,
  ],
  exports: [
    ProductLaunchService,
    ExternalSubmissionsService,
    ProductLaunchRecoveryService,
  ],
})
export class ProductLaunchModule {}
