import 'reflect-metadata';

import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  // Typed as the Express application so `set('trust proxy')` is available —
  // without it req.ip is the Caddy container, and every audit log records the
  // same useless address.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log'],
    // We terminate TLS at Caddy, which sits behind Cloudflare.
    bodyParser: true,
  });

  const config = app.get(ConfigService);
  const logger = new Logger('bootstrap');

  app.set('trust proxy', 1); // Caddy -> Cloudflare, so req.ip is the real client

  app.use(
    helmet({
      contentSecurityPolicy: false, // API returns JSON, not HTML
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.enableCors({
    origin: [
      config.getOrThrow<string>('APP_BASE_URL'),
      config.get<string>('ADMIN_WEB_URL') ?? '',
      config.get<string>('FAMILY_WEB_URL') ?? '',
      // The console is a browser app on its own origin like the other two. It
      // was missing here, so every request it made was blocked by CORS before
      // it reached a route — invisible until someone could finally log in.
      config.get<string>('CONTROL_WEB_URL') ?? '',
    ].filter(Boolean),
    credentials: true,
    exposedHeaders: ['X-Request-Id'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // Reject unknown fields rather than silently dropping them — a client
      // sending `tenantId` in a body should get a loud error, not silence.
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.setGlobalPrefix('v1', { exclude: ['health', 'internal/verify-file-access'] });
  app.enableShutdownHooks();

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port, '0.0.0.0');

  logger.log(`School All Ways API listening on :${port} (${config.get('NODE_ENV')})`);
}

void bootstrap();
