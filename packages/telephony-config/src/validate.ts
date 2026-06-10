import type { GeneratedTelephonyConfig } from './types.js';

const FORBIDDEN_PATTERNS = [
  /\[general\]/i,
  /\[transport-/i,
  /#include\s+\/etc/i,
  /system\s*\(/i,
  /exec\s*\(/i,
  /SHELL/i,
  /include\s+attempt/i,
];

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateGeneratedConfig(
  config: GeneratedTelephonyConfig,
  options?: { requireExtensions?: boolean },
): ValidationResult {
  const requireExtensions = options?.requireExtensions ?? true;
  const errors: string[] = [];
  const combined = `${config.pjsipTenants}\n${config.extensionsTenants}`;

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(combined)) {
      errors.push(`Forbidden configuration pattern: ${pattern}`);
    }
  }

  if (!config.pjsipTenants.includes('type=endpoint')) {
    errors.push('PJSIP configuration contains no endpoints');
  }

  if (!config.extensionsTenants.includes('[t_')) {
    errors.push('Dialplan contains no tenant contexts');
  }

  if (config.manifest.extensionCount === 0 && requireExtensions) {
    errors.push('No active extensions in configuration');
  }

  if (!config.manifest.checksum || config.manifest.checksum.length !== 64) {
    errors.push('Invalid configuration checksum');
  }

  return { valid: errors.length === 0, errors };
}

export function validateSyntaxBasic(content: string): ValidationResult {
  const errors: string[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.includes('\0')) {
      errors.push(`Invalid null byte at line ${i + 1}`);
    }
  }
  return { valid: errors.length === 0, errors };
}
