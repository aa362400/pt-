import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module.js';
import { GlobalExceptionFilter } from './shared/errors/filters.js';

async function bootstrap() {
  // Custom body parser: image generation runs carry base64 product photos
  // (~13MB for a 10MB image), far above Express's 100kb default.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  // Keep the raw request body available (req.rawBody) — Stripe webhook
  // signature verification must run against the exact bytes received.
  app.use(
    json({
      limit: '50mb',
      verify: (req, _res, buf) => {
        (req as { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  const configService = app.get(ConfigService);
  const isProduction = configService.get<string>('NODE_ENV') === 'production';

  // API global prefix
  app.setGlobalPrefix('api/v1');

  // Security headers
  app.use(helmet());

  // Cookie parser
  app.use(cookieParser());

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Unified error responses ({ error: { code, message }, requestId })
  app.useGlobalFilters(new GlobalExceptionFilter(configService));

  // CORS — explicit whitelist; "*" is only accepted outside production
  // (enforced by env validation) and must not be combined with credentials.
  const corsOrigins = configService.get<string>('CORS_ORIGINS', '*');
  if (corsOrigins === '*') {
    app.enableCors({
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    });
  } else {
    app.enableCors({
      origin: corsOrigins.split(',').map((o: string) => o.trim()),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    });
  }

  // Swagger / OpenAPI — disabled in production to reduce attack surface
  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('ShopMate AI API')
      .setDescription('AI-powered e-commerce backend API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
  console.log(`ShopMate AI API is running on http://localhost:${port}`);
  console.log(`Health: http://localhost:${port}/api/v1/health`);
  console.log(`Ready:  http://localhost:${port}/api/v1/ready`);
  if (!isProduction) {
    console.log(`Swagger: http://localhost:${port}/api/docs`);
  }
}

void bootstrap();
