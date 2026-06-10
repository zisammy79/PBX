import { Global, Module } from '@nestjs/common';
import { createDatabase } from '@pbx/database';
import { CONFIG, DATABASE } from '../common/tokens.js';
import { resolveDatabaseUrl, type AppConfig } from '../config.js';

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      inject: [CONFIG],
      useFactory: (config: AppConfig) =>
        createDatabase({ url: resolveDatabaseUrl(config) }),
    },
  ],
  exports: [DATABASE],
})
export class DatabaseModule {}
