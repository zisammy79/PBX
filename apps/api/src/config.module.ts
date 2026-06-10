import { DynamicModule, Global, Module } from '@nestjs/common';
import type { AppConfig } from './config.js';
import { CONFIG } from './common/tokens.js';

@Global()
@Module({})
export class ConfigModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: CONFIG, useValue: config }],
      exports: [CONFIG],
    };
  }
}
