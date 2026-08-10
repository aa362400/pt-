import { Module } from '@nestjs/common';
import { AgentRuntimeModule } from './agent-runtime.module.js';
import { HttpPlatformModule } from './http-platform.module.js';

@Module({
  imports: [HttpPlatformModule, AgentRuntimeModule],
  exports: [HttpPlatformModule, AgentRuntimeModule],
})
export class PlatformModule {}
