import 'reflect-metadata';

import { Logger, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';
import { OPENAPI_PATH, buildOpenApiDocument } from './openapi';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Buffer logs until configuration has been validated.
    bufferLogs: true,
  });
  const config = app.get(AppConfigService);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix(config.globalPrefix);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.use(
    helmet({
      // The API serves JSON only; a restrictive default CSP is appropriate.
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
  });

  if (config.trustProxy) {
    // Only enable behind a proxy you control, otherwise client IPs are spoofable.
    app.set('trust proxy', 1);
  }

  // JSON bodies are small; image uploads go through multipart with their own limit.
  app.useBodyParser('json', { limit: '256kb' });

  app.enableShutdownHooks();

  if (!config.isProduction) {
    const document = buildOpenApiDocument(app, config.globalPrefix);
    SwaggerModule.setup(`${config.globalPrefix}/${OPENAPI_PATH}`, app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
    logger.log(
      `OpenAPI UI: http://localhost:${config.port}/${config.globalPrefix}/${OPENAPI_PATH}`,
    );
  }

  await app.listen(config.port);
  logger.log(
    `ChequeFlow API listening on http://localhost:${config.port}/${config.globalPrefix}/v1 [${config.nodeEnv}]`,
  );
}

void bootstrap();
