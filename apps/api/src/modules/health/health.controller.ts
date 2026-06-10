import { Controller, Get, HttpCode, HttpStatus, Inject, Res } from '@nestjs/common';
import { HealthResponse, ReadinessResponse } from '@pbx/contracts';
import type { FastifyReply } from 'fastify';
import { Public } from '../../common/guards/auth.guard.js';
import { CONFIG } from '../../common/tokens.js';
import type { AppConfig } from '../../config.js';
import { HealthService } from './health.service.js';

@Controller()
export class HealthController {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(HealthService) private readonly healthService: HealthService,
  ) {}

  @Public()
  @Get('health')
  async health(): Promise<HealthResponse> {
    const dependencies = await this.healthService.checkDependencies();
    return {
      status: this.healthService.aggregateStatus(dependencies),
      version: this.config.version,
      timestamp: new Date().toISOString(),
      dependencies,
    };
  }

  @Public()
  @Get('health/live')
  liveness(): { status: 'healthy' } {
    return { status: 'healthy' };
  }

  @Public()
  @Get('health/ready')
  @HttpCode(HttpStatus.OK)
  async readiness(@Res({ passthrough: true }) res: FastifyReply): Promise<ReadinessResponse> {
    const dependencies = await this.healthService.checkDependencies();
    const ready = this.healthService.isReady(dependencies);
    if (!ready) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return {
      status: ready ? 'healthy' : 'unhealthy',
      version: this.config.version,
      timestamp: new Date().toISOString(),
      dependencies,
      ready,
    };
  }
}
