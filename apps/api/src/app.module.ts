import { DynamicModule, Module } from '@nestjs/common';
import type { AppConfig } from './config.js';
import { ConfigModule } from './config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { TenantsModule } from './modules/tenants/tenants.module.js';
import { ExtensionsModule } from './modules/extensions/extensions.module.js';
import { CallsModule } from './modules/calls/calls.module.js';
import { TelephonyModule } from './modules/telephony/telephony.module.js';
import { AiModule } from './modules/ai/ai.module.js';
import { BillingModule } from './modules/billing/billing.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { RedisModule } from './redis/redis.module.js';
import { ApiApplicationsModule } from './modules/api-applications/api-applications.module.js';
import { WebhooksModule } from './modules/webhooks/webhooks.module.js';
import { EventsModule } from './modules/events/events.module.js';
import { PstnModule } from './modules/pstn/pstn.module.js';
import { StripeModule } from './modules/stripe/stripe.module.js';

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        DatabaseModule,
        AuthModule,
        HealthModule,
        TenantsModule,
        ExtensionsModule,
        CallsModule,
        TelephonyModule,
        AiModule,
        BillingModule,
        DashboardModule,
        RedisModule,
        ApiApplicationsModule,
        WebhooksModule,
        EventsModule,
        PstnModule,
        StripeModule,
      ],
    };
  }
}
