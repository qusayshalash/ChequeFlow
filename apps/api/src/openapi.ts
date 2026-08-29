import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';

export const OPENAPI_PATH = 'docs';

export function buildOpenApiDocument(app: INestApplication, prefix: string): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('ChequeFlow API')
    .setDescription(
      [
        'Cheque custody and lifecycle API.',
        '',
        'Every status change goes through the central state machine and produces an',
        'immutable `cheque_events` row. The organization is always taken from the',
        'authenticated session — an `organizationId` sent by a client is ignored.',
      ].join('\n'),
    )
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .addServer(`/${prefix}/v1`)
    .addTag('auth', 'Authentication and sessions')
    .addTag('cheques', 'Cheques, images, OCR review and lifecycle actions')
    .addTag('contacts', 'Customers, suppliers and other counterparties')
    .addTag('reference', 'Branches, banks and storage locations')
    .addTag('reports', 'Dashboards, due reports, cash flow, custody and audit')
    .addTag('notifications', 'In-app reminders')
    .addTag('health', 'Service health')
    .build();

  return SwaggerModule.createDocument(app, config);
}
