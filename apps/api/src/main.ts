import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import { AppModule } from './app.module.js';
import { loadConfig } from './config.js';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter.js';
import { CorrelationInterceptor } from './common/interceptors/correlation.interceptor.js';
import { setupOpenApi } from './openapi.js';

async function bootstrap() {
  const config = loadConfig();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(config),
    new FastifyAdapter({ logger: config.logLevel === 'debug' }),
  );

  await app.register(fastifyHelmet as never, {
    contentSecurityPolicy: config.nodeEnv === 'production',
  });
  await app.register(fastifyCors as never, {
    origin: config.publicWebUrl,
    credentials: true,
  });
  await app.register(fastifyCookie as never);

  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new CorrelationInterceptor());
  setupOpenApi(app);

  await app.listen(config.apiPort, config.apiBindHost);
  console.log(`API listening on http://${config.apiBindHost}:${config.apiPort}/api/v1`);
  console.log(`OpenAPI docs at http://${config.apiBindHost}:${config.apiPort}/api/v1/openapi`);
}

bootstrap().catch((err) => {
  console.error('Failed to start API:', err);
  process.exit(1);
});
