import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import { setupOpenApi } from './openapi.js';

/** Generate apps/api/openapi/openapi.json without starting the HTTP server. */
async function generateOpenApiArtifact() {
  process.env.NODE_ENV ??= 'test';
  process.env.PUBLIC_API_URL ??= 'http://127.0.0.1:3001';
  process.env.PUBLIC_WEB_URL ??= 'http://127.0.0.1:3000';
  process.env.DATABASE_URL ??= 'postgresql://pbx:pbx_dev_password@127.0.0.1:5433/pbx?sslmode=disable';
  process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
  process.env.NATS_URL ??= 'nats://127.0.0.1:4222';
  process.env.JWT_SECRET ??= 'a'.repeat(64);
  process.env.ENCRYPTION_MASTER_KEY ??= '0123456789abcdef'.repeat(4);

  const { loadConfig } = await import('./config.js');
  const config = loadConfig();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(config),
    new FastifyAdapter({ logger: false }),
  );
  await app.init();
  setupOpenApi(app);
  await app.close();
  console.log('Generated apps/api/openapi/openapi.json');
  process.exit(0);
}

generateOpenApiArtifact().catch((err) => {
  console.error(err);
  process.exit(1);
});
