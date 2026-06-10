import { Injectable } from '@nestjs/common';
import { validationError } from '@pbx/contracts';
import { decryptSecret } from '@pbx/shared';
import type { AppConfig } from '../../config.js';

export type ValidationResult = {
  status: 'VALID' | 'INVALID' | 'CONFIGURED_NOT_TESTED';
  sanitizedError?: string;
};

@Injectable()
export class IntegrationValidatorService {
  validateStripeSecrets(secrets: Record<string, string>, environment: string): ValidationResult {
    const secretKey = secrets.secretKey ?? secrets.apiKey ?? '';
    const publishableKey = secrets.publishableKey ?? '';
    if (environment === 'test') {
      if (secretKey.startsWith('sk_live_')) {
        return { status: 'INVALID', sanitizedError: 'Live Stripe keys are not permitted in test mode' };
      }
      if (!secretKey.startsWith('sk_test_')) {
        return { status: 'INVALID', sanitizedError: 'Stripe test secret key required' };
      }
      if (publishableKey && !publishableKey.startsWith('pk_test_')) {
        return { status: 'INVALID', sanitizedError: 'Stripe test publishable key required' };
      }
    }
    if (environment === 'live') {
      if (!secretKey.startsWith('sk_live_')) {
        return { status: 'INVALID', sanitizedError: 'Stripe live secret key required for live mode' };
      }
    }
    if (!secrets.webhookSecret?.trim()) {
      return { status: 'CONFIGURED_NOT_TESTED', sanitizedError: 'Webhook signing secret not configured' };
    }
    return { status: 'VALID' };
  }

  validateOpenAiSecrets(secrets: Record<string, string>, config: Record<string, unknown>): ValidationResult {
    const apiKey = secrets.apiKey ?? secrets.api_key ?? '';
    if (!apiKey.trim()) {
      return { status: 'INVALID', sanitizedError: 'API key required' };
    }
    if (!String(config.model ?? process.env.OPENAI_REALTIME_MODEL ?? '').trim()) {
      return { status: 'CONFIGURED_NOT_TESTED', sanitizedError: 'Realtime model not configured' };
    }
    return { status: 'CONFIGURED_NOT_TESTED' };
  }

  async validateOpenAiConnection(
    secrets: Record<string, string>,
    config: Record<string, unknown>,
  ): Promise<ValidationResult> {
    const base = this.validateOpenAiSecrets(secrets, config);
    if (base.status === 'INVALID') return base;
    const apiKey = secrets.apiKey ?? secrets.api_key ?? '';
    const model = String(config.model ?? process.env.OPENAI_REALTIME_MODEL ?? 'gpt-4o-realtime-preview');
    const url = String(config.realtimeUrl ?? process.env.OPENAI_REALTIME_URL ?? 'https://api.openai.com/v1/models');
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      if (res.status === 401) {
        return { status: 'INVALID', sanitizedError: 'Provider authentication failed' };
      }
      if (res.status === 429) {
        return { status: 'INVALID', sanitizedError: 'Provider rate limit exceeded' };
      }
      if (!res.ok) {
        return { status: 'CONFIGURED_NOT_TESTED', sanitizedError: 'Provider health check incomplete' };
      }
      void model;
      return { status: 'VALID' };
    } catch {
      return { status: 'CONFIGURED_NOT_TESTED', sanitizedError: 'Provider connection could not be verified' };
    }
  }

  validateSipConfig(secrets: Record<string, string>, config: Record<string, unknown>): ValidationResult {
    const authMode = String(config.authMode ?? 'registration');
    if (authMode === 'registration') {
      if (!secrets.username?.trim() || !secrets.password?.trim()) {
        return { status: 'INVALID', sanitizedError: 'SIP username and password required for registration auth' };
      }
      if (!String(config.registrar ?? '').trim()) {
        return { status: 'INVALID', sanitizedError: 'SIP registrar required' };
      }
    }
    return { status: 'CONFIGURED_NOT_TESTED' };
  }

  rejectLiveStripeInTest(environment: string, secrets: Record<string, string>) {
    if (environment === 'test' && (secrets.secretKey ?? '').startsWith('sk_live_')) {
      throw validationError({ secretKey: 'Live Stripe keys rejected in test mode' });
    }
  }

  decryptPayload(encrypted: string, config: AppConfig): Record<string, string> {
    return JSON.parse(decryptSecret(encrypted, config.encryptionMasterKey)) as Record<string, string>;
  }
}
