import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthGuard, PermissionsGuard } from '../../common/guards/auth.guard.js';
import { ApiApplicationsModule } from '../api-applications/api-applications.module.js';
import { PlatformApiTokensModule } from '../platform-api-tokens/platform-api-tokens.module.js';

@Module({
  imports: [ApiApplicationsModule, PlatformApiTokensModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthGuard,
    PermissionsGuard,
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_GUARD, useExisting: PermissionsGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
