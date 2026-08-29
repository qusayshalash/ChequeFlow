/**
 * Writes the OpenAPI document to `openapi.json` without starting a server.
 *
 * It runs against the compiled output on purpose: NestJS resolves its
 * dependencies from `emitDecoratorMetadata`, which the TypeScript-on-the-fly
 * runners (esbuild/tsx) do not emit.
 *
 * Usage: pnpm --filter @cheque-flow/api openapi:export
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, '..', 'dist');

const { NestFactory } = await import('@nestjs/core');
const { AppModule } = await import(path.join(dist, 'app.module.js'));
const { AppConfigService } = await import(path.join(dist, 'config/app-config.service.js'));
const { buildOpenApiDocument } = await import(path.join(dist, 'openapi.js'));

const app = await NestFactory.create(AppModule, { logger: ['error'] });
const config = app.get(AppConfigService);
const document = buildOpenApiDocument(app, config.globalPrefix);
const target = path.join(here, '..', 'openapi.json');
writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
await app.close();
console.warn(`OpenAPI document written to ${target}`);
process.exit(0);
