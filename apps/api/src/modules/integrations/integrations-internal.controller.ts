import { timingSafeEqual } from 'node:crypto';
import { Body, Controller, Get, Headers, Header, Inject, Post, UnauthorizedException } from '@nestjs/common';
import { validationError } from '@pbx/contracts';
import { CONFIG } from '../../common/tokens.js';
import type { AppConfig } from '../../config.js';
import { CredentialResolverService } from './credential-resolver.service.js';

@Controller('internal/integrations')
export class IntegrationsInternalController {
  constructor(
    @Inject(CredentialResolverService) private readonly resolver: CredentialResolverService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  @Get('health')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  @Header('Pragma', 'no-cache')
  health(@Headers('authorization') authorization: string | undefined) {
    if (!this.verifyInternalToken(authorization)) {
      throw new UnauthorizedException();
    }
    return { resolverAvailable: true };
  }

  @Post('status')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  @Header('Pragma', 'no-cache')
  async status(
    @Headers('authorization') authorization: string | undefined,
    @Body()
    body: {
      integrationType: 'ai' | 'sip_carrier' | 'stripe';
      provider: string;
      tenantId?: string;
      environment?: string;
    },
  ) {
    if (!this.verifyInternalToken(authorization)) {
      throw new UnauthorizedException();
    }
    try {
      return await this.resolver.resolveMetadata(body);
    } catch {
      return { configured: false, credentialSource: 'NOT_CONFIGURED' };
    }
  }

  @Post('resolve')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  @Header('Pragma', 'no-cache')
  async resolve(
    @Headers('authorization') authorization: string | undefined,
    @Body()
    body: {
      integrationType: 'ai' | 'sip_carrier' | 'stripe';
      provider: string;
      tenantId?: string;
      environment?: string;
    },
  ) {
    if (!this.verifyInternalToken(authorization)) {
      throw new UnauthorizedException({ error: 'CREDENTIAL_RESOLUTION_DENIED', message: 'credential resolution denied' });
    }

    try {
      const resolved = await this.resolver.resolve(body);
      return {
        credentialSource: resolved.source,
        connectionId: resolved.connectionId,
        credentialVersion: resolved.credentialVersion,
        provider: resolved.provider,
        integrationType: resolved.integrationType,
        environment: resolved.environment,
        config: resolved.config,
        secrets: resolved.secrets,
      };
    } catch (err) {
      const category = this.mapResolveFailure(err);
      throw validationError({ error: category, message: this.sanitizeFailureMessage(category) });
    }
  }

  private verifyInternalToken(authorization: string | undefined): boolean {
    const expected = process.env.INTERNAL_SERVICE_TOKEN ?? '';
    if (!expected) return false;
    if (!authorization?.startsWith('Bearer ')) return false;
    const provided = authorization.slice('Bearer '.length);
    try {
      const a = Buffer.from(provided);
      const b = Buffer.from(expected);
      if (a.length !== b.length) return false;
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  private mapResolveFailure(err: unknown): string {
    if (err && typeof err === 'object' && 'details' in err) {
      const details = (err as { details?: Record<string, unknown> }).details;
      if (details?.integration === 'CREDENTIAL_DISABLED') return 'CREDENTIAL_DISABLED';
    }
    const message = err instanceof Error ? err.message.toLowerCase() : '';
    if (message.includes('disabled')) return 'CREDENTIAL_DISABLED';
    if (message.includes('decrypt')) return 'CREDENTIAL_DECRYPTION_FAILED';
    return 'CREDENTIAL_NOT_CONFIGURED';
  }

  private sanitizeFailureMessage(category: string): string {
    switch (category) {
      case 'CREDENTIAL_DISABLED':
        return 'assigned integration credential is disabled';
      case 'CREDENTIAL_DECRYPTION_FAILED':
        return 'credential decryption failed';
      case 'CREDENTIAL_RESOLUTION_DENIED':
        return 'credential resolution denied';
      default:
        return 'integration credential not configured';
    }
  }
}
