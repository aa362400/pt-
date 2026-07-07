import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MockAgentProvider } from './mock-agent.provider.js';
import { HttpAgentProvider } from './http-agent.provider.js';
import type { AgentProviderInterface } from './agent-provider.interface.js';

export const AGENT_PROVIDER = 'AGENT_PROVIDER';

@Module({
  providers: [
    {
      provide: AGENT_PROVIDER,
      useFactory: (configService: ConfigService): AgentProviderInterface => {
        const baseUrl = configService.get<string>('AGENT_BASE_URL');
        const apiKey = configService.get<string>('AGENT_API_KEY');
        const logger = new Logger('AgentModule');
        if (baseUrl && apiKey) {
          logger.log(`Using HttpAgentProvider → ${baseUrl}`);
          return new HttpAgentProvider(configService);
        }
        logger.warn(
          'AGENT_BASE_URL / AGENT_API_KEY not configured — using MockAgentProvider (fake results)',
        );
        return new MockAgentProvider();
      },
      inject: [ConfigService],
    },
  ],
  exports: [AGENT_PROVIDER],
})
export class AgentModule {}
