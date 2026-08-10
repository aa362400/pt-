import { Module } from '@nestjs/common';
import { AgentProxyController } from './agent-proxy.controller.js';
import { AgentAutonomyModule } from '../agent-autonomy/agent-autonomy.module.js';
import { AgentRunsModule } from '../agent-runs/agent-runs.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AgentModule } from '../../agents/agent.module.js';
import { LinkfoxSkillCliService } from '../../shared/linkfox-skill/linkfox-skill-cli.service.js';
import { CommerceMcpClientService } from '../../shared/commerce-mcp/commerce-mcp-client.service.js';
import { AgentCapabilityTokenService } from './agent-capability-token.service.js';
import { CommerceMcpTrustService } from '../../shared/commerce-mcp/commerce-mcp-trust.service.js';

@Module({
  imports: [
    AgentModule,
    AgentAutonomyModule,
    AgentRunsModule,
    NotificationsModule,
  ],
  controllers: [AgentProxyController],
  providers: [
    LinkfoxSkillCliService,
    CommerceMcpClientService,
    CommerceMcpTrustService,
    AgentCapabilityTokenService,
  ],
})
export class AgentProxyModule {}
