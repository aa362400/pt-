import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MockAgentProvider } from './mock-agent.provider.js';
import { HttpAgentProvider } from './http-agent.provider.js';
import { AgentHealthService } from './agent-health.service.js';
import type { AgentProviderInterface } from './agent-provider.interface.js';

export const AGENT_PROVIDER = 'AGENT_PROVIDER';

export function createAgentProvider(
  configService: ConfigService,
): AgentProviderInterface {
  const baseUrl = configService.get<string>('AGENT_BASE_URL');
  const apiKey = configService.get<string>('AGENT_API_KEY');
  const allowMock = configService.get<boolean>('AGENT_ALLOW_MOCK') ?? true;
  const logger = new Logger('AgentModule');

  if (baseUrl && apiKey?.trim()) {
    logger.log(`Using HttpAgentProvider at ${baseUrl}`);
    return new HttpAgentProvider(configService);
  }

  if (!allowMock) {
    throw new Error(
      'Real agent configuration is required: set AGENT_BASE_URL and AGENT_API_KEY',
    );
  }

  logger.warn(
    'AGENT_ALLOW_MOCK=true: using MockAgentProvider with fake results',
  );
  return new MockAgentProvider();
}

@Module({
  providers: [
    AgentHealthService,
    {
      provide: AGENT_PROVIDER,
      useFactory: createAgentProvider,
      inject: [ConfigService],
    },
  ],
  exports: [AGENT_PROVIDER, AgentHealthService],
})
export class AgentModule {}
