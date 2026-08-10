// OTel must be imported before any other module so auto-instrumentation
// can patch them (no-op unless OTEL_ENABLED=1).
import './instrumentation.js';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureHttpApplication } from './bootstrap/http-application.js';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const configService = app.get(ConfigService);
  const isProduction = configService.get<string>('NODE_ENV') === 'production';
  configureHttpApplication(app, configService);

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
  logger.log(`ShopMate AI API is running on http://localhost:${port}`);
  logger.log(`Health: http://localhost:${port}/api/v1/health`);
  logger.log(`Ready:  http://localhost:${port}/api/v1/ready`);
  if (!isProduction) {
    logger.log(`Swagger: http://localhost:${port}/api/docs`);
  }
}

void bootstrap().catch((error: unknown) => {
  logger.error(
    'Application bootstrap failed',
    error instanceof Error ? error.stack : String(error),
  );
  process.exitCode = 1;
});
