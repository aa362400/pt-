import { Global, Module } from '@nestjs/common';
import { LoggerService_ } from './logger.service.js';

@Global()
@Module({
  providers: [LoggerService_],
  exports: [LoggerService_],
})
export class LoggerModule {}
